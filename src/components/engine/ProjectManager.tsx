import { useEffect, useState } from "react";
import {
  listProjects,
  createProject,
  deleteProjectById,
  renameProject,
  duplicateProject,
  setCurrentProjectId,
  loadProjectById,
  saveProjectById,
  setProjectCloudId,
  getProjectCloudId,
  type ProjectMeta,
} from "@/lib/engine/storage";
import type { Project } from "@/lib/engine/core";
import { supabase } from "@/integrations/supabase/client";
import { cloudSaveProject, cloudListProjects, cloudDeleteProject, type CloudProject } from "@/lib/social/api";
import { Cloud, CloudDownload, CloudUpload, Loader2 } from "lucide-react";


function timeAgo(t: number) {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function ProjectManager({
  onOpen,
  onClose,
}: {
  onOpen: (id: string) => void;
  onClose?: () => void;
}) {
  const [items, setItems] = useState<ProjectMeta[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [cloudList, setCloudList] = useState<CloudProject[]>([]);
  const [cloudBusy, setCloudBusy] = useState<string | null>(null);
  const [cloudErr, setCloudErr] = useState<string | null>(null);

  const refresh = () => setItems(listProjects());
  const refreshCloud = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(!!session);
      if (!session) { setCloudList([]); return; }
      setCloudList(await cloudListProjects());
    } catch (e) { setCloudErr((e as Error).message); }
  };
  useEffect(() => { refresh(); refreshCloud(); }, []);

  const pushLocalToCloud = async (m: ProjectMeta) => {
    setCloudBusy(m.id); setCloudErr(null);
    try {
      const p = loadProjectById(m.id); if (!p) return;
      const cloudId = getProjectCloudId(m.id);
      const saved = await cloudSaveProject({ id: cloudId, name: p.name || m.name, data: p });
      if (!cloudId) setProjectCloudId(m.id, saved.id);
      await refreshCloud();
    } catch (e) { setCloudErr((e as Error).message); }
    finally { setCloudBusy(null); }
  };

  const pullCloudToLocal = async (c: CloudProject) => {
    setCloudBusy(c.id); setCloudErr(null);
    try {
      const existing = items.find(m => getProjectCloudId(m.id) === c.id);
      const localId = existing ? existing.id : createProject(c.name);
      saveProjectById(localId, c.data as Project);
      setProjectCloudId(localId, c.id);
      refresh();
    } catch (e) { setCloudErr((e as Error).message); }
    finally { setCloudBusy(null); }
  };

  const removeCloud = async (c: CloudProject) => {
    if (!confirm(`¿Borrar "${c.name}" de la nube? Tu copia local no se borra.`)) return;
    setCloudBusy(c.id);
    try { await cloudDeleteProject(c.id); await refreshCloud(); }
    finally { setCloudBusy(null); }
  };


  const handleNew = () => {
    const name = prompt("Nombre del nuevo proyecto:", "Nuevo Juego");
    if (name === null) return;
    const id = createProject(name);
    onOpen(id);
  };

  const handleOpen = (id: string) => {
    setCurrentProjectId(id);
    onOpen(id);
  };

  const handleDuplicate = (id: string) => {
    const nid = duplicateProject(id);
    if (nid) refresh();
  };

  const handleDelete = (m: ProjectMeta) => {
    if (!confirm(`¿Borrar "${m.name}"? Esta acción no se puede deshacer.`)) return;
    deleteProjectById(m.id);
    refresh();
  };

  const commitRename = (id: string) => {
    if (renameValue.trim()) renameProject(id, renameValue.trim());
    setRenamingId(null);
    refresh();
  };

  const handleExport = (m: ProjectMeta) => {
    const p = loadProjectById(m.id);
    if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${m.name.replace(/[^a-z0-9\-_]+/gi, "_")}.asternal.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const p = JSON.parse(text) as Project;
        if (!p.scenes?.length) throw new Error("Archivo inválido");
        const id = createProject(p.name || file.name.replace(/\.json$/i, ""));
        saveProjectById(id, p);
        refresh();
      } catch (e) {
        alert("No se pudo importar: " + String(e));
      }
    };
    input.click();
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between px-3 py-2 panel border-b">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_16px_oklch(0.68_0.21_250/0.7)]">
            <span className="font-display text-lg text-primary-foreground">A</span>
          </div>
          <div>
            <div className="font-display text-sm text-primary-glow glow-text leading-none">PROYECTOS</div>
            <div className="text-[10px] font-mono text-muted-foreground -mt-0.5">
              {items.length} {items.length === 1 ? "proyecto" : "proyectos"}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[10px] font-display tracking-widest px-3 py-2 rounded-md border border-border text-muted-foreground"
          >
            ← VOLVER
          </button>
        )}
      </header>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {items.map((m) => (
          <div
            key={m.id}
            className="panel rounded-lg p-3 flex items-center gap-2 glow-border"
          >
            <button
              onClick={() => handleOpen(m.id)}
              className="w-12 h-12 rounded-md bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center font-display text-primary-glow shrink-0 active:scale-95"
              aria-label="Abrir"
            >
              ▶
            </button>
            <div className="flex-1 min-w-0">
              {renamingId === m.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(m.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="w-full bg-input/60 border border-border rounded px-2 py-1 text-sm font-display"
                />
              ) : (
                <button
                  onClick={() => handleOpen(m.id)}
                  className="block w-full text-left font-display text-sm truncate"
                >
                  {m.name}
                </button>
              )}
              <div className="text-[10px] font-mono text-muted-foreground truncate">
                editado hace {timeAgo(m.updatedAt)}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => { setRenamingId(m.id); setRenameValue(m.name); }}
                className="text-[10px] font-display px-2 py-1.5 rounded-md border border-border text-muted-foreground"
                title="Renombrar"
              >✎</button>
              <button
                onClick={() => handleDuplicate(m.id)}
                className="text-[10px] font-display px-2 py-1.5 rounded-md border border-border text-muted-foreground"
                title="Duplicar"
              >⧉</button>
              <button
                onClick={() => handleExport(m)}
                className="text-[10px] font-display px-2 py-1.5 rounded-md border border-border text-muted-foreground"
                title="Exportar"
              >⤓</button>
              {signedIn && (
                <button
                  onClick={() => pushLocalToCloud(m)}
                  disabled={cloudBusy === m.id}
                  className="text-[10px] font-display px-2 py-1.5 rounded-md border border-primary/40 text-primary-glow bg-primary/10 grid place-items-center disabled:opacity-50"
                  title={getProjectCloudId(m.id) ? "Actualizar en la nube" : "Guardar en la nube"}
                >{cloudBusy === m.id ? <Loader2 size={12} className="animate-spin"/> : <CloudUpload size={12}/>}</button>
              )}
              <button
                onClick={() => handleDelete(m)}
                className="text-[10px] font-display px-2 py-1.5 rounded-md border border-destructive/50 text-destructive"
                title="Borrar"
              >✕</button>
            </div>
          </div>
        ))}

        {signedIn && (
          <section className="pt-4 mt-4 border-t border-border/50 space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Cloud size={14} className="text-primary-glow" />
              <div className="font-display text-[11px] tracking-widest text-primary-glow">EN LA NUBE</div>
              <div className="text-[10px] font-mono text-muted-foreground ml-auto">{cloudList.length}</div>
            </div>
            {cloudErr && <div className="text-[10px] text-destructive px-1">{cloudErr}</div>}
            {cloudList.length === 0 ? (
              <div className="text-[10px] text-muted-foreground px-1">Nada guardado en la nube todavía. Usa el botón <CloudUpload size={10} className="inline"/> para respaldar un proyecto y acceder a él desde cualquier dispositivo.</div>
            ) : (
              cloudList.map(c => {
                const inLocal = items.some(m => getProjectCloudId(m.id) === c.id);
                return (
                  <div key={c.id} className="panel rounded-lg p-3 flex items-center gap-2 border border-primary/20">
                    <div className="w-9 h-9 rounded-md bg-primary/15 grid place-items-center shrink-0">
                      <Cloud size={16} className="text-primary-glow" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-sm truncate">{c.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {inLocal ? "sincronizado · " : "no descargado · "}actualizado hace {timeAgo(new Date(c.updated_at).getTime())}
                      </div>
                    </div>
                    <button
                      onClick={() => pullCloudToLocal(c)}
                      disabled={cloudBusy === c.id}
                      className="text-[10px] font-display px-2 py-1.5 rounded-md border border-primary/40 text-primary-glow bg-primary/10 grid place-items-center disabled:opacity-50"
                      title={inLocal ? "Actualizar copia local" : "Descargar"}
                    >{cloudBusy === c.id ? <Loader2 size={12} className="animate-spin"/> : <CloudDownload size={12}/>}</button>
                    <button
                      onClick={() => removeCloud(c)}
                      className="text-[10px] font-display px-2 py-1.5 rounded-md border border-destructive/40 text-destructive"
                      title="Borrar de la nube"
                    >✕</button>
                  </div>
                );
              })
            )}
          </section>
        )}
        {!signedIn && (
          <div className="mt-4 p-3 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground text-center">
            Inicia sesión para sincronizar tus juegos en la nube y no perderlos al cambiar de dispositivo.
          </div>
        )}
      </div>


      <div className="p-3 panel border-t grid grid-cols-2 gap-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <button
          onClick={handleNew}
          className="py-3 rounded-lg bg-gradient-to-r from-primary to-accent text-primary-foreground font-display tracking-widest text-sm glow-border active:scale-95 transition"
        >
          + NUEVO
        </button>
        <button
          onClick={handleImport}
          className="py-3 rounded-lg border border-accent/50 bg-accent/15 text-primary-glow font-display tracking-widest text-sm"
        >
          ⤒ IMPORTAR
        </button>
      </div>
    </div>
  );
}
