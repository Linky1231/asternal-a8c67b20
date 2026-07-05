import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { publishGame, updateGame } from "@/lib/social/api";
import { Upload, Loader2, CheckCircle2, ImagePlus, X, GitFork } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import type { Project } from "@/lib/engine/core";

export function PublishGameDialog({
  open, onOpenChange, project, defaultTitle,
  mode = "publish",
  editPostId,
  initialTitle,
  initialDescription,
  initialTags,
  initialCoverUrl,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: Project;
  defaultTitle: string;
  mode?: "publish" | "edit";
  editPostId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialTags?: string[];
  initialCoverUrl?: string | null;
  onSaved?: () => void;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(initialTitle ?? defaultTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [tagInput, setTagInput] = useState((initialTags ?? []).join(", "));
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(initialCoverUrl ?? null);
  const [removeCover, setRemoveCover] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle ?? defaultTitle);
      setDescription(initialDescription ?? "");
      setTagInput((initialTags ?? []).join(", "));
      setCoverPreview(initialCoverUrl ?? null);
      setCoverFile(null);
      setRemoveCover(false);
      setErr(null); setDone(false);
    }
  }, [open, initialTitle, defaultTitle, initialDescription, initialTags, initialCoverUrl]);

  const pickCover = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr("La imagen no puede pesar más de 5MB"); return; }
    setCoverFile(f);
    setRemoveCover(false);
    const url = URL.createObjectURL(f);
    setCoverPreview(url);
  };

  const clearCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
    setRemoveCover(true);
  };

  const submit = async () => {
    if (!title.trim()) { setErr("Título requerido"); return; }
    setBusy(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      const tags = tagInput.split(/[,\s#]+/).map(t => t.trim()).filter(Boolean);
      if (mode === "edit" && editPostId) {
        await updateGame(editPostId, {
          title: title.trim(),
          description: description.trim(),
          tags,
          coverFile,
          removeCover,
        });
      } else if (project) {
        await publishGame({ project, title: title.trim(), description: description.trim(), tags, coverFile });
      }
      setDone(true);
      setTimeout(() => {
        onOpenChange(false);
        setDone(false);
        onSaved?.();
        if (mode === "publish") navigate({ to: "/" });
      }, 700);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const isEdit = mode === "edit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload size={18} /> {isEdit ? "Editar juego" : "Publicar juego"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Actualiza la información y la portada de tu juego." : "Comparte tu juego en la pantalla de inicio. Cualquiera podrá jugarlo con un toque."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <span className="text-[10px] font-display tracking-widest text-muted-foreground">PORTADA</span>
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative w-20 h-20 rounded-xl border border-border overflow-hidden bg-input/50 grid place-items-center active:scale-95 transition group"
              >
                {coverPreview ? (
                  <img src={coverPreview} alt="portada" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus size={22} className="text-muted-foreground group-hover:text-primary-glow" />
                )}
              </button>
              <div className="flex-1 text-[11px] text-muted-foreground">
                Desde tu galería (JPG/PNG, máx 5MB). Aparecerá como icono del juego en el inicio.
                {coverPreview && (
                  <button onClick={clearCover} className="mt-1 flex items-center gap-1 text-destructive text-[11px]">
                    <X size={12} /> quitar
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => pickCover(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <label className="block">
            <span className="text-[10px] font-display tracking-widest text-muted-foreground">TÍTULO</span>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80}
              className="w-full mt-1 bg-input/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="block">
            <span className="text-[10px] font-display tracking-widest text-muted-foreground">DESCRIPCIÓN</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={3}
              placeholder="Cuenta de qué va tu juego…"
              className="w-full mt-1 bg-input/50 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-primary/40" />
          </label>
          <label className="block">
            <span className="text-[10px] font-display tracking-widest text-muted-foreground">ETIQUETAS</span>
            <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="plataformas, retro, aventura"
              className="w-full mt-1 bg-input/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </label>
          {err && <div className="text-xs text-destructive">{err}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => onOpenChange(false)} disabled={busy}
              className="px-4 py-2 rounded-xl border border-border text-xs font-display tracking-widest">CANCELAR</button>
            <button onClick={submit} disabled={busy || done}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs font-display tracking-widest flex items-center gap-2 active:scale-95 transition disabled:opacity-60">
              {done ? <><CheckCircle2 size={14}/> {isEdit ? "GUARDADO" : "PUBLICADO"}</> : busy ? <><Loader2 size={14} className="animate-spin"/> …</> : <><Upload size={14}/> {isEdit ? "GUARDAR" : "PUBLICAR"}</>}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
