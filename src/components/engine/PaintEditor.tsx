import { useEffect, useRef, useState } from "react";
import type { SpriteAsset } from "@/lib/engine/core";
import { uid } from "@/lib/engine/core";

type Tool = "brush" | "eraser" | "fill" | "line" | "rect" | "circle" | "picker";

interface Props {
  onSave: (sprite: SpriteAsset) => void;
  onClose: () => void;
  size?: number; // canvas resolution (square)
}

const PALETTE = [
  "#000000", "#1f2937", "#6b7280", "#f8fafc",
  "#ef4444", "#f97316", "#fbbf24", "#22c55e",
  "#06b6d4", "#38bdf8", "#3b82f6", "#8b5cf6",
  "#ec4899", "#7c2d12", "#fde68a", "#0ea5e9",
];

// Free-form (non-pixel) drawing canvas. Persistent buffer for 60fps perf.
export function PaintEditor({ onSave, onClose, size = 384 }: Props) {
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#38bdf8");
  const [width, setWidth] = useState(6);
  const [name, setName] = useState("drawing");

  // Persistent drawing buffer
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  // Visible canvas (shows buffer + live preview)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // Undo history (PNG snapshots)
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);

  // Initialize buffer
  useEffect(() => {
    const buf = document.createElement("canvas");
    buf.width = size; buf.height = size;
    bufferRef.current = buf;
    blit();
    pushSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const pushSnapshot = () => {
    const buf = bufferRef.current; if (!buf) return;
    undoStack.current.push(buf.toDataURL("image/png"));
    if (undoStack.current.length > 32) undoStack.current.shift();
    redoStack.current = [];
  };

  // Repaint visible canvas from buffer + optional preview shape
  const blit = (preview?: (ctx: CanvasRenderingContext2D) => void) => {
    const c = canvasRef.current; const buf = bufferRef.current;
    if (!c || !buf) return;
    const ctx = c.getContext("2d")!;
    const W = c.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = W * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // checker bg
    const cell = 16;
    for (let y = 0; y < W; y += cell) {
      for (let x = 0; x < W; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) & 1) ? "#0f172a" : "#1e293b";
        ctx.fillRect(x, y, cell, cell);
      }
    }
    ctx.drawImage(buf, 0, 0, W, W);
    if (preview) {
      ctx.save();
      ctx.scale(W / size, W / size);
      preview(ctx);
      ctx.restore();
    }
    // grid hint
    ctx.strokeStyle = "rgba(125,211,252,0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, W - 1);
    // preview thumb
    const pv = previewRef.current;
    if (pv) {
      pv.width = 32; pv.height = 32;
      const pctx = pv.getContext("2d")!;
      pctx.clearRect(0, 0, 32, 32);
      pctx.drawImage(buf, 0, 0, 32, 32);
    }
  };

  // Map pointer to buffer-space coords
  const getPos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * size;
    const y = ((e.clientY - r.top) / r.height) * size;
    return { x, y };
  };

  const drag = useRef<{
    active: boolean; tool: Tool;
    last: { x: number; y: number };
    start: { x: number; y: number };
    snapshot: ImageData | null;
  }>({ active: false, tool: "brush", last: { x: 0, y: 0 }, start: { x: 0, y: 0 }, snapshot: null });

  const bctx = () => bufferRef.current!.getContext("2d")!;

  const strokeSegment = (x0: number, y0: number, x1: number, y1: number, erase: boolean) => {
    const c = bctx();
    c.save();
    c.globalCompositeOperation = erase ? "destination-out" : "source-over";
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    c.restore();
  };

  const floodFill = (sx: number, sy: number, hex: string) => {
    const c = bctx();
    const img = c.getImageData(0, 0, size, size);
    const data = img.data;
    const idx = (x: number, y: number) => (y * size + x) * 4;
    const startX = Math.floor(sx), startY = Math.floor(sy);
    if (startX < 0 || startY < 0 || startX >= size || startY >= size) return;
    const i0 = idx(startX, startY);
    const tr = data[i0], tg = data[i0 + 1], tb = data[i0 + 2], ta = data[i0 + 3];
    // parse fill color
    const fr = parseInt(hex.slice(1, 3), 16);
    const fg = parseInt(hex.slice(3, 5), 16);
    const fb = parseInt(hex.slice(5, 7), 16);
    if (tr === fr && tg === fg && tb === fb && ta === 255) return;
    const stack: number[] = [startX, startY];
    while (stack.length) {
      const y = stack.pop()!, x = stack.pop()!;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const i = idx(x, y);
      if (data[i] !== tr || data[i + 1] !== tg || data[i + 2] !== tb || data[i + 3] !== ta) continue;
      data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    c.putImageData(img, 0, 0);
  };

  const drawPreviewShape = (ctx: CanvasRenderingContext2D, t: Tool, x0: number, y0: number, x1: number, y1: number) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    if (t === "line") {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    } else if (t === "rect") {
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else if (t === "circle") {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  };

  const commitShape = (t: Tool, x0: number, y0: number, x1: number, y1: number) => {
    const c = bctx();
    c.save();
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    if (t === "line") {
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    } else if (t === "rect") {
      c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else if (t === "circle") {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
      c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  };

  const pickColorAt = (x: number, y: number) => {
    const c = bctx();
    const d = c.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    if (d[3] === 0) return;
    const hex = "#" + [d[0], d[1], d[2]].map(n => n.toString(16).padStart(2, "0")).join("");
    setColor(hex);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = getPos(e);
    if (tool === "picker") { pickColorAt(p.x, p.y); return; }
    pushSnapshot();
    drag.current = { active: true, tool, last: p, start: p, snapshot: null };
    if (tool === "brush" || tool === "eraser") {
      strokeSegment(p.x, p.y, p.x + 0.01, p.y + 0.01, tool === "eraser");
      blit();
    } else if (tool === "fill") {
      floodFill(p.x, p.y, color);
      blit();
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const p = getPos(e);
    if (drag.current.tool === "brush" || drag.current.tool === "eraser") {
      strokeSegment(drag.current.last.x, drag.current.last.y, p.x, p.y, drag.current.tool === "eraser");
      drag.current.last = p;
      blit();
    } else if (drag.current.tool === "line" || drag.current.tool === "rect" || drag.current.tool === "circle") {
      const t = drag.current.tool;
      blit(ctx => drawPreviewShape(ctx, t, drag.current.start.x, drag.current.start.y, p.x, p.y));
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const p = getPos(e);
    const t = drag.current.tool;
    if (t === "line" || t === "rect" || t === "circle") {
      commitShape(t, drag.current.start.x, drag.current.start.y, p.x, p.y);
    }
    drag.current.active = false;
    blit();
  };

  const undo = () => {
    const buf = bufferRef.current; if (!buf) return;
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(buf.toDataURL("image/png"));
    const img = new Image();
    img.onload = () => {
      const c = bctx();
      c.clearRect(0, 0, size, size);
      c.drawImage(img, 0, 0);
      blit();
    };
    img.src = prev;
  };
  const redo = () => {
    const buf = bufferRef.current; if (!buf) return;
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(buf.toDataURL("image/png"));
    const img = new Image();
    img.onload = () => {
      const c = bctx();
      c.clearRect(0, 0, size, size);
      c.drawImage(img, 0, 0);
      blit();
    };
    img.src = next;
  };
  const clearAll = () => {
    if (!confirm("Clear the canvas?")) return;
    pushSnapshot();
    const c = bctx();
    c.clearRect(0, 0, size, size);
    blit();
  };

  const save = () => {
    const buf = bufferRef.current; if (!buf) return;
    const dataUrl = buf.toDataURL("image/png");
    const asset: SpriteAsset = {
      id: uid(),
      name: name.trim() || "drawing",
      width: size,
      height: size,
      fps: 8,
      loop: true,
      frames: [{ id: uid(), layers: [], composite: dataUrl }],
    };
    onSave(asset);
  };

  const TOOLS: { id: Tool; label: string }[] = [
    { id: "brush", label: "✎" },
    { id: "eraser", label: "⌫" },
    { id: "fill", label: "▣" },
    { id: "line", label: "／" },
    { id: "rect", label: "▭" },
    { id: "circle", label: "◯" },
    { id: "picker", label: "◎" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 panel border-b">
        <div className="flex items-center gap-2 min-w-0">
          <canvas ref={previewRef} className="w-8 h-8 rounded border border-border bg-card" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-input/60 border border-border rounded-md px-2 py-1 text-sm font-mono w-32"
          />
          <span className="text-[10px] font-mono text-muted-foreground">{size}px</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onClose} className="text-xs font-display px-3 py-1.5 rounded-md border border-border text-muted-foreground">CANCEL</button>
          <button onClick={save} className="text-xs font-display px-3 py-1.5 rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground glow-border">✓ SAVE</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-auto p-3 gap-3">
        <div className="mx-auto w-full max-w-[480px] aspect-square">
          <canvas
            ref={canvasRef}
            className="w-full h-full rounded-md border border-border touch-none bg-card"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        </div>

        <div className="flex gap-1.5 justify-center flex-wrap">
          {TOOLS.map(t => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`w-11 h-11 rounded-md border font-display text-lg ${
                tool === t.id
                  ? "bg-primary/20 border-primary text-primary-glow glow-border"
                  : "border-border text-muted-foreground"
              }`}
            >{t.label}</button>
          ))}
          <button onClick={undo} className="w-11 h-11 rounded-md border border-border text-muted-foreground font-display">↶</button>
          <button onClick={redo} className="w-11 h-11 rounded-md border border-border text-muted-foreground font-display">↷</button>
          <button onClick={clearAll} className="w-11 h-11 rounded-md border border-destructive/50 text-destructive font-display">✕</button>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-11 h-11 rounded-md bg-transparent border border-border" />
          {PALETTE.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded border ${color === c ? "border-primary scale-110" : "border-border"}`}
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="flex items-center gap-3 justify-center text-xs font-display tracking-widest text-muted-foreground px-2">
          <span>SIZE</span>
          <input type="range" min={1} max={48} value={width} onChange={e => setWidth(Number(e.target.value))}
            className="flex-1 max-w-[260px] accent-[oklch(0.68_0.21_250)]" />
          <span className="font-mono text-primary-glow w-6 text-right">{width}</span>
        </div>
      </div>
    </div>
  );
}
