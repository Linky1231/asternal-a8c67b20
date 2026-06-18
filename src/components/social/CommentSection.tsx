import { useEffect, useState } from "react";
import { addComment, deleteComment, fetchComments, toggleReaction, reportContent, type CommentRow } from "@/lib/social/api";

export function CommentSection({ postId, myId, isMod, onChange }: {
  postId: string; myId: string | null; isMod: boolean; onChange: () => void;
}) {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [content, setContent] = useState("");

  const reload = async () => setRows(await fetchComments(postId));
  useEffect(() => { reload(); }, [postId]);

  const send = async (parentId?: string, text?: string) => {
    const v = (text ?? content).trim();
    if (!v) return;
    await addComment(postId, v, parentId);
    if (!parentId) setContent("");
    await reload();
    onChange();
  };

  return (
    <div className="pt-2 border-t border-border/40 space-y-2">
      <div className="flex gap-1">
        <input value={content} onChange={e => setContent(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder="Escribe un comentario…"
          className="flex-1 bg-input/40 rounded px-2 py-1.5 text-xs" />
        <button onClick={() => send()} className="text-[10px] font-display px-2 rounded bg-primary text-primary-foreground">ENVIAR</button>
      </div>
      <ul className="space-y-1.5">
        {rows.map(c => (
          <CommentItem key={c.id} c={c} myId={myId} isMod={isMod} onReply={(t) => send(c.id, t)} onChanged={reload} />
        ))}
      </ul>
    </div>
  );
}

function CommentItem({ c, myId, isMod, onReply, onChanged }: {
  c: CommentRow; myId: string | null; isMod: boolean;
  onReply: (text: string) => void; onChanged: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const mine = myId === c.author_id;
  const canDel = mine || isMod;
  const isDeleted = !!c.deleted_at;

  const like = async () => {
    await toggleReaction({ commentId: c.id, type: "like" });
    onChanged();
  };
  const del = async () => {
    if (!confirm("¿Borrar comentario?")) return;
    await deleteComment(c.id); onChanged();
  };
  const report = async () => {
    const r = prompt("Motivo:"); if (!r) return;
    await reportContent({ commentId: c.id, reason: r });
    alert("Reportado");
  };

  return (
    <li className="text-xs">
      <div className="flex gap-1.5">
        <div className="w-6 h-6 rounded-full bg-muted/50 grid place-items-center text-[10px] shrink-0">
          {(c.author?.username ?? "?")[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-muted/20 rounded-md px-2 py-1.5">
            <div className="text-[10px] font-mono text-muted-foreground">@{c.author?.username ?? "?"}</div>
            <div className="break-words">{isDeleted ? <em className="text-muted-foreground">[borrado]</em> : c.content}</div>
          </div>
          {!isDeleted && (
            <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5 px-1">
              <button onClick={like} className={c.my_like ? "text-primary-glow" : ""}>♥ {c.likes ?? 0}</button>
              <button onClick={() => setReplyOpen(o => !o)}>Responder</button>
              {canDel && <button onClick={del} className="text-destructive">Borrar</button>}
              {!mine && <button onClick={report}>Reportar</button>}
            </div>
          )}
          {replyOpen && (
            <div className="flex gap-1 mt-1">
              <input value={reply} onChange={e => setReply(e.target.value)} placeholder="Responder…"
                className="flex-1 bg-input/40 rounded px-2 py-1 text-xs" />
              <button onClick={() => { onReply(reply); setReply(""); setReplyOpen(false); }}
                className="text-[10px] px-2 rounded bg-primary text-primary-foreground">OK</button>
            </div>
          )}
          {c.replies && c.replies.length > 0 && (
            <ul className="mt-1.5 pl-2 border-l border-border/40 space-y-1.5">
              {c.replies.map(r => (
                <CommentItem key={r.id} c={r} myId={myId} isMod={isMod} onReply={onReply} onChanged={onChanged} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
