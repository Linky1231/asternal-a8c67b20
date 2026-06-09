import { useEffect, useMemo, useRef, useState } from "react";
import type { EntityKind, Project, SpriteAsset, Entity, Scene, Hitbox } from "@/lib/engine/core";
import { newScene, uid, DEFAULT_SETTINGS } from "@/lib/engine/core";
import { loadProject, saveProject } from "@/lib/engine/storage";
import { fileToDataURL } from "@/lib/engine/images";
import { SceneEditor } from "./SceneEditor";
import { GameRuntime } from "./GameRuntime";
import { AnimationEditor } from "./AnimationEditor";
import { PaintEditor } from "./PaintEditor";

import { ScriptEditor } from "./ScriptEditor";



type Tool = EntityKind | "select" | "erase";
type Tab = "build" | "inspect" | "scenes" | "assets" | "settings";

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
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    setProject(loadProject());
  }, []);

  useEffect(() => {
    if (project) {
      saveProject(project);
      setSavedAt(Date.now());
    }
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
          showFPS={project.settings.showFPS ?? true}
          volume={project.settings.volume ?? 0.8}
          muted={project.settings.muted ?? false}
          music={project.settings.music ?? false}
          touchControls={project.settings.touchControls ?? true}
          autoPause={project.settings.autoPause ?? true}
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
            <div className="text-[10px] font-mono text-muted-foreground -mt-0.5">
              {savedAt ? `saved ${timeAgo(savedAt)}` : "ENGINE · v0.1"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setHelpOpen(true)}
            aria-label="Help"
            className="w-9 h-9 rounded-md border border-border text-muted-foreground font-display"
          >?</button>
          <button
            onClick={() => setPlaying(true)}
            className="font-display text-sm px-4 py-1.5 rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground glow-border active:scale-95 transition"
          >
            ▶ PLAY
          </button>
        </div>
      </header>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

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

        {tab === "assets" && (
          <AssetsPanel
            project={project}
            onChange={setProject}
            selectedEntity={selected}
            onAssignTexture={(dataUrl: string) => {
              if (!selected) return;
              const s = activeScene;
              updateScene({ ...s, entities: s.entities.map(e => e.id === selected.id ? { ...e, texture: dataUrl } : e) });
            }}
            onAssignAnimation={(sprite: SpriteAsset) => {
              if (!selected) return;
              const s = activeScene;
              const clip = {
                id: uid(),
                name: "idle",
                fps: sprite.fps,
                loop: sprite.loop,
                frames: sprite.frames.map((f) => f.composite),
              };
              const animations = [
                ...(selected.animations ?? []).filter(c => c.name !== "idle"),
                clip,
              ];
              updateScene({ ...s, entities: s.entities.map(e => e.id === selected.id ? { ...e, animations, texture: sprite.frames[0]?.composite ?? e.texture } : e) });
            }}
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
      <nav className="grid grid-cols-5 panel border-t pb-[env(safe-area-inset-bottom)]">
        {([
          ["build", "BUILD", "▦"],
          ["inspect", "INSPECT", "◈"],
          ["assets", "ASSETS", "◆"],
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
        <Slider label="Width" value={scene.width} min={400} max={8000} step={100}
          onChange={v => onChangeScene({ ...scene, width: v })} />
        <Slider label="Height" value={scene.height} min={400} max={4000} step={100}
          onChange={v => onChangeScene({ ...scene, height: v })} />

        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">BACKGROUND COLOR</label>
          <input
            type="color"
            value={scene.bg}
            onChange={e => onChangeScene({ ...scene, bg: e.target.value })}
            className="w-full h-10 rounded-md bg-transparent border border-border mt-1"
          />
        </div>

        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">SCALE SCENE + CONTENTS</label>
          <div className="grid grid-cols-4 gap-1.5 mt-1">
            {[0.5, 0.75, 1.5, 2].map(k => (
              <button key={k}
                onClick={() => onChangeScene(scaleScene(scene, k))}
                className="py-2 rounded-md panel border border-border text-xs font-display tracking-widest text-primary-glow glow-border"
              >×{k}</button>
            ))}
          </div>
        </div>


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
      <ScriptsButton entity={ent} onUpdate={update} />
      <HitboxEditor entity={ent} onUpdate={update} />



      <div className="grid grid-cols-2 gap-2 pt-1">
        <Toggle label="Solid" on={ent.solid} onChange={v => update({ solid: v })} />
        <Toggle label="Gravity" on={ent.gravity} onChange={v => update({ gravity: v })} />
        <Toggle label="Hazard" on={ent.hazard} onChange={v => update({ hazard: v })} />
        <Toggle label="Collectible" on={ent.collectible} onChange={v => update({ collectible: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Toggle label="Visible" on={ent.visible ?? true} onChange={v => update({ visible: v })} />
        <Slider label="Opacity" value={Math.round((ent.opacity ?? 1) * 100)} min={0} max={100} step={5}
          onChange={v => update({ opacity: v / 100 })} />
      </div>
      <button
        onClick={() => update({ x: scene.width / 2 - ent.w / 2, y: scene.height / 2 - ent.h / 2 })}
        className="w-full py-2 rounded-md border border-border text-muted-foreground font-display text-[10px] tracking-widest"
      >⊕ CENTER IN SCENE</button>
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button
          onClick={() => {
            const idx = scene.entities.findIndex(e => e.id === ent.id);
            if (idx <= 0) return;
            const next = [...scene.entities];
            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
            onChangeScene({ ...scene, entities: next });
          }}
          className="py-2 rounded-md border border-border text-muted-foreground font-display text-[10px] tracking-widest"
        >↓ BACK</button>
        <button
          onClick={() => {
            const idx = scene.entities.findIndex(e => e.id === ent.id);
            if (idx < 0 || idx === scene.entities.length - 1) return;
            const next = [...scene.entities];
            [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
            onChangeScene({ ...scene, entities: next });
          }}
          className="py-2 rounded-md border border-border text-muted-foreground font-display text-[10px] tracking-widest"
        >↑ FRONT</button>
        <button
          onClick={() => {
            const copy = { ...ent, id: uid(), x: ent.x + 20, y: ent.y + 20 };
            onChangeScene({ ...scene, entities: [...scene.entities, copy] });
            onSelect(copy.id);
          }}
          className="py-2 rounded-md bg-primary/15 border border-primary/40 text-primary-glow font-display text-[10px] tracking-widest"
        >⧉ CLONE</button>
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
          <div key={s.id} className="panel rounded-lg p-3 flex items-center gap-2 glow-border">
            <div className="w-12 h-12 rounded-md bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center font-display text-primary-glow shrink-0">
              {s.entities.length}
            </div>
            <div className="flex-1 min-w-0">
              <input
                value={s.name}
                onChange={e => onChange({ ...project, scenes: project.scenes.map(x => x.id === s.id ? { ...x, name: e.target.value } : x) })}
                className="w-full bg-transparent font-display text-sm focus:outline-none focus:bg-input/40 rounded px-1"
              />
              <div className="text-[10px] font-mono text-muted-foreground px-1">{s.width}×{s.height} · g{s.gravity}</div>
            </div>
            <button
              onClick={() => onOpen(s.id)}
              className="text-[10px] font-display px-2 py-1.5 rounded-md bg-primary/20 border border-primary/50 text-primary-glow"
            >OPEN</button>
            <button
              onClick={() => {
                const copy: Scene = JSON.parse(JSON.stringify(s));
                copy.id = uid();
                copy.name = s.name + " copy";
                copy.entities = copy.entities.map(e => ({ ...e, id: uid() }));
                onChange({ ...project, scenes: [...project.scenes, copy], activeSceneId: copy.id });
              }}
              className="text-[10px] font-display px-2 py-1.5 rounded-md border border-border text-muted-foreground"
            >⧉</button>
            <button
              onClick={() => {
                if (!confirm(`Clear all entities in "${s.name}"?`)) return;
                onChange({ ...project, scenes: project.scenes.map(x => x.id === s.id ? { ...x, entities: [] } : x) });
              }}
              className="text-[10px] font-display px-2 py-1.5 rounded-md border border-border text-muted-foreground"
              title="Clear entities"
            >⌫</button>
            {project.scenes.length > 1 && (
              <button
                onClick={() => {
                  if (!confirm(`Delete "${s.name}"?`)) return;
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
  const set = (patch: Partial<Project["settings"]>) =>
    onChange({ ...project, settings: { ...project.settings, ...patch } });

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
              onClick={() => set({ fpsCap: f as 30 | 60 })}
              className={`flex-1 py-2 rounded-md font-display border ${
                project.settings.fpsCap === f
                  ? "bg-primary/20 border-primary text-primary-glow"
                  : "border-border text-muted-foreground"
              }`}
            >{f}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Toggle label="Show HUD" on={project.settings.showHUD} onChange={v => set({ showHUD: v })} />
        <Toggle label="Show FPS" on={project.settings.showFPS ?? true} onChange={v => set({ showFPS: v })} />
        <Toggle label="Touch ctrls" on={project.settings.touchControls ?? true} onChange={v => set({ touchControls: v })} />
        <Toggle label="Auto-pause" on={project.settings.autoPause ?? true} onChange={v => set({ autoPause: v })} />
      </div>

      <SectionTitle>AUDIO</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Toggle label="Mute" on={project.settings.muted ?? false} onChange={v => set({ muted: v })} />
        <Toggle label="Music" on={project.settings.music ?? false} onChange={v => set({ music: v })} />
      </div>
      <Slider label="Volume" value={Math.round((project.settings.volume ?? 0.8) * 100)} min={0} max={100} step={5}
        onChange={v => set({ volume: v / 100 })} />

      <SectionTitle>GRID</SectionTitle>
      <Toggle label="Show grid" on={project.settings.showGrid ?? true} onChange={v => set({ showGrid: v })} />
      <Toggle label="Snap to grid" on={project.settings.snapToGrid ?? false} onChange={v => set({ snapToGrid: v })} />
      <Slider label="Grid size" value={project.settings.gridSize ?? 16} min={4} max={64} step={2}
        onChange={v => set({ gridSize: v })} />

      <SectionTitle>DATA</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => exportProject(project)}
          className="py-2.5 rounded-md bg-primary/15 border border-primary/50 text-primary-glow font-display text-xs tracking-widest"
        >⤓ EXPORT JSON</button>
        <button
          onClick={() => importProject().then(p => p && onChange(p)).catch(e => alert(String(e)))}
          className="py-2.5 rounded-md bg-accent/15 border border-accent/50 text-primary-glow font-display text-xs tracking-widest"
        >⤒ IMPORT JSON</button>
      </div>
      <button
        onClick={() => {
          if (confirm("Restore default settings? Scenes and assets will be kept.")) {
            onChange({ ...project, settings: { ...DEFAULT_SETTINGS } });
          }
        }}
        className="w-full py-2.5 rounded-md bg-primary/20 border border-primary/50 text-primary-glow font-display text-xs tracking-widest glow-border"
      >↺ RESET TO DEFAULT SETTINGS</button>
      <button
        onClick={() => {
          if (confirm("Reset entire project? All scenes will be lost.")) {
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

function AssetsPanel({
  project, onChange, selectedEntity, onAssignTexture, onAssignAnimation,
}: {
  project: Project;
  onChange: (p: Project) => void;
  selectedEntity: Entity | null;
  onAssignTexture: (dataUrl: string) => void;
  onAssignAnimation: (sprite: SpriteAsset) => void;
}) {
  const sprites = project.assets?.sprites ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [paintOpen, setPaintOpen] = useState(false);

  const addSprite = (asset: SpriteAsset) => {
    const next = [...sprites, asset];
    onChange({ ...project, assets: { ...(project.assets ?? { sprites: [] }), sprites: next } });
  };


  const importFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const frames = await Promise.all(list.map(async (f) => ({
      id: uid(),
      layers: [],
      composite: await fileToDataURL(f),
    })));
    // Probe dimensions from the first frame
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 32, h: 32 });
      img.src = frames[0].composite;
    });
    const asset: SpriteAsset = {
      id: uid(),
      name: list[0].name.replace(/\.[^.]+$/, "").slice(0, 24) || "sprite",
      width: dims.w,
      height: dims.h,
      fps: 8,
      loop: true,
      frames,
    };
    const next = [...sprites, asset];
    onChange({ ...project, assets: { ...(project.assets ?? { sprites: [] }), sprites: next } });
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeSprite = (id: string) => {
    if (!confirm("Delete this sprite?")) return;
    const list = sprites.filter(s => s.id !== id);
    onChange({ ...project, assets: { ...(project.assets ?? { sprites: [] }), sprites: list } });
  };

  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>SPRITES · {sprites.length}</SectionTitle>
        <div className="flex gap-1.5">
          <button
            onClick={() => setPaintOpen(true)}
            className="text-xs font-display px-3 py-1.5 rounded-md bg-gradient-to-r from-accent/30 to-primary/30 border border-accent/50 text-primary-glow glow-border"
          >✎ DRAW</button>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs font-display px-3 py-1.5 rounded-md bg-gradient-to-r from-primary/30 to-accent/30 border border-primary/50 text-primary-glow glow-border"
          >+ IMPORT</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => importFiles(e.target.files)}
        />
      </div>
      {paintOpen && (
        <PaintEditor
          onClose={() => setPaintOpen(false)}
          onSave={(asset) => { addSprite(asset); setPaintOpen(false); }}
        />
      )}



      {selectedEntity ? (
        <div className="text-[10px] font-mono text-muted-foreground panel rounded-md px-2 py-1.5 border border-border/50">
          Tap a sprite to assign to <span className="text-primary-glow">{selectedEntity.kind.toUpperCase()}</span>
        </div>
      ) : (
        <div className="text-[10px] font-mono text-muted-foreground">
          Select an entity in INSPECT to assign sprites to it.
        </div>
      )}

      {sprites.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-10">
          No sprites yet. Tap <span className="text-primary-glow">+ IMPORT</span> to load images from your gallery.
          <div className="mt-1 text-[10px] opacity-70">Select multiple files to create an animated sprite.</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {sprites.map(sp => (
          <div key={sp.id} className="panel rounded-lg p-2 border border-border/60 glow-border">
            <div className="aspect-square rounded-md bg-input/40 grid place-items-center overflow-hidden border border-border/30">
              {sp.frames[0]?.composite && (
                <img src={sp.frames[0].composite} alt={sp.name}
                  className="w-full h-full object-contain"
                  style={{ imageRendering: "pixelated" }} />
              )}
            </div>
            <div className="mt-1.5">
              <div className="text-xs font-display truncate text-primary-glow">{sp.name}</div>
              <div className="text-[9px] font-mono text-muted-foreground">{sp.width}×{sp.height} · {sp.frames.length}f</div>
            </div>
            <div className="mt-1.5">
              <button
                onClick={() => removeSprite(sp.id)}
                className="w-full text-[10px] py-1.5 rounded bg-destructive/15 border border-destructive/40 text-destructive font-display tracking-widest"
              >✕ DELETE</button>
            </div>
            {selectedEntity && (
              <div className="grid grid-cols-2 gap-1 mt-1">
                <button
                  onClick={() => onAssignTexture(sp.frames[0]?.composite ?? "")}
                  className="text-[10px] py-1.5 rounded bg-primary/15 border border-primary/40 text-primary-glow font-display tracking-widest"
                >TEXTURE</button>
                <button
                  onClick={() => onAssignAnimation(sp)}
                  disabled={sp.frames.length < 1}
                  className="text-[10px] py-1.5 rounded bg-accent/15 border border-accent/40 text-primary-glow font-display tracking-widest disabled:opacity-40"
                >ANIM</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function scaleScene(scene: Scene, k: number): Scene {
  return {
    ...scene,
    width: Math.round(scene.width * k),
    height: Math.round(scene.height * k),
    entities: scene.entities.map(e => ({
      ...e,
      x: Math.round(e.x * k),
      y: Math.round(e.y * k),
      w: Math.max(8, Math.round(e.w * k)),
      h: Math.max(8, Math.round(e.h * k)),
    })),
  };
}

function ScriptsButton({ entity, onUpdate }: { entity: Entity; onUpdate: (patch: Partial<Entity>) => void }) {
  const [open, setOpen] = useState(false);
  const count = entity.scripts?.length ?? 0;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-1 px-3 py-2.5 rounded-md bg-gradient-to-r from-accent/20 to-primary/20 border border-accent/50 text-primary-glow font-display text-xs tracking-widest flex items-center justify-between glow-border"
      >
        <span>◉ EVENTS · BLOCKS</span>
        <span className="font-mono text-[10px] opacity-80">{count} SCRIPTS</span>
      </button>
      {open && (
        <ScriptEditor
          entity={entity}
          onChange={onUpdate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function exportProject(project: Project) {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(project.name || "asternal-project").replace(/\s+/g, "-").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importProject(): Promise<Project | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        const text = await f.text();
        const parsed = JSON.parse(text) as Project;
        if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
          return reject(new Error("Invalid project file"));
        }
        if (!confirm("Replace current project with imported file?")) return resolve(null);
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-md p-4" onClick={onClose}>
      <div className="panel rounded-xl border border-primary/40 glow-border max-w-md w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm text-primary-glow glow-text tracking-[0.25em]">QUICK HELP</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">✕</button>
        </div>
        <ul className="space-y-2 text-xs font-mono text-muted-foreground">
          <li><span className="text-primary-glow">BUILD</span> · tap to place selected tool, two-finger pinch to zoom, swipe to pan.</li>
          <li><span className="text-primary-glow">SELECT</span> · tap an entity, then open INSPECT to edit.</li>
          <li><span className="text-primary-glow">ASSETS</span> · import multiple frames to make an animation.</li>
          <li><span className="text-primary-glow">SCRIPTS</span> · add event blocks (onStart, onCollide) to bring entities to life.</li>
          <li><span className="text-primary-glow">SCENES</span> · rename inline, duplicate with ⧉, scale ×N from inspector.</li>
          <li><span className="text-primary-glow">DATA</span> · export/import your project as JSON. Auto-saves on every change.</li>
        </ul>
        <button onClick={onClose} className="w-full mt-2 py-2.5 rounded-md bg-primary/20 border border-primary/50 text-primary-glow font-display text-xs tracking-widest">GOT IT</button>
      </div>
    </div>
  );
}

function HitboxEditor({ entity, onUpdate }: { entity: Entity; onUpdate: (patch: Partial<Entity>) => void }) {
  const enabled = !!entity.hitbox;
  const hb: Hitbox = entity.hitbox ?? { x: 0, y: 0, w: entity.w, h: entity.h };
  const set = (patch: Partial<Hitbox>) => onUpdate({ hitbox: { ...hb, ...patch } });

  return (
    <div className="mt-1 panel rounded-md border border-border/60 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-display text-[11px] tracking-widest text-primary-glow">▣ HITBOX</span>
        <Toggle
          label={enabled ? "On" : "Off"}
          on={enabled}
          onChange={(v) => onUpdate({ hitbox: v ? { x: 0, y: 0, w: entity.w, h: entity.h } : null })}
        />
      </div>
      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Slider label="HB X" value={hb.x} min={-entity.w} max={entity.w} step={1} onChange={v => set({ x: v })} />
            <Slider label="HB Y" value={hb.y} min={-entity.h} max={entity.h} step={1} onChange={v => set({ y: v })} />
            <Slider label="HB W" value={hb.w} min={1} max={entity.w * 2} step={1} onChange={v => set({ w: v })} />
            <Slider label="HB H" value={hb.h} min={1} max={entity.h * 2} step={1} onChange={v => set({ h: v })} />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => set({ x: 0, y: 0, w: entity.w, h: entity.h })}
              className="py-1.5 rounded border border-border text-muted-foreground font-display text-[10px] tracking-widest"
            >FILL BOUNDS</button>
            <button
              onClick={() => set({
                x: Math.round(entity.w * 0.15),
                y: Math.round(entity.h * 0.1),
                w: Math.round(entity.w * 0.7),
                h: Math.round(entity.h * 0.85),
              })}
              className="py-1.5 rounded border border-border text-muted-foreground font-display text-[10px] tracking-widest"
            >SHRINK 80%</button>
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">Offset is relative to entity origin. Red dashed box = collision area.</div>
        </>
      )}
    </div>
  );
}
