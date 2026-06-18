import { useState } from "react";
import { createPost, type MediaType } from "@/lib/social/api";

export function PostComposer({ onCreated }: { onCreated: () => void }) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mediaType, setMediaType] = useState<MediaType>("none");
  const [linkUrl, setLinkUrl] = useState("");
  const [category, setCategory] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
    if (list.length) {
      setMediaType(list[0].type.startsWith("video/") ? "video" : "image");
    }
  };

  const submit = async () => {
    if (!content.trim() && !files.length && !linkUrl.trim()) return;
    setBusy(true); setErr(null);
    try {
      const tags = tagInput.split(/[,\s#]+/).map(t => t.trim()).filter(Boolean);
      await createPost({
        content: content.trim(),
        files,
        mediaType: files.length ? mediaType : linkUrl ? "link" : "none",
        linkUrl: linkUrl.trim() || undefined,
        category: category.trim() || undefined,
        tags,
      });
      setContent(""); setFiles([]); setLinkUrl(""); setCategory(""); setTagInput("");
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="panel rounded-xl p-3 space-y-2 border border-border/60">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="¿Qué quieres compartir?"
        rows={3}
        maxLength={2000}
        className="w-full bg-input/40 rounded-md p-2 text-sm resize-none outline-none"
      />
      {files.length > 0 && (
        <div className="text-[10px] font-mono text-muted-foreground">
          {files.map(f => f.name).join(", ")}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="enlace (opcional)"
          className="bg-input/40 rounded px-2 py-1.5 text-xs" />
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="categoría"
          className="bg-input/40 rounded px-2 py-1.5 text-xs" />
      </div>
      <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="#etiquetas separadas por coma"
        className="w-full bg-input/40 rounded px-2 py-1.5 text-xs" />
      {err && <div className="text-xs text-destructive">{err}</div>}
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-display tracking-widest px-2 py-1.5 rounded border border-border cursor-pointer">
          📎 ADJUNTAR
          <input type="file" hidden accept="image/*,video/*" multiple onChange={onFiles} />
        </label>
        <button onClick={submit} disabled={busy}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary to-accent text-primary-foreground font-display tracking-widest text-xs glow-border disabled:opacity-50">
          {busy ? "..." : "PUBLICAR"}
        </button>
      </div>
    </div>
  );
}
