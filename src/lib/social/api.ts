import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export type MediaType = "none" | "image" | "video" | "link";

export type PostRow = {
  id: string;
  author_id: string;
  content: string;
  media_urls: string[];
  media_type: MediaType;
  link_url: string | null;
  category: string | null;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PostWithMeta = PostRow & {
  author: Profile | null;
  tags: string[];
  likes: number;
  favorites: number;
  comments_count: number;
  reposts_count: number;
  my_like: boolean;
  my_favorite: boolean;
  my_repost: boolean;
  signed_media: string[];
  signed_cover: string | null;
};


export type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  deleted_at: string | null;
  author?: Profile | null;
  likes?: number;
  my_like?: boolean;
  replies?: CommentRow[];
};

const MEDIA_BUCKET = "post-media";

export async function signMediaUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const out: string[] = [];
  for (const p of paths) {
    if (/^https?:\/\//.test(p)) { out.push(p); continue; }
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(p, 60 * 60 * 24 * 7);
    if (data?.signedUrl) out.push(data.signedUrl);
  }
  return out;
}

export async function uploadMedia(file: File, userId: string): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

export async function fetchFeed(opts: { search?: string; tag?: string; category?: string; includeGames?: boolean } = {}): Promise<PostWithMeta[]> {
  let q = supabase.from("posts").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  if (opts.search) q = q.ilike("content", `%${opts.search}%`);
  if (opts.category) q = q.eq("category", opts.category);
  else if (!opts.includeGames) q = q.or("category.is.null,category.neq.game");
  const { data: posts, error } = await q;
  if (error) throw error;
  if (!posts || !posts.length) return [];

  const ids = posts.map(p => p.id);
  const authorIds = Array.from(new Set(posts.map(p => p.author_id)));
  const { data: { user } } = await supabase.auth.getUser();
  const me = user?.id ?? null;

  const [profiles, reactions, comments, reposts, tagsJoin] = await Promise.all([
    supabase.from("profiles").select("*").in("id", authorIds),
    supabase.from("reactions").select("post_id,user_id,type").in("post_id", ids),
    supabase.from("comments").select("post_id").in("post_id", ids).is("deleted_at", null),
    supabase.from("reposts").select("post_id,user_id").in("post_id", ids),
    supabase.from("post_tags").select("post_id,tags(name)").in("post_id", ids),
  ]);

  const pmap = new Map((profiles.data ?? []).map(p => [p.id, p as Profile]));
  const tagMap = new Map<string, string[]>();
  for (const row of (tagsJoin.data ?? []) as Array<{ post_id: string; tags: { name: string } | null }>) {
    const arr = tagMap.get(row.post_id) ?? [];
    if (row.tags?.name) arr.push(row.tags.name);
    tagMap.set(row.post_id, arr);
  }

  let tagFiltered = posts;
  if (opts.tag) tagFiltered = posts.filter(p => (tagMap.get(p.id) ?? []).includes(opts.tag!));

  const result: PostWithMeta[] = [];
  for (const p of tagFiltered) {
    const r = (reactions.data ?? []).filter(x => x.post_id === p.id);
    const likes = r.filter(x => x.type === "like").length;
    const favs = r.filter(x => x.type === "favorite").length;
    const my_like = !!me && r.some(x => x.user_id === me && x.type === "like");
    const my_favorite = !!me && r.some(x => x.user_id === me && x.type === "favorite");
    const c = (comments.data ?? []).filter(x => x.post_id === p.id).length;
    const reps = (reposts.data ?? []).filter(x => x.post_id === p.id);
    const my_repost = !!me && reps.some(x => x.user_id === me);
    const signed = await signMediaUrls(p.media_urls ?? []);
    const signedCover = p.cover_url ? (await signMediaUrls([p.cover_url]))[0] ?? null : null;
    result.push({
      ...(p as PostRow),
      author: pmap.get(p.author_id) ?? null,
      tags: tagMap.get(p.id) ?? [],
      likes, favorites: favs, comments_count: c, reposts_count: reps.length,
      my_like, my_favorite, my_repost,
      signed_media: signed,
      signed_cover: signedCover,
    });

  }
  return result;
}

export async function createPost(input: {
  content: string;
  files: File[];
  mediaType: MediaType;
  linkUrl?: string;
  category?: string;
  tags: string[];
}): Promise<PostRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const paths: string[] = [];
  for (const f of input.files) {
    paths.push(await uploadMedia(f, user.id));
  }

  const { data: post, error } = await supabase.from("posts").insert({
    author_id: user.id,
    content: input.content,
    media_urls: paths,
    media_type: input.mediaType,
    link_url: input.linkUrl || null,
    category: input.category || null,
  }).select().single();
  if (error) throw error;

  if (input.tags.length) {
    const names = Array.from(new Set(input.tags.map(t => t.trim().toLowerCase()).filter(Boolean)));
    for (const name of names) {
      let { data: tag } = await supabase.from("tags").select("id").eq("name", name).maybeSingle();
      if (!tag) {
        const { data: created } = await supabase.from("tags").insert({ name }).select().single();
        tag = created;
      }
      if (tag) await supabase.from("post_tags").insert({ post_id: post!.id, tag_id: tag.id });
    }
  }
  return post as PostRow;
}

export async function updatePost(id: string, patch: { content?: string; category?: string | null }) {
  const { error } = await supabase.from("posts").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletePost(id: string) {
  const { error } = await supabase.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function toggleReaction(opts: { postId?: string; commentId?: string; type: "like" | "favorite" }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const q = supabase.from("reactions").select("id").eq("user_id", user.id).eq("type", opts.type);
  const { data: existing } = opts.postId
    ? await q.eq("post_id", opts.postId).maybeSingle()
    : await q.eq("comment_id", opts.commentId!).maybeSingle();
  if (existing) {
    await supabase.from("reactions").delete().eq("id", existing.id);
    return false;
  }
  await supabase.from("reactions").insert({
    user_id: user.id,
    post_id: opts.postId ?? null,
    comment_id: opts.commentId ?? null,
    type: opts.type,
  });
  return true;
}

export async function toggleRepost(postId: string, quote?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: existing } = await supabase.from("reposts").select("id").eq("user_id", user.id).eq("post_id", postId).maybeSingle();
  if (existing) {
    await supabase.from("reposts").delete().eq("id", existing.id);
    return false;
  }
  await supabase.from("reposts").insert({ user_id: user.id, post_id: postId, quote: quote || null });
  return true;
}

export async function fetchComments(postId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase.from("comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CommentRow[];
  const authorIds = Array.from(new Set(rows.map(r => r.author_id)));
  const { data: profiles } = await supabase.from("profiles").select("*").in("id", authorIds);
  const pmap = new Map((profiles ?? []).map(p => [p.id, p as Profile]));
  const { data: { user } } = await supabase.auth.getUser();
  const me = user?.id ?? null;
  const ids = rows.map(r => r.id);
  const { data: reactions } = await supabase.from("reactions").select("comment_id,user_id,type").in("comment_id", ids);

  const byId = new Map<string, CommentRow>();
  rows.forEach(r => {
    const rs = (reactions ?? []).filter(x => x.comment_id === r.id && x.type === "like");
    byId.set(r.id, {
      ...r,
      author: pmap.get(r.author_id) ?? null,
      likes: rs.length,
      my_like: !!me && rs.some(x => x.user_id === me),
      replies: [],
    });
  });
  const top: CommentRow[] = [];
  byId.forEach(r => {
    if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id)!.replies!.push(r);
    else top.push(r);
  });
  return top;
}

export async function addComment(postId: string, content: string, parentId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("comments").insert({
    post_id: postId, author_id: user.id, parent_id: parentId ?? null, content,
  });
  if (error) throw error;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function reportContent(opts: { postId?: string; commentId?: string; reason: string }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    post_id: opts.postId ?? null,
    comment_id: opts.commentId ?? null,
    reason: opts.reason,
  });
  if (error) throw error;
}

export async function blockUser(blockedId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: blockedId });
}

export async function fetchNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = data ?? [];
  const actorIds = Array.from(new Set(rows.map(r => r.actor_id).filter(Boolean))) as string[];
  const { data: profiles } = await supabase.from("profiles").select("*").in("id", actorIds);
  const pmap = new Map((profiles ?? []).map(p => [p.id, p as Profile]));
  return rows.map(r => ({ ...r, actor: r.actor_id ? pmap.get(r.actor_id) ?? null : null }));
}

export async function markNotificationsRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
}

export async function getMyProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile) ?? null;
}

export async function isMod(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return (data ?? []).some(r => r.role === "moderator" || r.role === "admin");
}

// ---------- Published games ----------
async function upsertTagsFor(postId: string, tags?: string[]) {
  if (!tags?.length) return;
  const names = Array.from(new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean)));
  for (const name of names) {
    let { data: tag } = await supabase.from("tags").select("id").eq("name", name).maybeSingle();
    if (!tag) {
      const { data: created } = await supabase.from("tags").insert({ name }).select().single();
      tag = created;
    }
    if (tag) await supabase.from("post_tags").insert({ post_id: postId, tag_id: tag.id }).select();
  }
}

export async function publishGame(input: {
  project: unknown;
  title: string;
  description?: string;
  tags?: string[];
  coverFile?: File | null;
}): Promise<PostRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const json = JSON.stringify(input.project);
  const file = new File([json], `${input.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "game"}.asternal.json`, {
    type: "application/json",
  });
  const path = await uploadMedia(file, user.id);
  const coverPath = input.coverFile ? await uploadMedia(input.coverFile, user.id) : null;
  const content = `🎮 ${input.title}${input.description ? "\n\n" + input.description : ""}`;
  const { data: post, error } = await supabase.from("posts").insert({
    author_id: user.id,
    content,
    media_urls: [path],
    media_type: "none",
    link_url: null,
    category: "game",
    cover_url: coverPath,
  }).select().single();
  if (error) throw error;
  await upsertTagsFor(post!.id, input.tags);
  return post as PostRow;
}

export async function updateGame(postId: string, input: {
  project?: unknown;
  title: string;
  description?: string;
  tags?: string[];
  coverFile?: File | null;
  removeCover?: boolean;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const patch: Record<string, unknown> = {
    content: `🎮 ${input.title}${input.description ? "\n\n" + input.description : ""}`,
  };
  if (input.project !== undefined) {
    const json = JSON.stringify(input.project);
    const file = new File([json], `${input.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "game"}.asternal.json`, { type: "application/json" });
    const path = await uploadMedia(file, user.id);
    patch.media_urls = [path];
  }
  if (input.coverFile) {
    patch.cover_url = await uploadMedia(input.coverFile, user.id);
  } else if (input.removeCover) {
    patch.cover_url = null;
  }
  const { error } = await supabase.from("posts").update(patch).eq("id", postId);
  if (error) throw error;
  if (input.tags) {
    await supabase.from("post_tags").delete().eq("post_id", postId);
    await upsertTagsFor(postId, input.tags);
  }
}

export async function fetchGames(opts: { search?: string } = {}): Promise<PostWithMeta[]> {
  return fetchFeed({ ...opts, category: "game" });
}

export async function loadGameProject(signedUrl: string): Promise<unknown> {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error("No se pudo cargar el juego");
  return await res.json();
}

// ---------- Cloud project sync ----------
export type CloudProject = {
  id: string;
  user_id: string;
  name: string;
  data: unknown;
  published_post_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function cloudListProjects(): Promise<CloudProject[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from("user_projects").select("id,user_id,name,data,published_post_id,created_at,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CloudProject[];
}

export async function cloudSaveProject(input: { id?: string; name: string; data: unknown }): Promise<CloudProject> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (input.id) {
    const { data, error } = await supabase.from("user_projects")
      .update({ name: input.name, data: input.data as never })
      .eq("id", input.id).eq("user_id", user.id)
      .select().single();
    if (error) throw error;
    return data as CloudProject;
  }
  const { data, error } = await supabase.from("user_projects")
    .insert({ user_id: user.id, name: input.name, data: input.data as never })
    .select().single();
  if (error) throw error;
  return data as CloudProject;
}

export async function cloudDeleteProject(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("user_projects").delete().eq("id", id).eq("user_id", user.id);
}

// ---------- Admin ----------
export type ManagedUser = { id: string; username: string; display_name: string | null; is_mod: boolean; is_admin: boolean };

export async function isAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return (data ?? []).some(r => r.role === "admin");
}

export async function listManagedUsers(search?: string): Promise<ManagedUser[]> {
  let q = supabase.from("profiles").select("id,username,display_name").limit(200);
  if (search) q = q.ilike("username", `%${search}%`);
  const { data: profs, error } = await q;
  if (error) throw error;
  const ids = (profs ?? []).map(p => p.id);
  if (!ids.length) return [];
  const { data: roles } = await supabase.from("user_roles").select("user_id,role").in("user_id", ids);
  const rmap = new Map<string, string[]>();
  (roles ?? []).forEach(r => {
    const arr = rmap.get(r.user_id) ?? [];
    arr.push(r.role);
    rmap.set(r.user_id, arr);
  });
  return (profs ?? []).map(p => {
    const rs = rmap.get(p.id) ?? [];
    return { ...p, is_mod: rs.includes("moderator"), is_admin: rs.includes("admin") };
  });
}

export async function setUserModerator(userId: string, on: boolean): Promise<void> {
  if (on) {
    await supabase.from("user_roles").insert({ user_id: userId, role: "moderator" });
  } else {
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "moderator");
  }
}

