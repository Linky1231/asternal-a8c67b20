import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Home, Upload, HelpCircle, X } from "lucide-react";
import { PublishGameDialog } from "@/components/engine/PublishGameDialog";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Editor GDevelop · Asternal" },
      { name: "description", content: "Crea juegos con GDevelop dentro de Asternal y publícalos en la comunidad." },
      { property: "og:title", content: "Editor GDevelop · Asternal" },
      { property: "og:description", content: "Crea juegos con GDevelop y publícalos en Asternal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const [publishOpen, setPublishOpen] = useState(false);
  const [help, setHelp] = useState(false);
  return (
    <div className="fixed inset-0 flex flex-col bg-background" style={{ height: "100dvh" }}>
      <header className="flex items-center gap-2 px-2 py-1.5 glass border-b border-border/50 z-10">
        <Link to="/" className="w-9 h-9 grid place-items-center rounded-xl glass-btn active:scale-95" aria-label="Inicio">
          <Home size={16} />
        </Link>
        <div className="font-display text-sm tracking-widest">ASTERNAL · GDEVELOP</div>
        <button onClick={() => setHelp(true)} className="ml-auto w-9 h-9 grid place-items-center rounded-xl glass-btn active:scale-95" aria-label="Ayuda">
          <HelpCircle size={16} />
        </button>
        <button onClick={() => setPublishOpen(true)}
          className="px-3 h-9 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs font-display tracking-widest flex items-center gap-1.5 active:scale-95">
          <Upload size={14} /> PUBLICAR
        </button>
      </header>
      <iframe
        src="https://editor.gdevelop.io/"
        title="GDevelop"
        className="flex-1 w-full border-0"
        allow="fullscreen; clipboard-read; clipboard-write; gamepad; autoplay"
      />
      {help && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur grid place-items-center p-4" onClick={() => setHelp(false)}>
          <div className="panel rounded-2xl p-4 max-w-sm text-sm space-y-2 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setHelp(false)} className="absolute top-2 right-2"><X size={16} /></button>
            <div className="font-display tracking-widest">CÓMO PUBLICAR EN ASTERNAL</div>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
              <li>Crea tu juego en GDevelop.</li>
              <li>En GDevelop: Archivo → Exportar → <b>HTML5 (exportación local / ZIP)</b>.</li>
              <li>Pulsa <b>PUBLICAR</b> aquí arriba y sube ese ZIP.</li>
              <li>Opcional: sube también tu proyecto (.json o .zip) para que otros puedan hacer remix.</li>
            </ol>
          </div>
        </div>
      )}
      <PublishGameDialog open={publishOpen} onOpenChange={setPublishOpen} defaultTitle="Mi juego" />
    </div>
  );
}
