import { useEffect, useRef, useState } from "react";
import type { Entity, SpriteAsset } from "@/lib/engine/core";
import { uid } from "@/lib/engine/core";
import type { AnimationClip, AnimState } from "@/lib/engine/animations";
import { DEFAULT_ANIM_NAMES, currentFrameImage } from "@/lib/engine/animations";
import { drawTransparencyGrid, fileToDataURL, preloadImage } from "@/lib/engine/images";
import { PaintEditor } from "./PaintEditor";
import { useT } from "@/lib/i18n";

interface Props {
  entity: Entity;
  onChange: (patch: Partial<Entity>) => void;
  onClose: () => void;
}

export function AnimationEditor({ entity, onChange, onClose }: Props) {
  const clips = entity.animations ?? [];
  const [activeId, setActiveId] = useState<string | null>(clips[0]?.id ?? null);
  const active = clips.find(c => c.id === activeId) ?? null;

  const setClips = (next: AnimationClip[]) => onChange({ animations: next });

  const addClip = (name: AnimState = "idle") => {
    const clip: AnimationClip = { id: uid(), name, fps: 8, loop: true, frames: [] };
    const next = [...clips, clip];
    setClips(next);
    setActiveId(clip.id);
  };

  const updateClip = (patch: Partial<AnimationClip>) => {
    if (!active) return;
    setClips(clips.map(c => c.id === active.id ? { ...c, ...patch } : c));
  };

  const duplicateClip = (c: AnimationClip) => {
    const copy: AnimationClip = { ...c, id: uid(), name: c.name + "_copy", frames: [...c.frames] };
    setClips([...clips, copy]);
    setActiveId(copy.id);
  };

  const deleteClip = (c: AnimationClip) => {
    const next = clips.filter(x => x.id !== c.id);
    setClips(next);
    if (activeId === c.id) setActiveId(next[0]?.id ?? null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2 panel border-b">
        <div>
          <div className="font-display text-sm text-primary-glow glow-text leading-none">ANIMATIONS</div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{entity.kind.toUpperCase()} · {clips.length} clips</div>
        </div>
        <button
          onClick={onClose}
          className="font-display text-xs px-3 py-1.5 rounded-md bg-primary/15 border border-primary/50 text-primary-glow"
        >
          ✕ CLOSE
        </button>
      </header>

      {/* Clips list */}
      <div className="px-2 pt-2 border-b panel">
        <div className="flex gap-1.5 overflow-x-auto pb-2 no-scrollbar">
          {clips.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`shrink-0 px-3 py-1.5 rounded-md min-w-[72px] border transition flex flex-col items-center gap-0.5 ${
                activeId === c.id
                  ? "bg-primary/20 border-primary text-primary-glow shadow-[0_0_12px_oklch(0.68_0.21_250/0.5)]"
                  : "border-border/40 text-muted-foreground"
              }`}
            >
              <span className="text-[9px] font-display tracking-widest uppercase">{c.name || "?"}</span>
              <span className="text-[9px] font-mono opacity-70">{c.frames.length}f</span>
            </button>
          ))}
          <button
            onClick={() => addClip()}
            className="shrink-0 px-3 py-1.5 rounded-md min-w-[58px] border-2 border-dashed border-primary/40 text-primary-glow font-display text-xs"
          >
            + NEW
          </button>
        </div>
        {/* Quick presets */}
        {clips.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pb-2">
            {DEFAULT_ANIM_NAMES.map(n => (
              <button
                key={n}
                onClick={() => addClip(n)}
                className="text-[10px] font-display tracking-widest px-2 py-1 rounded-md border border-border text-muted-foreground"
              >
                + {n.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active clip editor */}
      <div className="flex-1 min-h-0 overflow-auto">
        {active ? (
          <ClipPanel
            entity={entity}
            clip={active}
            onUpdate={updateClip}
            onDuplicate={() => duplicateClip(active)}
            onDelete={() => deleteClip(active)}
          />
        ) : (
          <div className="h-full grid place-items-center text-center text-muted-foreground p-6">
            <div>
              <div className="font-display text-sm mb-2 text-primary-glow">NO ANIMATIONS YET</div>
              <div className="text-xs">Create one above or pick a preset (idle, walk, jump…).</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClipPanel({
  entity, clip, onUpdate, onDuplicate, onDelete,
}: {
  entity: Entity;
  clip: AnimationClip;
  onUpdate: (patch: Partial<AnimationClip>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState(true);
  const [t0, setT0] = useState(performance.now());
  const [paintOpen, setPaintOpen] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  // Preview loop — composites a temp entity with this clip as "idle"
  useEffect(() => {
    const cnv = previewRef.current!;
    const ctx = cnv.getContext("2d")!;
    let mounted = true;

    // ensure frames are decoded
    clip.frames.forEach(f => { preloadImage(f).catch(() => {}); });

    const tempEntity: Entity = { ...entity, animations: [{ ...clip, name: "idle" }] };
    const draw = () => {
      if (!mounted) return;
      const W = cnv.clientWidth, H = cnv.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cnv.width !== W * dpr || cnv.height !== H * dpr) {
        cnv.width = W * dpr; cnv.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTransparencyGrid(ctx, 0, 0, W, H, 16);

      const t = playing ? (performance.now() - t0) / 1000 : 0;
      const img = currentFrameImage(tempEntity, t, "idle");
      if (img && clip.frames.length) {
        const ratio = img.naturalWidth / img.naturalHeight || 1;
        const maxH = H * 0.8, maxW = W * 0.8;
        let dw = maxW, dh = dw / ratio;
        if (dh > maxH) { dh = maxH; dw = dh * ratio; }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = "rgba(125,211,252,0.6)";
        ctx.font = "600 12px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillText("No frames — import some below", W / 2, H / 2);
      }

      // playhead
      if (clip.frames.length) {
        const fps = Math.max(1, clip.fps);
        const idx = Math.floor((playing ? (performance.now() - t0) / 1000 : 0) * fps);
        const i = clip.loop
          ? ((idx % clip.frames.length) + clip.frames.length) % clip.frames.length
          : Math.min(idx, clip.frames.length - 1);
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "600 10px ui-monospace, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${i + 1}/${clip.frames.length} · ${fps}fps${clip.loop ? " · loop" : ""}`, 8, H - 8);
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { mounted = false; cancelAnimationFrame(rafRef.current); };
  }, [clip, entity, playing, t0]);

  const importFrames = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const urls: string[] = [];
    for (const f of Array.from(files)) {
      try { urls.push(await fileToDataURL(f)); } catch { /* skip */ }
    }
    if (urls.length) onUpdate({ frames: [...clip.frames, ...urls] });
  };

  const moveFrame = (idx: number, dir: -1 | 1) => {
    const next = [...clip.frames];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onUpdate({ frames: next });
  };

  const deleteFrame = (idx: number) => {
    onUpdate({ frames: clip.frames.filter((_, i) => i !== idx) });
  };

  return (
    <div className="p-3 space-y-3">
      {/* Preview */}
      <div className="rounded-lg overflow-hidden border border-border glow-border">
        <canvas ref={previewRef} className="w-full block" style={{ height: 200 }} />
      </div>

      {/* Transport */}
      <div className="flex gap-2">
        <button
          onClick={() => { setPlaying(p => !p); if (!playing) setT0(performance.now()); }}
          className="flex-1 py-2 rounded-md bg-primary/20 border border-primary/50 text-primary-glow font-display text-xs tracking-widest"
        >
          {playing ? "⏸ PAUSE" : "▶ PLAY"}
        </button>
        <button
          onClick={() => setT0(performance.now())}
          className="flex-1 py-2 rounded-md border border-border text-muted-foreground font-display text-xs tracking-widest"
        >
          ↺ RESTART
        </button>
      </div>

      {/* Name */}
      <div>
        <label className="text-[10px] font-display tracking-widest text-muted-foreground">NAME</label>
        <input
          value={clip.name}
          onChange={e => onUpdate({ name: e.target.value })}
          placeholder="idle, walk, jump…"
          className="w-full mt-1 bg-input/60 border border-border rounded-md px-2 py-2 text-sm font-mono"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {DEFAULT_ANIM_NAMES.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onUpdate({ name: n })}
              className={`text-[10px] font-display tracking-widest px-2 py-1 rounded-md border transition ${
                clip.name === n
                  ? "bg-primary/20 border-primary text-primary-glow"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary-glow"
              }`}
            >
              {n.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-baseline">
          <label className="text-[10px] font-display tracking-widest text-muted-foreground">FPS · SPEED</label>
          <span className="text-[10px] font-mono text-primary-glow">{clip.fps}</span>
        </div>
        <input
          type="range" min={1} max={30} step={1} value={clip.fps}
          onChange={e => onUpdate({ fps: Number(e.target.value) })}
          className="w-full accent-[oklch(0.68_0.21_250)]"
        />
      </div>

      <button
        onClick={() => onUpdate({ loop: !clip.loop })}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-md border ${
          clip.loop ? "border-primary/60 bg-primary/15 text-primary-glow" : "border-border text-muted-foreground"
        }`}
      >
        <span className="text-xs font-display tracking-widest">{clip.loop ? "LOOP" : "PLAY ONCE"}</span>
        <span className={`w-8 h-4 rounded-full p-0.5 transition ${clip.loop ? "bg-primary" : "bg-muted"}`}>
          <span className={`block w-3 h-3 rounded-full bg-background transition ${clip.loop ? "translate-x-4" : ""}`} />
        </span>
      </button>

      {/* Timeline */}
      <div>
        <div className="flex items-center justify-between mb-1.5 gap-1.5">
          <h3 className="font-display text-xs tracking-[0.25em] text-primary-glow glow-text">TIMELINE</h3>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPaintOpen(true)}
              className="text-[10px] font-display tracking-widest px-2 py-1 rounded-md bg-gradient-to-r from-accent/30 to-primary/30 border border-accent/50 text-primary-glow glow-border"
            >
              ✎ DRAW FRAME
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className="text-[10px] font-display tracking-widest px-2 py-1 rounded-md bg-primary/15 border border-primary/50 text-primary-glow"
            >
              + IMPORT FRAMES
            </button>
          </div>
        </div>
        {paintOpen && (
          <PaintEditor
            onClose={() => setPaintOpen(false)}
            onSave={(sprite: SpriteAsset) => {
              const composite = sprite.frames[0]?.composite;
              if (composite) onUpdate({ frames: [...clip.frames, composite] });
              setPaintOpen(false);
            }}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/*"
          multiple
          className="hidden"
          onChange={e => { importFrames(e.target.files); e.target.value = ""; }}
        />


        <div className="flex gap-1.5 overflow-x-auto pb-2 no-scrollbar">
          {clip.frames.map((src, i) => (
            <div key={i} className="shrink-0 w-20 panel rounded-md p-1 border border-border/60">
              <div
                className="relative w-full h-14 rounded overflow-hidden"
                style={{ backgroundColor: "#e5e7eb", backgroundImage: "linear-gradient(45deg,#9ca3af 25%,transparent 25%),linear-gradient(-45deg,#9ca3af 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#9ca3af 75%),linear-gradient(-45deg,transparent 75%,#9ca3af 75%)", backgroundSize: "12px 12px", backgroundPosition: "0 0,0 6px,6px -6px,-6px 0" }}
              >
                <img src={src} alt={`frame ${i + 1}`} className="absolute inset-0 w-full h-full object-contain" style={{ imageRendering: "auto" }} />
                <span className="absolute top-0.5 left-1 text-[9px] font-mono text-primary-glow">{i + 1}</span>
              </div>
              <div className="flex justify-between mt-1">
                <button onClick={() => moveFrame(i, -1)} className="text-[10px] text-muted-foreground px-1">◀</button>
                <button onClick={() => deleteFrame(i)} className="text-[10px] text-destructive px-1">✕</button>
                <button onClick={() => moveFrame(i, 1)} className="text-[10px] text-muted-foreground px-1">▶</button>
              </div>
            </div>
          ))}
          {clip.frames.length === 0 && (
            <button
              onClick={() => inputRef.current?.click()}
              className="shrink-0 w-full min-w-[200px] h-20 rounded-md border-2 border-dashed border-primary/40 text-primary-glow font-display text-xs"
            >
              TAP TO IMPORT FRAMES FROM GALLERY
            </button>
          )}
        </div>
      </div>

      {/* Clip actions */}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button
          onClick={onDuplicate}
          className="py-2 rounded-md border border-border text-muted-foreground font-display text-xs tracking-widest"
        >
          ⧉ DUPLICATE
        </button>
        <button
          onClick={() => { if (confirm(`Delete "${clip.name}"?`)) onDelete(); }}
          className="py-2 rounded-md bg-destructive/20 border border-destructive/50 text-destructive font-display text-xs tracking-widest"
        >
          ✕ DELETE
        </button>
      </div>

      <div className="text-center text-[10px] font-mono text-muted-foreground pt-2">
        Tip: name clips <span className="text-primary-glow">walk</span>, <span className="text-primary-glow">jump</span>, <span className="text-primary-glow">fall</span> for auto state-switching.
      </div>
    </div>
  );
}
