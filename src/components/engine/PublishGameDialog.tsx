import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { publishGame } from "@/lib/social/api";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import type { Project } from "@/lib/engine/core";

export function PublishGameDialog({
  open, onOpenChange, project, defaultTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  defaultTitle: string;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!title.trim()) { setErr("Título requerido"); return; }
    setBusy(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      const tags = tagInput.split(/[,\s#]+/).map(t => t.trim()).filter(Boolean);
      await publishGame({ project, title: title.trim(), description: description.trim(), tags });
      setDone(true);
      setTimeout(() => { onOpenChange(false); setDone(false); navigate({ to: "/" }); }, 900);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload size={18} /> Publicar juego</DialogTitle>
          <DialogDescription>Comparte tu juego en la pantalla de inicio. Cualquiera podrá jugarlo con un toque.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
              {done ? <><CheckCircle2 size={14}/> PUBLICADO</> : busy ? <><Loader2 size={14} className="animate-spin"/> …</> : <><Upload size={14}/> PUBLICAR</>}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
