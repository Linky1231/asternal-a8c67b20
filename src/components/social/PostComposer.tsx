import { useState, useEffect } from "react";
import { createPost, type MediaType } from "@/lib/social/api";
import { Image as ImageIcon, Film, Link as LinkIcon, X, Send, Loader2, Tag } from "lucide-react";

export function PostComposer({ onCreated }: { onCreated: () => void }) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<MediaType>("none");
  const [linkUrl, setLinkUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => { urls.forEach(URL.revokeObjectURL); };
  }, [files]);

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "video") => {
    const list = Array.from(e.target.files ?? []);
    if (!list.length) return;
    setFiles(list);
    setMediaType(kind);
    setExpanded(true);
    e.target.value = "";
  };

  const removeFile = (i: number) => {
    const next = files.filter((_, idx) => idx !== i);
    setFiles(next);
    if (!next.length) setMediaType("none");
  };

  const canSubmit = (content.trim() || files.length || linkUrl.trim()) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setErr(null);
    try {
      const tags = tagInput.split(/[,\s#]+/).map(t => t.trim()).filter(Boolean);
      await createPost({
        content: content.trim(),
        files,
        mediaType: files.length ? mediaType : linkUrl ? "link" : "none",
        linkUrl: linkUrl.trim() || undefined,
        tags,
      });
      setContent(""); setFiles([]); setLinkUrl(""); setTagInput("");
      setShowLink(false); setShowTags(false); setExpanded(false);
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const charCount = content.length;
  const maxChars = 2000;

  return (
    <div className="panel rounded-2xl p-3 space-y-3 border border-border/60 shadow-sm transition-all">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        onFocus={() => setExpanded(true)}
        placeholder="¿Qué quieres compartir?"
        rows={expanded ? 3 : 1}
        maxLength={maxChars}
        className="w-full bg-transparent rounded-md text-sm resize-none outline-none placeholder:text-muted-foreground transition-all"
      />

      {previews.length > 0 && (
        <div className={`grid gap-2 ${previews.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {previews.map((url, i) => (
            <div key={url} className="relative rounded-xl overflow-hidden bg-muted/30 border border-border/50">
              {mediaType === "video" ? (
                <video src={url} className="w-full max-h-64 object-cover" muted />
              ) : (
                <img src={url} alt="" className="w-full max-h-64 object-cover" />
              )}
              <button
                onClick={() => removeFile(i)}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 backdrop-blur text-white grid place-items-center active:scale-90 transition"
              ><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {showLink && (
        <div className="flex items-center gap-2 bg-input/40 rounded-xl px-3 py-2 animate-in fade-in slide-in-from-top-1">
          <LinkIcon size={14} className="text-muted-foreground" />
          <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…"
            className="flex-1 bg-transparent text-xs outline-none" />
          <button onClick={() => { setLinkUrl(""); setShowLink(false); }}><X size={14} className="text-muted-foreground" /></button>
        </div>
      )}

      {showTags && (
        <div className="flex items-center gap-2 bg-input/40 rounded-xl px-3 py-2 animate-in fade-in slide-in-from-top-1">
          <Tag size={14} className="text-muted-foreground" />
          <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="etiquetas separadas por coma"
            className="flex-1 bg-transparent text-xs outline-none" />
        </div>
      )}

      {err && <div className="text-xs text-destructive">{err}</div>}

      <div className="flex items-center gap-1">
        <label title="Imagen" className="w-9 h-9 rounded-xl grid place-items-center text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer active:scale-95 transition">
          <ImageIcon size={17} />
          <input type="file" hidden accept="image/*" multiple onChange={e => onFiles(e, "image")} />
        </label>
        <label title="Vídeo" className="w-9 h-9 rounded-xl grid place-items-center text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer active:scale-95 transition">
          <Film size={17} />
          <input type="file" hidden accept="video/*" onChange={e => onFiles(e, "video")} />
        </label>
        <button onClick={() => setShowLink(s => !s)} title="Enlace"
          className={`w-9 h-9 rounded-xl grid place-items-center transition active:scale-95 ${showLink ? "text-primary bg-primary/15" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}>
          <LinkIcon size={16} />
        </button>
        <button onClick={() => setShowTags(s => !s)} title="Etiquetas"
          className={`w-9 h-9 rounded-xl grid place-items-center transition active:scale-95 ${showTags ? "text-primary bg-primary/15" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}>
          <Tag size={16} />
        </button>

        <div className="ml-auto flex items-center gap-3">
          {expanded && (
            <span className={`text-[10px] font-mono ${charCount > maxChars * 0.9 ? "text-destructive" : "text-muted-foreground"}`}>
              {charCount}/{maxChars}
            </span>
          )}
          <button onClick={submit} disabled={!canSubmit}
            className="h-9 pl-3 pr-4 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-display tracking-widest text-xs flex items-center gap-1.5 active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
            {busy ? "…" : "PUBLICAR"}
          </button>
        </div>
      </div>
    </div>
  );
}
