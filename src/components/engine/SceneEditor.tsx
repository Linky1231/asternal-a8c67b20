import { useEffect, useRef, useState } from "react";
import type { Entity, EntityKind, Scene } from "@/lib/engine/core";
import { KIND_PRESETS, uid } from "@/lib/engine/core";
import { getImage } from "@/lib/engine/images";
import { currentFrameImage } from "@/lib/engine/animations";

interface Props {
  scene: Scene;
  tool: EntityKind | "select" | "erase";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (scene: Scene) => void;
}

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_PX = 14; // screen-space handle size
const SNAP = 20;

function handlePos(e: Entity, h: HandleId) {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  switch (h) {
    case "nw": return { x: e.x, y: e.y };
    case "n":  return { x: cx, y: e.y };
    case "ne": return { x: e.x + e.w, y: e.y };
    case "e":  return { x: e.x + e.w, y: cy };
    case "se": return { x: e.x + e.w, y: e.y + e.h };
    case "s":  return { x: cx, y: e.y + e.h };
    case "sw": return { x: e.x, y: e.y + e.h };
    case "w":  return { x: e.x, y: cy };
  }
}

function resizeEntity(e: Entity, h: HandleId, wx: number, wy: number): Entity {
  const snap = (v: number) => Math.round(v / SNAP) * SNAP;
  let { x, y, w, h: he } = e;
  const right = x + w;
  const bottom = y + he;
  if (h.includes("w")) { const nx = Math.min(snap(wx), right - SNAP); w = right - nx; x = nx; }
  if (h.includes("e")) { const nr = Math.max(snap(wx), x + SNAP); w = nr - x; }
  if (h.includes("n")) { const ny = Math.min(snap(wy), bottom - SNAP); he = bottom - ny; y = ny; }
  if (h.includes("s")) { const nb = Math.max(snap(wy), y + SNAP); he = nb - y; }
  return { ...e, x, y, w, h: he };
}

export function SceneEditor({ scene, tool, selectedId, onSelect, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.55);
  const animRef = useRef(0);

  // Pointer tracking for multi-touch
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{
    mode: "idle" | "pan" | "move" | "resize" | "place" | "pinch";
    startSX?: number; startSY?: number;
    entStartX?: number; entStartY?: number; entStartW?: number; entStartH?: number;
    entId?: string;
    handle?: HandleId;
    panStart?: { x: number; y: number };
    pinchStartDist?: number;
    pinchStartScale?: number;
    pinchStartCenter?: { x: number; y: number };
    pinchStartPan?: { x: number; y: number };
  }>({ mode: "idle" });

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

  // Draw (continuous to support texture load + dashed-marquee animation)
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let mounted = true;

    const setupSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const render = (t: number) => {
      if (!mounted) return;
      setupSize();
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(scale, scale);

      // bg
      const grd = ctx.createLinearGradient(0, 0, 0, scene.height);
      grd.addColorStop(0, "#0b1e3f");
      grd.addColorStop(1, "#030712");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, scene.width, scene.height);

      // grid
      ctx.strokeStyle = "rgba(56,189,248,0.16)";
      ctx.lineWidth = 1 / scale;
      for (let x = 0; x <= scene.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, scene.height); ctx.stroke();
      }
      for (let y = 0; y <= scene.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(scene.width, y); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(125,211,252,0.6)";
      ctx.lineWidth = 2 / scale;
      ctx.strokeRect(0, 0, scene.width, scene.height);

      const tSec = t / 1000;
      for (const e of scene.entities) {
        ctx.save();
        const animImg = currentFrameImage(e, tSec, "idle");
        if (animImg) {
          ctx.drawImage(animImg, e.x, e.y, e.w, e.h);
        } else if (e.texture) {
          const img = getImage(e.texture);
          if (img) {
            ctx.drawImage(img, e.x, e.y, e.w, e.h);
          } else {
            ctx.fillStyle = "rgba(56,189,248,0.15)";
            ctx.fillRect(e.x, e.y, e.w, e.h);
          }
        } else {
          ctx.shadowColor = e.color;
          ctx.shadowBlur = 10 / scale;
          ctx.fillStyle = e.color;
          ctx.fillRect(e.x, e.y, e.w, e.h);
        }
        ctx.restore();
      }

      // modern selection overlay (screen-space crispness)
      const sel = scene.entities.find(e => e.id === selectedId);
      if (sel) {
        ctx.restore(); // back to screen space
        const sx = pan.x + sel.x * scale;
        const sy = pan.y + sel.y * scale;
        const sw = sel.w * scale;
        const sh = sel.h * scale;

        // outer subtle glow
        ctx.save();
        ctx.shadowColor = "#7dd3fc";
        ctx.shadowBlur = 12;
        ctx.strokeStyle = "rgba(125,211,252,0.0)";
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.restore();

        // crisp 1px frame
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = "#7dd3fc";
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);

        // size label
        const label = `${Math.round(sel.w)} × ${Math.round(sel.h)}`;
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = ctx.measureText(label).width + 10;
        const lx = sx + sw / 2 - tw / 2;
        const ly = sy - 22;
        ctx.fillStyle = "rgba(2,6,23,0.85)";
        ctx.strokeStyle = "rgba(125,211,252,0.7)";
        ctx.lineWidth = 1;
        roundRectPath(ctx, lx, ly, tw, 18, 4);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#7dd3fc";
        ctx.fillText(label, lx + 5, ly + 13);

        // handles (8) — square, white fill, cyan border
        for (const h of HANDLES) {
          const wp = handlePos(sel, h);
          const hx = pan.x + wp.x * scale - HANDLE_PX / 2;
          const hy = pan.y + wp.y * scale - HANDLE_PX / 2;
          ctx.fillStyle = "#f8fafc";
          ctx.strokeStyle = "#0ea5e9";
          ctx.lineWidth = 1.5;
          ctx.fillRect(hx, hy, HANDLE_PX, HANDLE_PX);
          ctx.strokeRect(hx + 0.5, hy + 0.5, HANDLE_PX - 1, HANDLE_PX - 1);
        }
      } else {
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);
    return () => { mounted = false; cancelAnimationFrame(animRef.current); };
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

  const hitHandle = (sx: number, sy: number): HandleId | null => {
    const sel = scene.entities.find(e => e.id === selectedId);
    if (!sel) return null;
    for (const h of HANDLES) {
      const wp = handlePos(sel, h);
      const hx = pan.x + wp.x * scale;
      const hy = pan.y + wp.y * scale;
      if (Math.abs(sx - hx) <= HANDLE_PX && Math.abs(sy - hy) <= HANDLE_PX) return h;
    }
    return null;
  };

  const getLocal = (ev: React.PointerEvent) => {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    return { sx: ev.clientX - rect.left, sy: ev.clientY - rect.top };
  };

  const beginPinch = () => {
    const pts = Array.from(pointers.current.values());
    if (pts.length < 2) return;
    const [a, b] = pts;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    gesture.current = {
      mode: "pinch",
      pinchStartDist: dist,
      pinchStartScale: scale,
      pinchStartCenter: { x: cx, y: cy },
      pinchStartPan: { ...pan },
    };
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.target as Element).setPointerCapture(ev.pointerId);
    const { sx, sy } = getLocal(ev);
    pointers.current.set(ev.pointerId, { x: sx, y: sy });

    if (pointers.current.size >= 2) {
      beginPinch();
      return;
    }

    const w = screenToWorld(sx, sy);

    // Always: if a selection handle is hit, start resizing (regardless of tool)
    const handle = hitHandle(sx, sy);
    if (handle && selectedId) {
      const ent = scene.entities.find(e => e.id === selectedId)!;
      gesture.current = {
        mode: "resize",
        handle,
        entId: ent.id,
        entStartX: ent.x, entStartY: ent.y, entStartW: ent.w, entStartH: ent.h,
        startSX: sx, startSY: sy,
      };
      return;
    }

    if (tool === "select") {
      const hit = hitTest(w.x, w.y);
      if (hit) {
        onSelect(hit.id);
        gesture.current = {
          mode: "move", entId: hit.id,
          entStartX: hit.x, entStartY: hit.y, startSX: sx, startSY: sy,
        };
      } else {
        onSelect(null);
        gesture.current = { mode: "pan", panStart: { ...pan }, startSX: sx, startSY: sy };
      }
    } else if (tool === "erase") {
      const hit = hitTest(w.x, w.y);
      if (hit && hit.kind !== "player") {
        onChange({ ...scene, entities: scene.entities.filter(e => e.id !== hit.id) });
      }
      gesture.current = { mode: "idle" };
    } else {
      const preset = KIND_PRESETS[tool];
      const ent: Entity = {
        ...preset,
        id: uid(),
        x: Math.round((w.x - preset.w / 2) / SNAP) * SNAP,
        y: Math.round((w.y - preset.h / 2) / SNAP) * SNAP,
      };
      let entities = scene.entities;
      if (tool === "player") entities = entities.filter(e => e.kind !== "player");
      onChange({ ...scene, entities: [...entities, ent] });
      onSelect(ent.id);
      gesture.current = { mode: "idle" };
    }
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const { sx, sy } = getLocal(ev);
    if (!pointers.current.has(ev.pointerId)) return;
    pointers.current.set(ev.pointerId, { x: sx, y: sy });

    const g = gesture.current;

    if (g.mode === "pinch" && pointers.current.size >= 2) {
      const pts = Array.from(pointers.current.values());
      const [a, b] = pts;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const ratio = dist / (g.pinchStartDist || 1);
      const newScale = Math.max(0.15, Math.min(3, (g.pinchStartScale || 1) * ratio));
      // keep pinch center anchored: world point under start center should stay under current center
      const startC = g.pinchStartCenter!;
      const startPan = g.pinchStartPan!;
      const startScale = g.pinchStartScale!;
      const worldX = (startC.x - startPan.x) / startScale;
      const worldY = (startC.y - startPan.y) / startScale;
      const newPanX = cx - worldX * newScale;
      const newPanY = cy - worldY * newScale;
      setScale(newScale);
      setPan({ x: newPanX, y: newPanY });
      return;
    }

    if (g.mode === "pan" && g.panStart) {
      setPan({
        x: g.panStart.x + (sx - (g.startSX || 0)),
        y: g.panStart.y + (sy - (g.startSY || 0)),
      });
    } else if (g.mode === "move" && g.entId) {
      const dx = (sx - (g.startSX || 0)) / scale;
      const dy = (sy - (g.startSY || 0)) / scale;
      const entities = scene.entities.map(e =>
        e.id === g.entId
          ? { ...e, x: Math.round(((g.entStartX || 0) + dx) / SNAP) * SNAP, y: Math.round(((g.entStartY || 0) + dy) / SNAP) * SNAP }
          : e
      );
      onChange({ ...scene, entities });
    } else if (g.mode === "resize" && g.entId && g.handle) {
      const w = screenToWorld(sx, sy);
      const entities = scene.entities.map(e => {
        if (e.id !== g.entId) return e;
        const base: Entity = { ...e, x: g.entStartX!, y: g.entStartY!, w: g.entStartW!, h: g.entStartH! };
        return resizeEntity(base, g.handle!, w.x, w.y);
      });
      onChange({ ...scene, entities });
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    pointers.current.delete(ev.pointerId);
    if (pointers.current.size < 2 && gesture.current.mode === "pinch") {
      gesture.current = { mode: "idle" };
    }
    if (pointers.current.size === 0) {
      gesture.current = { mode: "idle" };
    }
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
        <ZoomBtn onClick={() => setScale(s => Math.max(0.15, s - 0.1))}>−</ZoomBtn>
        <ZoomBtn onClick={() => setScale(s => Math.min(3, s + 0.1))}>+</ZoomBtn>
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 panel rounded-full px-3 py-1 text-[10px] font-mono text-muted-foreground whitespace-nowrap">
        pinch · zoom · drag handles · resize
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

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
