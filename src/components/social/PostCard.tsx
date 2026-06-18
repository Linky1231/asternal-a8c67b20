import { useState } from "react";
import { type PostWithMeta, toggleReaction, toggleRepost, deletePost, updatePost, reportContent } from "@/lib/social/api";
import { CommentSection } from "./CommentSection";

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); return `${d}d`;
}

export function PostCard({
  post, myId, isMod, onChange,
}: {
  post: PostWithMeta; myId: string | null; isMod: boolean; onChange: () => void;
}) {
  const [openComments, setOpenComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [menuOpen, setMenuOpen] = useState(false);

  const mine = myId === post.author_id;
  const canDelete = mine || isMod;

  const react = async (type: "like" | "favorite") => {
    await toggleReaction({ postId: post.id, type });
    onChange();
  };
  const repost = async () => { await toggleRepost(post.id); onChange(); };
  const remove = async () => {
    if (!confirm("¿Borrar publicación?")) return;
    await deletePost(post.id); onChange();
  };
  const saveEdit = async () => {
    await updatePost(post.id, { content: editContent });
    setEditing(false); onChange();
  };
  const report = async () => {
    const reason = prompt("Motivo del reporte:");
    if (!reason) return;
    await reportContent({ postId: post.id, reason });
    alert("Reporte enviado");
    setMenuOpen(false);
  };
  const share = async () => {
    const url = window.location.origin + "/feed?p=" + post.id;
    try { await navigator.share({ url, text: post.content.slice(0, 80) }); }
    catch { navigator.clipboard.writeText(url); alert("Enlace copiado"); }
  };

  return (
    <article className="panel rounded-xl p-3 border border-border/40 space-y-2">
      <header className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center font-display text-xs text-primary-glow shrink-0">
          {(post.author?.display_name ?? post.author?.username ?? "?")[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-display truncate">{post.author?.display_name ?? post.author?.username ?? "anon"}</div>
          <div className="text-[10px] font-mono text-muted-foreground">@{post.author?.username ?? "?"} · {timeAgo(post.created_at)}{post.category ? ` · ${post.category}` : ""}</div>
        </div>
        <div className="relative">
          <button onClick={() => setMenuOpen(o => !o)} className="w-8 h-8 rounded-md border border-border text-muted-foreground">⋯</button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-10 panel border border-border rounded-md p-1 min-w-[140px] text-xs">
              {mine && <button onClick={() => { setEditing(true); setMenuOpen(false); }} className="block w-full text-left px-2 py-1.5 hover:bg-muted/40">Editar</button>}
              {canDelete && <button onClick={remove} className="block w-full text-left px-2 py-1.5 text-destructive hover:bg-muted/40">Borrar</button>}
              {!mine && <button onClick={report} className="block w-full text-left px-2 py-1.5 hover:bg-muted/40">Reportar</button>}
              <button onClick={share} className="block w-full text-left px-2 py-1.5 hover:bg-muted/40">Compartir</button>
            </div>
          )}
        </div>
      </header>

      {editing ? (
        <div className="space-y-2">
          <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3}
            className="w-full bg-input/40 rounded p-2 text-sm" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded border border-border">Cancelar</button>
            <button onClick={saveEdit} className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground">Guardar</button>
          </div>
        </div>
      ) : (
        post.content && <p className="text-sm whitespace-pre-wrap break-words">{post.content}</p>
      )}

      {post.signed_media.length > 0 && (
        <div className={`grid gap-1 ${post.signed_media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {post.signed_media.map((url, i) => post.media_type === "video" ? (
            <video key={i} src={url} controls className="rounded-md w-full max-h-[420px] bg-black" />
          ) : (
            <img key={i} src={url} alt="" className="rounded-md w-full max-h-[420px] object-cover" loading="lazy" />
          ))}
        </div>
      )}

      {post.link_url && (
        <a href={post.link_url} target="_blank" rel="noreferrer" className="block text-xs text-primary-glow underline break-all">
          🔗 {post.link_url}
        </a>
      )}

      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {post.tags.map(t => <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">#{t}</span>)}
        </div>
      )}

      <footer className="flex items-center gap-1 pt-1 text-[11px] text-muted-foreground">
        <button onClick={() => react("like")} className={`flex items-center gap-1 px-2 py-1 rounded ${post.my_like ? "text-primary-glow" : ""}`}>
          ♥ {post.likes}
        </button>
        <button onClick={() => react("favorite")} className={`flex items-center gap-1 px-2 py-1 rounded ${post.my_favorite ? "text-primary-glow" : ""}`}>
          ★ {post.favorites}
        </button>
        <button onClick={() => setOpenComments(o => !o)} className="flex items-center gap-1 px-2 py-1 rounded">
          💬 {post.comments_count}
        </button>
        <button onClick={repost} className={`flex items-center gap-1 px-2 py-1 rounded ${post.my_repost ? "text-primary-glow" : ""}`}>
          ↻ {post.reposts_count}
        </button>
      </footer>

      {openComments && (
        <CommentSection postId={post.id} myId={myId} isMod={isMod} onChange={onChange} />
      )}
    </article>
  );
}
