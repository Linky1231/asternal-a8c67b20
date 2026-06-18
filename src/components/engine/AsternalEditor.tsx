import { useEffect, useMemo, useRef, useState } from "react";
import type { EntityKind, Project, SpriteAsset, Entity, Scene, Hitbox } from "@/lib/engine/core";
import { newScene, uid, DEFAULT_SETTINGS } from "@/lib/engine/core";
import { loadProject, loadProjectById, saveProject, saveProjectById, getCurrentProjectId, setCurrentProjectId } from "@/lib/engine/storage";
import { fileToDataURL } from "@/lib/engine/images";
import { SceneEditor } from "./SceneEditor";
import { GameRuntime } from "./GameRuntime";
import { AnimationEditor } from "./AnimationEditor";
import { PaintEditor } from "./PaintEditor";
import { UIEditor } from "./UIEditor";
import { ProjectManager } from "./ProjectManager";

import { ScriptEditor } from "./ScriptEditor";
import { useT, setLang, getLang, LANGS } from "@/lib/i18n";



type Tool = EntityKind | "select" | "erase";
type Tab = "build" | "inspect" | "ui" | "scenes" | "assets" | "settings";

const TOOL_LIST: { id: Tool; tKey: string; icon: string }[] = [
  { id: "select", tKey: "tool.select", icon: "⌖" },
  { id: "platform", tKey: "tool.platform", icon: "▭" },
  { id: "coin", tKey: "tool.coin", icon: "◉" },
  { id: "enemy", tKey: "tool.enemy", icon: "▲" },
  { id: "goal", tKey: "tool.goal", icon: "▮" },
  { id: "player", tKey: "tool.player", icon: "☻" },
  { id: "erase", tKey: "tool.erase", icon: "✕" },
];

export function AsternalEditor() {
  const t = useT();
  const [project, setProject] = useState<Project | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [tool, setTool] = useState<Tool>("select");
  const [tab, setTab] = useState<Tab>("build");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showManager, setShowManager] = useState(false);

  useEffect(() => {
    const id = getCurrentProjectId();
    setProjectId(id);
    setProject(loadProjectById(id) ?? loadProject());
  }, []);

  const openProject = (id: string) => {
    setCurrentProjectId(id);
    const p = loadProjectById(id);
    if (!p) return;
    setProjectId(id);
    setProject(p);
    setSelectedId(null);
    setTab("build");
    setShowManager(false);
  };

  const exitToManager = () => {
    if (project && projectId) {
      saveProjectById(projectId, project);
      setSavedAt(Date.now());
    }
    setShowManager(true);
  };

  useEffect(() => {
    if (project) {
      const persist = () => {
        saveProject(project);
        setSavedAt(Date.now());
      };
      let idleId: number | null = null;
      const timer = window.setTimeout(() => {
        const win = window as typeof window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
          cancelIdleCallback?: (id: number) => void;
        };
        if (win.requestIdleCallback) idleId = win.requestIdleCallback(persist, { timeout: 1200 });
        else persist();
      }, 350);
      return () => {
        window.clearTimeout(timer);
        if (idleId !== null) (window as typeof window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
      };
    }
  }, [project]);

  // Listen for goal-reached events from the runtime to support scene transitions
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ nextSceneId: string | null; endsGame: boolean }>).detail;
      if (!detail) return;
      if (detail.nextSceneId && project?.scenes.some(s => s.id === detail.nextSceneId)) {
        setProject(p => p ? { ...p, activeSceneId: detail.nextSceneId! } : p);
        // brief delay so React swaps the scene prop, then restart runtime
        setTimeout(() => window.dispatchEvent(new Event("asternal:restart")), 60);
      }
    };
    window.addEventListener("asternal:goal", handler);
    return () => window.removeEventListener("asternal:goal", handler);
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
  const playProject = project.settings.fpsCap === 60
    ? project
    : { ...project, settings: { ...project.settings, fpsCap: 60 as const } };

  if (playing) {
    return (
      <div className="h-screen w-screen">
        <GameRuntime
          scene={activeScene}
          fpsCap={60}
          showHUD={playProject.settings.showHUD}
          showFPS={playProject.settings.showFPS ?? true}
          volume={playProject.settings.volume ?? 0.8}
          muted={playProject.settings.muted ?? false}
          music={playProject.settings.music ?? false}
          touchControls={playProject.settings.touchControls ?? true}
          autoPause={playProject.settings.autoPause ?? true}
          showHitboxes={playProject.settings.showHitboxes ?? false}
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
            onClick={() => {
              if (project.settings.fpsCap !== 60) {
                const next = { ...project, settings: { ...project.settings, fpsCap: 60 as const } };
                saveProject(next);
                setProject(next);
              }
              setPlaying(true);
            }}
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
            project={project}
          />
        )}

        {tab === "ui" && (
          <UIEditor scene={activeScene} onChange={updateScene} />
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
            onPlaceOnScene={(sprite: SpriteAsset) => {
              const s = activeScene;
              const maxDim = 96;
              const k = Math.min(1, maxDim / Math.max(sprite.width, sprite.height));
              const w = Math.max(16, Math.round(sprite.width * k));
              const h = Math.max(16, Math.round(sprite.height * k));
              const ent: Entity = {
                id: uid(),
                kind: "platform",
                x: Math.round(s.width / 2 - w / 2),
                y: Math.round(s.height / 2 - h / 2),
                w, h, vx: 0, vy: 0,
                color: "#1e3a8a",
                solid: false, gravity: false, controllable: false,
                collectible: false, hazard: false, goal: false,
                visible: true, opacity: 1,
                texture: sprite.frames[0]?.composite ?? null,
              };
              updateScene({ ...s, entities: [...s.entities, ent] });
              setSelectedId(ent.id);
              setTab("inspect");
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
            {TOOL_LIST.map(toolItem => (
              <button
                key={toolItem.id}
                onClick={() => setTool(toolItem.id)}
                className={`shrink-0 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md min-w-[58px] border transition ${
                  tool === toolItem.id
                    ? "bg-primary/20 border-primary text-primary-glow shadow-[0_0_12px_oklch(0.68_0.21_250/0.5)]"
                    : "border-border/40 text-muted-foreground"
                }`}
              >
                <span className="text-lg leading-none">{toolItem.icon}</span>
                <span className="text-[9px] font-display tracking-wider">{t(toolItem.tKey).toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom tabs */}
      <nav className="grid grid-cols-6 panel border-t pb-[env(safe-area-inset-bottom)]">
        {([
          ["build", t("tab.build"), "▦"],
          ["inspect", t("tab.inspect"), "◈"],
          ["ui", t("tab.ui"), "▢"],
          ["assets", t("tab.assets"), "◆"],
          ["scenes", t("tab.scenes"), "▤"],
          ["settings", t("tab.settings"), "⚙"],
        ] as [Tab, string, string][]).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`min-w-0 flex flex-col items-center gap-0.5 py-2.5 px-0.5 ${
              tab === id ? "text-primary-glow" : "text-muted-foreground"
            }`}
          >
            <span className={`text-lg leading-none ${tab === id ? "glow-text" : ""}`}>{icon}</span>
            <span className="w-full text-center text-[8px] font-display tracking-wide truncate">{label}</span>
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
  project,
}: {
  scene: import("@/lib/engine/core").Scene;
  entityId: string | null;
  onChangeScene: (s: import("@/lib/engine/core").Scene) => void;
  onSelect: (id: string | null) => void;
  project?: Project;
}) {
  const t = useT();
  const ent = scene.entities.find(e => e.id === entityId);

  if (!ent) {
    return (
      <div className="h-full overflow-auto p-4 space-y-3">
        <SectionTitle>{t("scene.props")}</SectionTitle>
        <Field label={t("settings.gameName")} value={scene.name} onChange={v => onChangeScene({ ...scene, name: v })} />
        <Slider label={t("scene.gravity")} value={scene.gravity} min={0} max={3000} step={50}
          onChange={v => onChangeScene({ ...scene, gravity: v })} />
        <Slider label={t("scene.width")} value={scene.width} min={400} max={8000} step={100}
          onChange={v => onChangeScene({ ...scene, width: v })} />
        <Slider label={t("scene.height")} value={scene.height} min={400} max={4000} step={100}
          onChange={v => onChangeScene({ ...scene, height: v })} />

        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("scene.bgColor")}</label>
          <input
            type="color"
            value={scene.bg}
            onChange={e => onChangeScene({ ...scene, bg: e.target.value })}
            className="w-full h-10 rounded-md bg-transparent border border-border mt-1"
          />
        </div>

        <SceneBgImage scene={scene} onChange={onChangeScene} />



        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("scene.scaleAll")}</label>
          <div className="grid grid-cols-4 gap-1.5 mt-1">
            {[0.5, 0.75, 1.5, 2].map(k => (
              <button key={k}
                onClick={() => onChangeScene(scaleScene(scene, k))}
                className="py-2 rounded-md panel border border-border text-xs font-display tracking-widest text-primary-glow glow-border"
              >×{k}</button>
            ))}
          </div>
        </div>

        <Slider label={t("scene.timeLimit")} value={scene.timeLimit ?? 0} min={0} max={300} step={5}
          onChange={v => onChangeScene({ ...scene, timeLimit: v })} />
        <Slider label={t("scene.startLives")} value={scene.startLives ?? 1} min={1} max={9} step={1}
          onChange={v => onChangeScene({ ...scene, startLives: v })} />

        <div className="panel rounded-md p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-display tracking-widest text-muted-foreground">{t("scene.parallax")} · {scene.parallax?.length ?? 0}</span>
            <div className="flex gap-1">
              <button
                onClick={() => onChangeScene({
                  ...scene,
                  parallax: [...(scene.parallax ?? []), { color: "#1e293b", speed: 0.3, y: scene.height * 0.6, height: 80 }],
                })}
                className="text-[10px] font-display tracking-widest px-2 py-0.5 rounded border border-border"
              >{t("common.add")}</button>
              <button
                onClick={() => onChangeScene({ ...scene, parallax: [] })}
                className="text-[10px] font-display tracking-widest px-2 py-0.5 rounded border border-border"
              >{t("common.clear")}</button>
            </div>
          </div>
          {(scene.parallax ?? []).map((pl, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-1 items-center">
              <input type="color" value={pl.color}
                onChange={e => {
                  const arr = [...(scene.parallax ?? [])];
                  arr[i] = { ...pl, color: e.target.value };
                  onChangeScene({ ...scene, parallax: arr });
                }}
                className="w-full h-7 rounded border border-border" />
              <span className="text-[10px] font-mono text-muted-foreground">×{pl.speed}</span>
            </div>
          ))}
        </div>





        <div className="pt-4">
          <SectionTitle>LAYERS · {scene.entities.length}</SectionTitle>
          <LayersPanel scene={scene} onChangeScene={onChangeScene} selectedId={null} onSelect={onSelect} />
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
        <button onClick={() => onSelect(null)} className="text-xs text-muted-foreground">{t("common.back")}</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Slider label="X" value={ent.x} min={0} max={scene.width} step={10} onChange={v => update({ x: v })} />
        <Slider label="Y" value={ent.y} min={0} max={scene.height} step={10} onChange={v => update({ y: v })} />
        <Slider label="Width" value={ent.w} min={8} max={400} step={4} onChange={v => update({ w: v })} />
        <Slider label="Height" value={ent.h} min={8} max={400} step={4} onChange={v => update({ h: v })} />
      </div>
      <div>
        <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("inspector.color")}</label>
        <input
          type="color"
          value={ent.color}
          onChange={e => update({ color: e.target.value })}
          className="w-full h-10 rounded-md bg-transparent border border-border mt-1"
        />
      </div>

      <TexturePicker
        texture={ent.texture ?? null}
        fit={ent.textureFit ?? "stretch"}
        onPick={(dataUrl) => update({ texture: dataUrl })}
        onClear={() => update({ texture: null })}
        onFit={(f) => update({ textureFit: f })}
      />

      <AnimationsButton entity={ent} onUpdate={update} />
      <ScriptsButton entity={ent} onUpdate={update} />
      <HitboxEditor entity={ent} onUpdate={update} />

      <div className="grid grid-cols-2 gap-2">
        <Slider label={t("inspector.depth")} value={ent.z ?? 0} min={-20} max={20} step={1}
          onChange={v => update({ z: v })} />
        <Toggle label={t("inspector.flipX")} on={!!ent.flipX} onChange={v => update({ flipX: v })} />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Toggle label={t("inspector.solid")} on={ent.solid} onChange={v => update({ solid: v })} />
        <Toggle label={t("inspector.gravity")} on={ent.gravity} onChange={v => update({ gravity: v })} />
        <Toggle label={t("inspector.hazard")} on={ent.hazard} onChange={v => update({ hazard: v })} />
        <Toggle label={t("inspector.collectible")} on={ent.collectible} onChange={v => update({ collectible: v })} />
        <Toggle label={t("inspector.slippery")} on={!!ent.slippery} onChange={v => update({ slippery: v })} />
        <Toggle label={t("inspector.checkpoint")} on={!!ent.checkpoint} onChange={v => update({ checkpoint: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Toggle label={t("inspector.visible")} on={ent.visible ?? true} onChange={v => update({ visible: v })} />
        <Slider label={t("inspector.opacity")} value={Math.round((ent.opacity ?? 1) * 100)} min={0} max={100} step={5}
          onChange={v => update({ opacity: v / 100 })} />
      </div>
      <BehaviorsPanel ent={ent} onUpdate={update} />
      <ParticlesButton entity={ent} onUpdate={update} />

      {ent.goal && (
        <div className="panel rounded-md p-2 space-y-2 border border-primary/30">
          <div className="text-[10px] font-display tracking-widest text-primary-glow">{t("goal.onReach") || "AL ALCANZAR"}</div>
          <Toggle
            label={t("goal.endsGame") || "GANAR PARTIDA"}
            on={!!ent.endsGame}
            onChange={v => update({ endsGame: v })}
          />
          <div>
            <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("goal.nextScene") || "IR A ESCENA"}</label>
            <select
              value={ent.nextSceneId ?? ""}
              onChange={e => update({ nextSceneId: e.target.value || null })}
              className="w-full mt-1 bg-input/60 border border-border rounded-md px-2 py-2 text-xs font-mono"
            >
              <option value="">— {t("goal.none") || "Ninguna (solo ganar nivel)"} —</option>
              {(project?.scenes ?? []).filter(s => s.id !== scene.id).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <button
        onClick={() => update({ x: scene.width / 2 - ent.w / 2, y: scene.height / 2 - ent.h / 2 })}
        className="w-full py-2 rounded-md border border-border text-muted-foreground font-display text-[10px] tracking-widest"
      >{t("inspector.center")}</button>
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
        >{t("inspector.back")}</button>
        <button
          onClick={() => {
            const idx = scene.entities.findIndex(e => e.id === ent.id);
            if (idx < 0 || idx === scene.entities.length - 1) return;
            const next = [...scene.entities];
            [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
            onChangeScene({ ...scene, entities: next });
          }}
          className="py-2 rounded-md border border-border text-muted-foreground font-display text-[10px] tracking-widest"
        >{t("inspector.front")}</button>
        <button
          onClick={() => {
            const copy = { ...ent, id: uid(), x: ent.x + 20, y: ent.y + 20 };
            onChangeScene({ ...scene, entities: [...scene.entities, copy] });
            onSelect(copy.id);
          }}
          className="py-2 rounded-md bg-primary/15 border border-primary/40 text-primary-glow font-display text-[10px] tracking-widest"
        >{t("inspector.clone")}</button>
      </div>

      {ent.kind !== "player" && (
        <button
          onClick={() => {
            onChangeScene({ ...scene, entities: scene.entities.filter(e => e.id !== ent.id) });
            onSelect(null);
          }}
          className="w-full mt-2 py-2 rounded-md bg-destructive/20 border border-destructive/50 text-destructive font-display text-xs tracking-widest"
        >
          {t("inspector.delete")}
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
  useT();
  const set = (patch: Partial<Project["settings"]>) =>
    onChange({ ...project, settings: { ...project.settings, ...patch } });


  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <SectionTitle>PROJECT</SectionTitle>
      <Field label="Game name" value={project.name} onChange={v => onChange({ ...project, name: v })} />

      <SectionTitle>LANGUAGE · IDIOMA</SectionTitle>
      <div className="grid grid-cols-5 gap-1.5">
        {LANGS.map(l => (
          <button
            key={l.id}
            onClick={() => { setLang(l.id); set({ language: l.id }); }}
            className={`py-2 rounded-md border text-[10px] font-display tracking-widest flex flex-col items-center gap-0.5 ${
              getLang() === l.id ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"
            }`}
          >
            <span className="text-lg leading-none">{l.flag}</span>
            <span>{l.id.toUpperCase()}</span>
          </button>
        ))}
      </div>


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
        <Toggle label="Show hitbox" on={project.settings.showHitboxes ?? false} onChange={v => set({ showHitboxes: v })} />
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

function TexturePicker({ texture, fit = "stretch", onPick, onClear, onFit }: {
  texture: string | null;
  fit?: "stretch" | "contain" | "cover";
  onPick: (dataUrl: string) => void;
  onClear: () => void;
  onFit?: (f: "stretch" | "contain" | "cover") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drawOpen, setDrawOpen] = useState(false);
  const t = useT();
  return (
    <div>
      <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("inspector.texture")}</label>
      <div className="mt-1 flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          className="relative w-16 h-16 rounded-md border border-border bg-input/40 grid place-items-center overflow-hidden glow-border"
          style={{ backgroundColor: "#e5e7eb", backgroundImage: "linear-gradient(45deg,#9ca3af 25%,transparent 25%),linear-gradient(-45deg,#9ca3af 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#9ca3af 75%),linear-gradient(-45deg,transparent 75%,#9ca3af 75%)", backgroundSize: "12px 12px", backgroundPosition: "0 0,0 6px,6px -6px,-6px 0" }}
        >
          {texture ? (
            <img src={texture} alt="texture" className="absolute inset-0 w-full h-full" style={{ objectFit: fit === "stretch" ? "fill" : fit, imageRendering: "auto" }} />
          ) : (
            <span className="text-xl text-muted-foreground">＋</span>
          )}
        </button>
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => inputRef.current?.click()}
              className="text-[10px] font-display tracking-widest px-2 py-2 rounded-md bg-primary/15 border border-primary/50 text-primary-glow"
            >
              {t("texture.gallery")}
            </button>
            <button
              onClick={() => setDrawOpen(true)}
              className="text-[10px] font-display tracking-widest px-2 py-2 rounded-md bg-accent/20 border border-accent/50 text-primary-glow"
            >
              {t("texture.draw")}
            </button>
          </div>
          {texture && (
            <button
              onClick={onClear}
              className="text-[10px] font-display tracking-widest px-3 py-1.5 rounded-md border border-border text-muted-foreground"
            >
              {t("texture.clear")}
            </button>
          )}
        </div>
      </div>
      {drawOpen && (
        <PaintEditor
          onClose={() => setDrawOpen(false)}
          onSave={(asset) => {
            const url = asset.frames[0]?.composite;
            if (url) onPick(url);
            setDrawOpen(false);
          }}
        />
      )}
      {texture && onFit && (
        <div className="grid grid-cols-3 gap-1 mt-2">
          {(["stretch","contain","cover"] as const).map(m => (
            <button key={m}
              onClick={() => onFit(m)}
              className={`py-1 rounded text-[9px] font-display tracking-widest border ${
                fit === m ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"
              }`}
            >{m.toUpperCase()}</button>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/*"
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
  project, onChange, selectedEntity, onAssignTexture, onAssignAnimation, onPlaceOnScene,
}: {
  project: Project;
  onChange: (p: Project) => void;
  selectedEntity: Entity | null;
  onAssignTexture: (dataUrl: string) => void;
  onAssignAnimation: (sprite: SpriteAsset) => void;
  onPlaceOnScene: (sprite: SpriteAsset) => void;
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
            <div
              className="aspect-square rounded-md grid place-items-center overflow-hidden border border-border/30"
              style={{ backgroundColor: "#e5e7eb", backgroundImage: "linear-gradient(45deg,#9ca3af 25%,transparent 25%),linear-gradient(-45deg,#9ca3af 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#9ca3af 75%),linear-gradient(-45deg,transparent 75%,#9ca3af 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,0 8px,8px -8px,-8px 0" }}
            >
              {sp.frames[0]?.composite && (
                <img src={sp.frames[0].composite} alt={sp.name}
                  className="w-full h-full object-contain"
                  style={{ imageRendering: "auto" }} />
              )}
            </div>
            <div className="mt-1.5">
              <div className="text-xs font-display truncate text-primary-glow">{sp.name}</div>
              <div className="text-[9px] font-mono text-muted-foreground">{sp.width}×{sp.height} · {sp.frames.length}f</div>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              <button
                onClick={() => onPlaceOnScene(sp)}
                className="text-[10px] py-1.5 rounded bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/50 text-primary-glow font-display tracking-widest glow-border"
              >＋ PLACE</button>
              <button
                onClick={() => removeSprite(sp.id)}
                className="text-[10px] py-1.5 rounded bg-destructive/15 border border-destructive/40 text-destructive font-display tracking-widest"
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

function BehaviorsPanel({ ent, onUpdate }: { ent: Entity; onUpdate: (patch: Partial<Entity>) => void }) {
  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="text-[10px] font-display tracking-widest text-primary-glow">BEHAVIORS</div>

      {/* Moving platform */}
      <div className="panel rounded-md p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-display tracking-widest text-muted-foreground">MOVING</span>
          <button
            onClick={() => onUpdate({ moving: ent.moving ? null : { axis: "x", range: 120, speed: 80 } })}
            className="text-[10px] font-display tracking-widest px-2 py-0.5 rounded border border-border"
          >{ent.moving ? "OFF" : "ON"}</button>
        </div>
        {ent.moving && (
          <>
            <div className="grid grid-cols-2 gap-1">
              <button onClick={() => onUpdate({ moving: { ...ent.moving!, axis: "x" } })}
                className={`py-1 rounded text-[10px] font-display tracking-widest border ${ent.moving.axis === "x" ? "bg-primary/20 border-primary" : "border-border"}`}>X</button>
              <button onClick={() => onUpdate({ moving: { ...ent.moving!, axis: "y" } })}
                className={`py-1 rounded text-[10px] font-display tracking-widest border ${ent.moving.axis === "y" ? "bg-primary/20 border-primary" : "border-border"}`}>Y</button>
            </div>
            <Slider label="Range" value={ent.moving.range} min={20} max={800} step={10}
              onChange={v => onUpdate({ moving: { ...ent.moving!, range: v } })} />
            <Slider label="Speed" value={ent.moving.speed} min={10} max={400} step={10}
              onChange={v => onUpdate({ moving: { ...ent.moving!, speed: v } })} />
          </>
        )}
      </div>

      {/* Crumble */}
      <div className="panel rounded-md p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-display tracking-widest text-muted-foreground">CRUMBLE</span>
          <button
            onClick={() => onUpdate({ crumble: ent.crumble ? null : { delay: 0.6, respawn: 3 } })}
            className="text-[10px] font-display tracking-widest px-2 py-0.5 rounded border border-border"
          >{ent.crumble ? "OFF" : "ON"}</button>
        </div>
        {ent.crumble && (
          <>
            <Slider label="Delay s" value={Math.round(ent.crumble.delay * 10) / 10} min={0.1} max={3} step={0.1}
              onChange={v => onUpdate({ crumble: { ...ent.crumble!, delay: v } })} />
            <Slider label="Respawn s" value={ent.crumble.respawn} min={0} max={10} step={0.5}
              onChange={v => onUpdate({ crumble: { ...ent.crumble!, respawn: v } })} />
          </>
        )}
      </div>

      {/* Spring */}
      <div className="panel rounded-md p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-display tracking-widest text-muted-foreground">SPRING</span>
          <button
            onClick={() => onUpdate({ spring: ent.spring ? null : { force: 820 } })}
            className="text-[10px] font-display tracking-widest px-2 py-0.5 rounded border border-border"
          >{ent.spring ? "OFF" : "ON"}</button>
        </div>
        {ent.spring && (
          <Slider label="Force" value={ent.spring.force} min={200} max={1600} step={20}
            onChange={v => onUpdate({ spring: { force: v } })} />
        )}
      </div>

      {/* Patrol (enemy) */}
      {ent.kind === "enemy" && (
        <div className="panel rounded-md p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-display tracking-widest text-muted-foreground">PATROL</span>
            <button
              onClick={() => onUpdate({ patrol: ent.patrol ? null : { range: 120 } })}
              className="text-[10px] font-display tracking-widest px-2 py-0.5 rounded border border-border"
            >{ent.patrol ? "OFF" : "ON"}</button>
          </div>
          {ent.patrol && (
            <Slider label="Range" value={ent.patrol.range} min={20} max={600} step={10}
              onChange={v => onUpdate({ patrol: { range: v } })} />
          )}
        </div>
      )}

      {/* Coin/pickup options */}
      {ent.collectible && (
        <div className="panel rounded-md p-2 space-y-1.5">
          <Slider label="Value" value={ent.value ?? 10} min={1} max={100} step={1}
            onChange={v => onUpdate({ value: v })} />
          <div className="text-[10px] font-display tracking-widest text-muted-foreground">POWER-UP</div>
          <div className="grid grid-cols-4 gap-1">
            {(["none","speed","djump","invuln"] as const).map(p => (
              <button key={p}
                onClick={() => onUpdate({ powerup: p === "none" ? null : p })}
                className={`py-1 rounded text-[10px] font-display tracking-widest border ${(ent.powerup ?? "none") === p ? "bg-primary/20 border-primary" : "border-border"}`}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Switch / Door linkage */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">SWITCH ID</label>
          <input value={ent.switchId ?? ""} onChange={e => onUpdate({ switchId: e.target.value || undefined })}
            placeholder="e.g. A"
            className="w-full mt-1 px-2 py-1 rounded bg-background border border-border text-xs font-mono" />
        </div>
        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">DOOR ID</label>
          <input value={ent.doorId ?? ""} onChange={e => onUpdate({ doorId: e.target.value || undefined })}
            placeholder="e.g. A"
            className="w-full mt-1 px-2 py-1 rounded bg-background border border-border text-xs font-mono" />
        </div>
      </div>
    </div>
  );
}

function SceneBgImage({ scene, onChange }: { scene: Scene; onChange: (s: Scene) => void }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="panel rounded-md p-2 space-y-2">
      <div className="text-[10px] font-display tracking-widest text-muted-foreground">{t("scene.bgImage")}</div>
      {scene.bgImage && (
        <div className="relative w-full h-24 rounded overflow-hidden border border-border bg-background">
          <img src={scene.bgImage} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => ref.current?.click()}
          className="py-1.5 rounded border border-border text-[10px] font-display tracking-widest text-primary-glow"
        >{t("scene.bgImagePick")}</button>
        <button
          onClick={() => onChange({ ...scene, bgImage: null })}
          className="py-1.5 rounded border border-border text-[10px] font-display tracking-widest text-muted-foreground"
        >{t("scene.bgImageClear")}</button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {(["cover","contain","stretch","tile"] as const).map(m => (
          <button key={m}
            onClick={() => onChange({ ...scene, bgImageMode: m })}
            className={`py-1 rounded text-[9px] font-display tracking-widest border ${
              (scene.bgImageMode ?? "cover") === m ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"
            }`}
          >{m.toUpperCase()}</button>
        ))}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async e => {
          const f = e.target.files?.[0];
          if (!f) return;
          const url = await fileToDataURL(f);
          onChange({ ...scene, bgImage: url });
          if (ref.current) ref.current.value = "";
        }}
      />
    </div>
  );
}

function ParticlesButton({ entity, onUpdate }: { entity: Entity; onUpdate: (patch: Partial<Entity>) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const has = !!entity.emitter;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full py-2 rounded-md font-display text-[10px] tracking-widest border ${
          has ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"
        }`}
      >✦ {t("inspector.particles")}{has ? " · ON" : ""}</button>
      {open && (
        <ParticleEditor
          entity={entity}
          onUpdate={onUpdate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ParticleEditor({ entity, onUpdate, onClose }: { entity: Entity; onUpdate: (patch: Partial<Entity>) => void; onClose: () => void }) {
  const t = useT();
  // If the entity has no emitter yet, the toggle must reflect that (OFF) so
  // turning it ON actually persists an emitter. Previously the default
  // {enabled:true} made the toggle appear ON while no emitter was saved,
  // so the user had to flip it off then on again to make it work.
  const hasEmitter = !!entity.emitter;
  const em = entity.emitter ?? {
    enabled: false, rate: 20, lifetime: 1, speed: 80,
    direction: 270, spread: 40, size: 4, gravity: 0, color: "#7dd3fc",
  };
  const upd = (patch: Partial<typeof em>) =>
    onUpdate({ emitter: { ...em, ...patch } });


  // Live preview
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number };
    const ps: P[] = [];
    let acc = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      acc += (em.rate || 0) * dt;
      while (acc >= 1) {
        acc -= 1;
        const dir = ((em.direction || 0) + (Math.random() - 0.5) * (em.spread || 0)) * Math.PI / 180;
        const sp = em.speed || 80;
        ps.push({ x: c.width / 2, y: c.height / 2, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, life: em.lifetime || 1, max: em.lifetime || 1 });
      }
      ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, c.width, c.height);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (em.gravity ?? 0) * dt;
        p.life -= dt;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = em.color || "#7dd3fc";
        ctx.fillRect(p.x - (em.size || 4) / 2, p.y - (em.size || 4) / 2, em.size || 4, em.size || 4);
      }
      ctx.globalAlpha = 1;
      // direction arrow
      const cx = c.width / 2, cy = c.height / 2;
      const dr = (em.direction || 0) * Math.PI / 180;
      ctx.strokeStyle = "rgba(125,211,252,0.5)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(dr) * 30, cy + Math.sin(dr) * 30); ctx.stroke();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [em.rate, em.direction, em.spread, em.speed, em.lifetime, em.gravity, em.size, em.color]);

  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-2">
      <div className="panel glow-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-display text-sm tracking-widest text-primary-glow">✦ {t("inspector.particles")}</div>
          <button onClick={onClose} className="text-xs font-display tracking-widest text-muted-foreground">✕</button>
        </div>

        <Toggle label={t("particles.enable")} on={hasEmitter && em.enabled} onChange={v => upd({ enabled: v })} />

        <div className="rounded-md overflow-hidden border border-border bg-background">
          <canvas ref={canvasRef} width={320} height={180} className="w-full block" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Slider label={t("particles.rate")} value={em.rate} min={0} max={200} step={1} onChange={v => upd({ rate: v })} />
          <Slider label={t("particles.lifetime")} value={Math.round(em.lifetime * 10) / 10} min={0.1} max={6} step={0.1} onChange={v => upd({ lifetime: v })} />
          <Slider label={t("particles.speed")} value={em.speed} min={0} max={600} step={5} onChange={v => upd({ speed: v })} />
          <Slider label={t("particles.size")} value={em.size} min={1} max={24} step={1} onChange={v => upd({ size: v })} />
          <Slider label={t("particles.direction")} value={em.direction} min={0} max={360} step={5} onChange={v => upd({ direction: v })} />
          <Slider label={t("particles.spread")} value={em.spread} min={0} max={360} step={5} onChange={v => upd({ spread: v })} />
          <Slider label={t("particles.gravity")} value={em.gravity} min={-600} max={1200} step={20} onChange={v => upd({ gravity: v })} />
        </div>

        <div className="grid grid-cols-4 gap-1">
          {[0, 45, 90, 135, 180, 225, 270, 315].map(d => (
            <button key={d}
              onClick={() => upd({ direction: d })}
              className={`py-1 rounded text-[10px] font-display tracking-widest border ${
                em.direction === d ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"
              }`}
            >{d}°</button>
          ))}
        </div>

        <div>
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">{t("particles.color")}</label>
          <input type="color" value={em.color}
            onChange={e => upd({ color: e.target.value })}
            className="w-full h-10 rounded-md bg-transparent border border-border mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => onUpdate({ emitter: null })}
            className="py-2 rounded-md border border-destructive/50 text-destructive font-display text-[10px] tracking-widest"
          >REMOVE</button>
          <button
            onClick={onClose}
            className="py-2 rounded-md bg-primary text-primary-foreground font-display text-[10px] tracking-widest"
          >{t("particles.close")}</button>
        </div>
      </div>
    </div>
  );
}

function LayersPanel({
  scene,
  onChangeScene,
  selectedId,
  onSelect,
}: {
  scene: import("@/lib/engine/core").Scene;
  onChangeScene: (s: import("@/lib/engine/core").Scene) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  // Render sorted by z desc (top layer first) — but reorder operates on the
  // underlying entities array (z is the source of truth for draw order).
  const sorted = [...scene.entities].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
  const patch = (id: string, p: Partial<Entity>) =>
    onChangeScene({ ...scene, entities: scene.entities.map(e => e.id === id ? { ...e, ...p } : e) });
  const bumpZ = (id: string, dir: 1 | -1) => {
    const e = scene.entities.find(x => x.id === id);
    if (!e) return;
    const cur = e.z ?? 0;
    patch(id, { z: Math.max(-20, Math.min(20, cur + dir)) });
  };
  const toTop = (id: string) => {
    const maxZ = scene.entities.reduce((m, e) => Math.max(m, e.z ?? 0), 0);
    patch(id, { z: Math.min(20, maxZ + 1) });
  };
  const toBottom = (id: string) => {
    const minZ = scene.entities.reduce((m, e) => Math.min(m, e.z ?? 0), 0);
    patch(id, { z: Math.max(-20, minZ - 1) });
  };
  const remove = (id: string) => {
    const e = scene.entities.find(x => x.id === id);
    if (!e || e.kind === "player") return;
    onChangeScene({ ...scene, entities: scene.entities.filter(x => x.id !== id) });
    if (selectedId === id) onSelect(null);
  };
  return (
    <div className="mt-2 space-y-1">
      {sorted.length === 0 && (
        <div className="text-[10px] font-mono text-muted-foreground px-2 py-3 text-center border border-dashed border-border rounded">
          NO LAYERS
        </div>
      )}
      {sorted.map(e => {
        const isSel = e.id === selectedId;
        const visible = e.visible ?? true;
        const locked = !!e.locked;
        return (
          <div
            key={e.id}
            className={`group flex items-center gap-1 panel rounded-md pl-1.5 pr-1 py-1 text-xs border ${
              isSel ? "border-primary/70 bg-primary/10" : "border-border/40"
            }`}
          >
            <button
              onClick={() => bumpZ(e.id, 1)}
              title="Forward"
              className="w-5 h-5 grid place-items-center rounded text-[9px] font-mono text-muted-foreground hover:text-primary-glow"
            >▲</button>
            <button
              onClick={() => bumpZ(e.id, -1)}
              title="Backward"
              className="w-5 h-5 grid place-items-center rounded text-[9px] font-mono text-muted-foreground hover:text-primary-glow"
            >▼</button>
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: e.color, boxShadow: visible ? `0 0 8px ${e.color}` : undefined, opacity: visible ? 1 : 0.3 }}
            />
            <button
              onClick={() => onSelect(e.id)}
              className="flex-1 flex items-center gap-1.5 text-left min-w-0"
            >
              <span className="font-display tracking-wider text-[10px] truncate">{e.kind.toUpperCase()}</span>
              <span className="ml-auto font-mono text-[9px] text-muted-foreground shrink-0">z{e.z ?? 0}</span>
            </button>
            <button
              onClick={() => patch(e.id, { visible: !visible })}
              title={visible ? "Hide" : "Show"}
              className={`w-6 h-6 grid place-items-center rounded text-xs ${visible ? "text-primary-glow" : "text-muted-foreground/50"}`}
            >{visible ? "◉" : "◌"}</button>
            <button
              onClick={() => patch(e.id, { locked: !locked })}
              title={locked ? "Unlock" : "Lock"}
              className={`w-6 h-6 grid place-items-center rounded text-xs ${locked ? "text-destructive" : "text-muted-foreground/60"}`}
            >{locked ? "🔒" : "🔓"}</button>
            <button
              onClick={() => toTop(e.id)}
              title="Move to top"
              className="hidden sm:grid w-6 h-6 place-items-center rounded text-[9px] text-muted-foreground"
            >⇈</button>
            <button
              onClick={() => toBottom(e.id)}
              title="Move to bottom"
              className="hidden sm:grid w-6 h-6 place-items-center rounded text-[9px] text-muted-foreground"
            >⇊</button>
            {e.kind !== "player" && (
              <button
                onClick={() => remove(e.id)}
                title="Delete"
                className="w-6 h-6 grid place-items-center rounded text-xs text-destructive/70 hover:text-destructive"
              >✕</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
