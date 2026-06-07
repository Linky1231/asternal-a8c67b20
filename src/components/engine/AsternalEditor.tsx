import { useEffect, useMemo, useRef, useState } from "react";
import type { EntityKind, Project } from "@/lib/engine/core";
import { newScene, uid } from "@/lib/engine/core";
import { loadProject, saveProject } from "@/lib/engine/storage";
import { fileToDataURL } from "@/lib/engine/images";
import { SceneEditor } from "./SceneEditor";
import { GameRuntime } from "./GameRuntime";
import { AnimationEditor } from "./AnimationEditor";

type Tool = EntityKind | "select" | "erase";
type Tab = "build" | "inspect" | "scenes" | "settings";

const TOOL_LIST: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "⌖" },
  { id: "platform", label: "Block", icon: "▭" },
  { id: "coin", label: "Coin", icon: "◉" },
  { id: "enemy", label: "Enemy", icon: "▲" },
  { id: "goal", label: "Goal", icon: "▮" },
  { id: "player", label: "Player", icon: "☻" },
  { id: "erase", label: "Erase", icon: "✕" },
];

export function AsternalEditor() {
  const [project, setProject] = useState<Project | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [tab, setTab] = useState<Tab>("build");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setProject(loadProject());
  }, []);

  useEffect(() => {
    if (project) saveProject(project);
  }, [project]);

  const activeScene = useMemo(
    () => project?.scenes.find(s => s.id === project.activeSceneId),
    [project]
  );

  if (!project || !activeScene) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Booting engine…</div>;
  }

  const updateScene = (s: typeof activeScene) =>
    setProject({ ...project, scenes: project.scenes.map(x => x.id === s.id ? s : x) });

  const selected = activeScene.entities.find(e => e.id === selectedId) ?? null;

  if (playing) {
    return (
      <div className="h-screen w-screen">
        <GameRuntime
          scene={activeScene}
          fpsCap={project.settings.fpsCap}
          showHUD={project.settings.showHUD}
          onExit={() => setPlaying(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-3 py-2 panel border-b">
        <div className="flex items-center gap-2">
          <Logo />
          <div>
            <div className="font-display text-sm text-primary-glow glow-text leading-none">ASTERNAL</div>
            <div className="text-[10px] font-mono text-muted-foreground -mt-0.5">ENGINE · v0.1</div>
          </div>
        </div>
        <button
          onClick={() => setPlaying(true)}
          className="font-display text-sm px-4 py-1.5 rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground glow-border active:scale-95 transition"
        >
          ▶ PLAY
        </button>
      </header>

      {/* Main */}
      <main className="relative flex-1 min-h-0">
        {tab === "build" && (
          <SceneEditor
            scene={activeScene}
            tool={tool}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={updateScene}
          />
        )}

        {tab === "inspect" && (
          <InspectorPanel
            scene={activeScene}
            entityId={selectedId}
            onChangeScene={updateScene}
            onSelect={setSelectedId}
          />
        )}

        {tab === "scenes" && (
          <ScenesPanel
            project={project}
            onChange={setProject}
            onOpen={(id) => { setProject({ ...project, activeSceneId: id }); setTab("build"); }}
          />
        )}

        {tab === "settings" && (
          <SettingsPanel project={project} onChange={setProject} />
        )}
      </main>

      {/* Tool strip — only on build */}
      {tab === "build" && (
        <div className="px-2 pt-2 panel border-t">
          <div className="flex gap-1.5 overflow-x-auto pb-2 no-scrollbar">
            {TOOL_LIST.map(t => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={`shrink-0 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md min-w-[58px] border transition ${
                  tool === t.id
                    ? "bg-primary/20 border-primary text-primary-glow shadow-[0_0_12px_oklch(0.68_0.21_250/0.5)]"
                    : "border-border/40 text-muted-foreground"
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                <span className="text-[9px] font-display tracking-wider">{t.label.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom tabs */}
      <nav className="grid grid-cols-4 panel border-t pb-[env(safe-area-inset-bottom)]">
        {([
          ["build", "BUILD", "▦"],
          ["inspect", "INSPECT", "◈"],
          ["scenes", "SCENES", "▤"],
          ["settings", "CONFIG", "⚙"],
        ] as [Tab, string, string][]).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-0.5 py-2.5 ${
              tab === id ? "text-primary-glow" : "text-muted-foreground"
            }`}
          >
            <span className={`text-lg leading-none ${tab === id ? "glow-text" : ""}`}>{icon}</span>
            <span className="text-[9px] font-display tracking-widest">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Logo() {
  return (
    <div className="relative w-9 h-9 rounded-md bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_16px_oklch(0.68_0.21_250/0.7)]">
      <span className="font-display text-lg text-primary-foreground">A</span>
    </div>
  );
}

function InspectorPanel({
  scene,
  entityId,
  onChangeScene,
  onSelect,
}: {
  scene: import("@/lib/engine/core").Scene;
  entityId: string | null;
  onChangeScene: (s: import("@/lib/engine/core").Scene) => void;
  onSelect: (id: string | null) => void;
}) {
  const ent = scene.entities.find(e => e.id === entityId);

  if (!ent) {
    return (
      <div className="h-full overflow-auto p-4 space-y-3">
        <SectionTitle>SCENE PROPERTIES</SectionTitle>
        <Field label="Name" value={scene.name} onChange={v => onChangeScene({ ...scene, name: v })} />
        <Slider label="Gravity" value={scene.gravity} min={0} max={3000} step={50}
          onChange={v => onChangeScene({ ...scene, gravity: v })} />
        <Slider label="Width" value={scene.width} min={400} max={4000} step={100}
          onChange={v => onChangeScene({ ...scene, width: v })} />
        <Slider label="Height" value={scene.height} min={400} max={2000} step={100}
          onChange={v => onChangeScene({ ...scene, height: v })} />

        <div className="pt-4">
          <SectionTitle>ENTITIES · {scene.entities.length}</SectionTitle>
          <div className="space-y-1 mt-2">
            {scene.entities.map(e => (
              <button key={e.id}
                onClick={() => onSelect(e.id)}
                className="w-full flex items-center gap-2 panel rounded-md px-2 py-1.5 text-left text-xs"
              >
                <span className="w-3 h-3 rounded-sm" style={{ background: e.color, boxShadow: `0 0 8px ${e.color}` }} />
                <span className="font-display tracking-wider">{e.kind.toUpperCase()}</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {Math.round(e.x)},{Math.round(e.y)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const update = (patch: Partial<typeof ent>) => {
    onChangeScene({
      ...scene,
      entities: scene.entities.map(e => e.id === ent.id ? { ...e, ...patch } : e),
    });
  };

  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>{ent.kind.toUpperCase()}</SectionTitle>
        <button onClick={() => onSelect(null)} className="text-xs text-muted-foreground">← Back</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Slider label="X" value={ent.x} min={0} max={scene.width} step={10} onChange={v => update({ x: v })} />
        <Slider label="Y" value={ent.y} min={0} max={scene.height} step={10} onChange={v => update({ y: v })} />
        <Slider label="Width" value={ent.w} min={8} max={400} step={4} onChange={v => update({ w: v })} />
        <Slider label="Height" value={ent.h} min={8} max={400} step={4} onChange={v => update({ h: v })} />
      </div>
      <div>
        <label className="text-[10px] font-display tracking-widest text-muted-foreground">COLOR</label>
        <input
          type="color"
          value={ent.color}
          onChange={e => update({ color: e.target.value })}
          className="w-full h-10 rounded-md bg-transparent border border-border mt-1"
        />
      </div>

      <TexturePicker
        texture={ent.texture ?? null}
        onPick={(dataUrl) => update({ texture: dataUrl })}
        onClear={() => update({ texture: null })}
      />

      <AnimationsButton entity={ent} onUpdate={update} />

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Toggle label="Solid" on={ent.solid} onChange={v => update({ solid: v })} />
        <Toggle label="Gravity" on={ent.gravity} onChange={v => update({ gravity: v })} />
        <Toggle label="Hazard" on={ent.hazard} onChange={v => update({ hazard: v })} />
        <Toggle label="Collectible" on={ent.collectible} onChange={v => update({ collectible: v })} />
      </div>
      {ent.kind !== "player" && (
        <button
          onClick={() => {
            onChangeScene({ ...scene, entities: scene.entities.filter(e => e.id !== ent.id) });
            onSelect(null);
          }}
          className="w-full mt-2 py-2 rounded-md bg-destructive/20 border border-destructive/50 text-destructive font-display text-xs tracking-widest"
        >
          DELETE ENTITY
        </button>
      )}
    </div>
  );
}

function ScenesPanel({
  project,
  onChange,
  onOpen,
}: {
  project: Project;
  onChange: (p: Project) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <SectionTitle>SCENES</SectionTitle>
      <div className="space-y-2">
        {project.scenes.map(s => (
          <div key={s.id} className="panel rounded-lg p-3 flex items-center gap-3 glow-border">
            <div className="w-12 h-12 rounded-md bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center font-display text-primary-glow">
              {s.entities.length}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-sm truncate">{s.name}</div>
              <div className="text-[10px] font-mono text-muted-foreground">{s.width}×{s.height} · g{s.gravity}</div>
            </div>
            <button
              onClick={() => onOpen(s.id)}
              className="text-xs font-display px-3 py-1.5 rounded-md bg-primary/20 border border-primary/50 text-primary-glow"
            >
              OPEN
            </button>
            {project.scenes.length > 1 && (
              <button
                onClick={() => {
                  const remaining = project.scenes.filter(x => x.id !== s.id);
                  onChange({
                    ...project,
                    scenes: remaining,
                    activeSceneId: project.activeSceneId === s.id ? remaining[0].id : project.activeSceneId,
                  });
                }}
                className="text-destructive text-lg px-1"
              >✕</button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          const s = newScene(`Scene ${project.scenes.length + 1}`);
          s.id = uid();
          onChange({ ...project, scenes: [...project.scenes, s], activeSceneId: s.id });
        }}
        className="w-full py-3 rounded-lg border-2 border-dashed border-primary/40 text-primary-glow font-display tracking-widest text-sm"
      >
        + NEW SCENE
      </button>
    </div>
  );
}

function SettingsPanel({ project, onChange }: { project: Project; onChange: (p: Project) => void }) {
  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <SectionTitle>PROJECT</SectionTitle>
      <Field label="Game name" value={project.name} onChange={v => onChange({ ...project, name: v })} />

      <SectionTitle>RUNTIME</SectionTitle>
      <div>
        <label className="text-[10px] font-display tracking-widest text-muted-foreground">FPS CAP</label>
        <div className="flex gap-2 mt-1">
          {[30, 60].map(f => (
            <button key={f}
              onClick={() => onChange({ ...project, settings: { ...project.settings, fpsCap: f as 30 | 60 } })}
              className={`flex-1 py-2 rounded-md font-display border ${
                project.settings.fpsCap === f
                  ? "bg-primary/20 border-primary text-primary-glow"
                  : "border-border text-muted-foreground"
              }`}
            >{f}</button>
          ))}
        </div>
      </div>
      <Toggle label="Show HUD" on={project.settings.showHUD} onChange={v => onChange({ ...project, settings: { ...project.settings, showHUD: v } })} />

      <SectionTitle>DATA</SectionTitle>
      <button
        onClick={() => {
          if (confirm("Reset project? All scenes will be lost.")) {
            localStorage.removeItem("asternal:project");
            location.reload();
          }
        }}
        className="w-full py-2.5 rounded-md bg-destructive/20 border border-destructive/50 text-destructive font-display text-xs tracking-widest"
      >RESET PROJECT</button>

      <div className="pt-6 text-center text-[10px] font-mono text-muted-foreground">
        ASTERNAL ENGINE · BUILT FOR MOBILE
      </div>
    </div>
  );
}

// --- shared bits ---
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-xs tracking-[0.25em] text-primary-glow glow-text">{children}</h2>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] font-display tracking-widest text-muted-foreground">{label.toUpperCase()}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full mt-1 bg-input/60 border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_oklch(0.68_0.21_250/0.2)]"
      />
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between items-baseline">
        <label className="text-[10px] font-display tracking-widest text-muted-foreground">{label.toUpperCase()}</label>
        <span className="text-[10px] font-mono text-primary-glow">{Math.round(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[oklch(0.68_0.21_250)]"
      />
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`flex items-center justify-between px-3 py-2 rounded-md border ${
        on ? "border-primary/60 bg-primary/15 text-primary-glow" : "border-border text-muted-foreground"
      }`}
    >
      <span className="text-xs font-display tracking-widest">{label.toUpperCase()}</span>
      <span className={`w-8 h-4 rounded-full p-0.5 transition ${on ? "bg-primary" : "bg-muted"}`}>
        <span className={`block w-3 h-3 rounded-full bg-background transition ${on ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

function TexturePicker({ texture, onPick, onClear }: { texture: string | null; onPick: (dataUrl: string) => void; onClear: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="text-[10px] font-display tracking-widest text-muted-foreground">TEXTURE</label>
      <div className="mt-1 flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          className="relative w-16 h-16 rounded-md border border-border bg-input/40 grid place-items-center overflow-hidden glow-border"
        >
          {texture ? (
            <img src={texture} alt="texture" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="text-xl text-muted-foreground">＋</span>
          )}
        </button>
        <div className="flex-1 flex flex-col gap-1.5">
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs font-display tracking-widest px-3 py-2 rounded-md bg-primary/15 border border-primary/50 text-primary-glow"
          >
            {texture ? "REPLACE FROM GALLERY" : "PICK FROM GALLERY"}
          </button>
          {texture && (
            <button
              onClick={onClear}
              className="text-[10px] font-display tracking-widest px-3 py-1.5 rounded-md border border-border text-muted-foreground"
            >
              CLEAR TEXTURE
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const url = await fileToDataURL(f);
            onPick(url);
          } catch { /* ignore */ }
          e.target.value = "";
        }}
      />
    </div>
  );
}

function AnimationsButton({ entity, onUpdate }: { entity: import("@/lib/engine/core").Entity; onUpdate: (patch: Partial<import("@/lib/engine/core").Entity>) => void }) {
  const [open, setOpen] = useState(false);
  const count = entity.animations?.length ?? 0;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-1 px-3 py-2.5 rounded-md bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/50 text-primary-glow font-display text-xs tracking-widest flex items-center justify-between glow-border"
      >
        <span>◈ ANIMATIONS</span>
        <span className="font-mono text-[10px] opacity-80">{count} CLIPS</span>
      </button>
      {open && (
        <AnimationEditor
          entity={entity}
          onChange={onUpdate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
