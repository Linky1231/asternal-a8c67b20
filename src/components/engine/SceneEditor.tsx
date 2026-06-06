import { useEffect, useRef, useState } from "react";
import type { Entity, EntityKind, Scene } from "@/lib/engine/core";
import { KIND_PRESETS, uid } from "@/lib/engine/core";

interface Props {
  scene: Scene;
  tool: EntityKind | "select" | "erase";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (scene: Scene) => void;
}

export function SceneEditor({ scene, tool, selectedId, onSelect, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.55);

  // pointer state
  const drag = useRef<{
    mode: "pan" | "move" | "place" | null;
    startX: number;
    startY: number;
    entStartX?: number;
    entStartY?: number;
    panStart?: { x: number; y: number };
    entId?: string;
  }>({ mode: null, startX: 0, startY: 0 });

  // Fit on mount/resize
  useEffect(() => {
    const fit = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const s = Math.min(wrap.clientWidth / scene.width, wrap.clientHeight / scene.height) * 0.95;
      setScale(s);
      setPan({
        x: (wrap.clientWidth - scene.width * s) / 2,
        y: (wrap.clientHeight - scene.height * s) / 2,
      });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [scene.width, scene.height]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(scale, scale);

    // world bg
    const grd = ctx.createLinearGradient(0, 0, 0, scene.height);
    grd.addColorStop(0, "#0b1e3f");
    grd.addColorStop(1, "#030712");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, scene.width, scene.height);

    // grid
    ctx.strokeStyle = "rgba(56,189,248,0.18)";
    ctx.lineWidth = 1 / scale;
    for (let x = 0; x <= scene.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, scene.height); ctx.stroke();
    }
    for (let y = 0; y <= scene.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(scene.width, y); ctx.stroke();
    }
    // border
    ctx.strokeStyle = "rgba(125,211,252,0.7)";
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(0, 0, scene.width, scene.height);

    for (const e of scene.entities) {
      ctx.save();
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 12 / scale;
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      if (e.id === selectedId) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#7dd3fc";
        ctx.lineWidth = 3 / scale;
        ctx.setLineDash([8 / scale, 6 / scale]);
        ctx.strokeRect(e.x - 2, e.y - 2, e.w + 4, e.h + 4);
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    ctx.restore();
  }, [scene, pan, scale, selectedId]);

  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - pan.x) / scale,
    y: (sy - pan.y) / scale,
  });

  const hitTest = (wx: number, wy: number) => {
    for (let i = scene.entities.length - 1; i >= 0; i--) {
      const e = scene.entities[i];
      if (wx >= e.x && wx <= e.x + e.w && wy >= e.y && wy <= e.y + e.h) return e;
    }
    return null;
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.target as Element).setPointerCapture(ev.pointerId);
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const w = screenToWorld(sx, sy);

    if (tool === "select") {
      const hit = hitTest(w.x, w.y);
      if (hit) {
        onSelect(hit.id);
        drag.current = { mode: "move", startX: sx, startY: sy, entStartX: hit.x, entStartY: hit.y, entId: hit.id };
      } else {
        onSelect(null);
        drag.current = { mode: "pan", startX: sx, startY: sy, panStart: { ...pan } };
      }
    } else if (tool === "erase") {
      const hit = hitTest(w.x, w.y);
      if (hit && hit.kind !== "player") {
        onChange({ ...scene, entities: scene.entities.filter(e => e.id !== hit.id) });
      }
    } else {
      // place
      const preset = KIND_PRESETS[tool];
      const ent: Entity = {
        ...preset,
        id: uid(),
        x: Math.round((w.x - preset.w / 2) / 20) * 20,
        y: Math.round((w.y - preset.h / 2) / 20) * 20,
      };
      // ensure single player
      let entities = scene.entities;
      if (tool === "player") entities = entities.filter(e => e.kind !== "player");
      onChange({ ...scene, entities: [...entities, ent] });
      onSelect(ent.id);
    }
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    if (!drag.current.mode) return;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    if (drag.current.mode === "pan" && drag.current.panStart) {
      setPan({
        x: drag.current.panStart.x + (sx - drag.current.startX),
        y: drag.current.panStart.y + (sy - drag.current.startY),
      });
    } else if (drag.current.mode === "move" && drag.current.entId) {
      const dx = (sx - drag.current.startX) / scale;
      const dy = (sy - drag.current.startY) / scale;
      const entities = scene.entities.map(e =>
        e.id === drag.current.entId
          ? { ...e, x: Math.round((drag.current.entStartX! + dx) / 20) * 20, y: Math.round((drag.current.entStartY! + dy) / 20) * 20 }
          : e
      );
      onChange({ ...scene, entities });
    }
  };

  const onPointerUp = () => {
    drag.current.mode = null;
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden cyber-grid">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="absolute top-2 left-2 panel rounded-md px-2 py-1 text-[10px] font-mono text-primary-glow">
        {scene.width}×{scene.height} · {Math.round(scale * 100)}%
      </div>
      <div className="absolute top-2 right-2 flex gap-1">
        <ZoomBtn onClick={() => setScale(s => Math.max(0.2, s - 0.1))}>−</ZoomBtn>
        <ZoomBtn onClick={() => setScale(s => Math.min(2, s + 0.1))}>+</ZoomBtn>
      </div>
    </div>
  );
}

function ZoomBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="panel rounded-md w-8 h-8 font-display text-primary-glow glow-border">
      {children}
    </button>
  );
}
