import { useState, useEffect } from "react";
import { Play, Heart, MessageCircle, Share2, Trash2, MoreHorizontal, Pencil, GitFork, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { type PostWithMeta, toggleReaction, deletePost, loadGameProject, reportContent, remixGame } from "@/lib/social/api";
import type { Project, Scene } from "@/lib/engine/core";
import { GameRuntime } from "@/components/engine/GameRuntime";
import { CommentSection } from "./CommentSection";
import { PublishGameDialog } from "@/components/engine/PublishGameDialog";

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function extractTitle(content: string): { title: string; body: string } {
  const line = content.split("\n")[0] || "Juego";
  const title = line.replace(/^🎮\s*/, "").trim() || "Juego";
  const body = content.split("\n").slice(1).join("\n").trim();
  return { title, body };
}

export function GameCard({
  post, myId, isMod, onChange,
}: {
  post: PostWithMeta; myId: string | null; isMod: boolean; onChange: () => void;
}) {
  const [playing, setPlaying] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { title, body } = extractTitle(post.content);
  const mine = myId === post.author_id;


  const play = async () => {
    if (!post.signed_media[0]) { setErr("Sin datos"); return; }
    setLoading(true); setErr(null);
    try {
      const proj = (await loadGameProject(post.signed_media[0])) as Project;
      const scene = proj.scenes.find(s => s.id === proj.activeSceneId) ?? proj.scenes[0];
      if (!scene) throw new Error("Escena inválida");
      setPlaying(scene);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  const like = async () => { await toggleReaction({ postId: post.id, type: "like" }); onChange(); };
  const remove = async () => {
    if (!confirm("¿Borrar juego publicado?")) return;
    await deletePost(post.id); onChange();
  };
  const share = async () => {
    const url = window.location.origin + "/?g=" + post.id;
    try { await navigator.share({ url, title, text: body.slice(0, 80) }); }
    catch { await navigator.clipboard.writeText(url); }
  };
  const report = async () => {
    const reason = prompt("Motivo:"); if (!reason) return;
    await reportContent({ postId: post.id, reason });
    setMenuOpen(false);
  };

  if (playing) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <GameRuntime
          scene={playing}
          fpsCap={60}
          showHUD={true}
          onExit={() => setPlaying(null)}
        />
        <button
          onClick={() => setPlaying(null)}
          className="fixed top-3 right-3 z-[60] px-3 py-2 rounded-xl glass text-xs font-display tracking-widest active:scale-95"
        >SALIR</button>
      </div>
    );
  }

  return (
    <article className="panel rounded-2xl overflow-hidden border border-border/50 shadow-sm">
      <div
        onClick={play}
        className="relative aspect-[16/10] grid place-items-center cursor-pointer active:scale-[0.99] transition overflow-hidden"
        style={post.signed_cover ? undefined : { background: "linear-gradient(135deg, oklch(0.72 0.17 250 / 0.25), oklch(0.72 0.17 250 / 0.1))" }}
      >
        {post.signed_cover ? (
          <>
            <img src={post.signed_cover} alt={title} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 30% 30%, oklch(0.72 0.17 250 / 0.35), transparent 60%)" }} />
        )}
        <button
          className="relative w-16 h-16 rounded-full bg-white/90 backdrop-blur grid place-items-center shadow-lg active:scale-95 transition"
          aria-label="Jugar"
        >
          {loading ? <span className="text-xs font-mono">…</span> : <Play size={26} className="text-primary translate-x-[2px]" fill="currentColor" />}
        </button>
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className={`font-display text-base truncate drop-shadow ${post.signed_cover ? "text-white" : "text-foreground"}`}>{title}</div>
            <div className={`text-[10px] font-mono truncate ${post.signed_cover ? "text-white/80" : "text-muted-foreground"}`}>
              @{post.author?.username ?? "anon"} · {timeAgo(post.created_at)}
            </div>
          </div>
          <span className="text-[9px] font-display tracking-widest px-2 py-0.5 rounded-full bg-primary/20 text-primary-glow border border-primary/40">JUEGO</span>
        </div>
      </div>


      {(body || err) && (
        <div className="px-3 pt-2 text-sm whitespace-pre-wrap break-words">
          {body}
          {err && <div className="text-xs text-destructive mt-1">{err}</div>}
        </div>
      )}

      <footer className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-muted-foreground">
        <button onClick={like} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg active:scale-95 transition ${post.my_like ? "text-primary-glow" : ""}`}>
          <Heart size={15} fill={post.my_like ? "currentColor" : "none"} /> {post.likes}
        </button>
        <button onClick={() => setOpenComments(o => !o)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg active:scale-95 transition">
          <MessageCircle size={15} /> {post.comments_count}
        </button>
        <button onClick={share} className="flex items-center gap-1 px-2 py-1.5 rounded-lg active:scale-95 transition ml-auto">
          <Share2 size={15} />
        </button>
        <div className="relative">
          <button onClick={() => setMenuOpen(o => !o)} className="w-8 h-8 grid place-items-center rounded-lg active:scale-95">
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 bottom-9 z-10 panel border border-border rounded-lg p-1 min-w-[140px] text-xs shadow-lg">
              {mine && (
                <button onClick={() => { setEditOpen(true); setMenuOpen(false); }} className="flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-muted/40 rounded">
                  <Pencil size={13} /> Editar
                </button>
              )}
              {(mine || isMod) && (
                <button onClick={remove} className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-destructive hover:bg-muted/40 rounded">
                  <Trash2 size={13} /> Borrar
                </button>
              )}
              {!mine && (
                <button onClick={report} className="block w-full text-left px-2 py-1.5 hover:bg-muted/40 rounded">Reportar</button>
              )}
            </div>
          )}
        </div>
      </footer>

      {openComments && (
        <div className="px-3 pb-3">
          <CommentSection postId={post.id} myId={myId} isMod={isMod} onChange={onChange} />
        </div>
      )}

      {editOpen && (
        <PublishGameDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          defaultTitle={title}
          mode="edit"
          editPostId={post.id}
          initialTitle={title}
          initialDescription={body}
          initialTags={post.tags}
          initialCoverUrl={post.signed_cover}
          onSaved={onChange}
        />
      )}
    </article>
  );
}
