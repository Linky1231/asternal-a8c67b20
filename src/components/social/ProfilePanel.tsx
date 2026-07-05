import { useEffect, useRef, useState } from "react";
import { Loader2, Camera, Save, Gamepad2, Newspaper, CheckCircle2 } from "lucide-react";
import {
  type Profile,
  type PostWithMeta,
  fetchProfileById,
  fetchUserPosts,
  updateMyProfile,
  uploadAvatar,
  getMyProfile,
} from "@/lib/social/api";
import { GameCard } from "./GameCard";
import { PostCard } from "./PostCard";

export function ProfilePanel({
  userId, myId, isMod, viewingOwn,
}: {
  userId: string; myId: string | null; isMod: boolean; viewingOwn: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"games" | "posts">("games");
  const [games, setGames] = useState<PostWithMeta[]>([]);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [contentLoading, setContentLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const p = viewingOwn ? await getMyProfile() : await fetchProfileById(userId);
      setProfile(p);
      if (p) {
        setUsername(p.username ?? "");
        setDisplayName(p.display_name ?? "");
        setBio(p.bio ?? "");
        setAvatarPreview(p.avatar_url ?? null);
      }
    } finally { setLoading(false); }
  };

  const loadContent = async () => {
    setContentLoading(true);
    try {
      const [g, ps] = await Promise.all([
        fetchUserPosts(userId, { games: true }),
        fetchUserPosts(userId, { games: false }),
      ]);
      setGames(g); setPosts(ps);
    } finally { setContentLoading(false); }
  };

  useEffect(() => { load(); loadContent(); /* eslint-disable-next-line */ }, [userId]);

  const pickAvatar = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr("Máx 5MB"); return; }
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      let avatar_url: string | undefined = undefined;
      if (avatarFile) avatar_url = await uploadAvatar(avatarFile);
      const updated = await updateMyProfile({
        username, display_name: displayName, bio,
        ...(avatar_url ? { avatar_url } : {}),
      });
      setProfile(updated);
      setEditing(false);
      setAvatarFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-center text-xs text-muted-foreground"><Loader2 className="animate-spin inline mr-2" size={14} />Cargando…</div>;
  if (!profile) return <div className="p-8 text-center text-xs text-muted-foreground">Perfil no encontrado</div>;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="panel rounded-2xl border border-border/50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => viewingOwn && editing && fileRef.current?.click()}
            className={`relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center overflow-hidden shrink-0 ${viewingOwn && editing ? "cursor-pointer active:scale-95" : ""}`}
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-2xl text-primary-glow">
                {(profile.display_name ?? profile.username ?? "?")[0]?.toUpperCase()}
              </span>
            )}
            {viewingOwn && editing && (
              <div className="absolute inset-0 bg-black/40 grid place-items-center">
                <Camera size={20} className="text-white" />
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => pickAvatar(e.target.files?.[0] ?? null)} />
          </button>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={40} placeholder="Nombre"
                  className="w-full bg-input/50 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
                <input value={username} onChange={e => setUsername(e.target.value)} maxLength={24} placeholder="usuario"
                  className="w-full bg-input/50 rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            ) : (
              <>
                <div className="font-display text-lg truncate">{profile.display_name || profile.username}</div>
                <div className="text-[11px] font-mono text-muted-foreground truncate">@{profile.username}</div>
              </>
            )}
          </div>
          {viewingOwn && (
            editing ? (
              <button onClick={save} disabled={saving}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-[10px] font-display tracking-widest flex items-center gap-1 active:scale-95 disabled:opacity-60">
                {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <CheckCircle2 size={12}/> : <Save size={12} />} GUARDAR
              </button>
            ) : (
              <button onClick={() => setEditing(true)}
                className="px-3 py-1.5 rounded-xl border border-border text-[10px] font-display tracking-widest active:scale-95">EDITAR</button>
            )
          )}
        </div>
        {editing ? (
          <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={280}
            placeholder="Cuéntanos sobre ti…"
            className="w-full bg-input/50 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-primary/40" />
        ) : profile.bio ? (
          <p className="text-sm whitespace-pre-wrap break-words">{profile.bio}</p>
        ) : viewingOwn ? (
          <p className="text-xs text-muted-foreground italic">Añade una descripción tocando EDITAR.</p>
        ) : null}
        {err && <div className="text-xs text-destructive">{err}</div>}
      </section>

      <div className="relative flex bg-muted/40 rounded-2xl p-1">
        <button onClick={() => setTab("games")}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-display tracking-widest transition-colors ${tab === "games" ? "text-primary-foreground" : "text-muted-foreground"}`}>
          <Gamepad2 size={14} /> JUEGOS · {games.length}
        </button>
        <button onClick={() => setTab("posts")}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-display tracking-widest transition-colors ${tab === "posts" ? "text-primary-foreground" : "text-muted-foreground"}`}>
          <Newspaper size={14} /> POSTS · {posts.length}
        </button>
        <div className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-r from-primary to-accent shadow-[0_4px_14px_-4px_oklch(0.68_0.21_250/0.55)] transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${tab === "games" ? "0%" : "calc(100% + 8px)"})` }} />
      </div>

      <div className="space-y-3">
        {contentLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground"><Loader2 className="animate-spin inline mr-2" size={14} /></div>
        ) : tab === "games" ? (
          games.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground panel rounded-2xl border border-dashed border-border">Sin juegos publicados</div>
          ) : games.map(g => <GameCard key={g.id} post={g} myId={myId} isMod={isMod} onChange={loadContent} />)
        ) : (
          posts.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground panel rounded-2xl border border-dashed border-border">Sin publicaciones</div>
          ) : posts.map(p => <PostCard key={p.id} post={p} myId={myId} isMod={isMod} onChange={loadContent} />)
        )}
      </div>
    </div>
  );
}
