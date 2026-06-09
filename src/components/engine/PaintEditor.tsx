import { useEffect, useRef, useState } from "react";
import type { SpriteAsset } from "@/lib/engine/core";
import { uid } from "@/lib/engine/core";

type Tool = "pencil" | "eraser" | "fill" | "line" | "rect" | "picker";

interface Props {
  onSave: (sprite: SpriteAsset) => void;
  onClose: () => void;
  initialSize?: number;
}

const PALETTE = [
  "#000000", "#1f2937", "#6b7280", "#f8fafc",
  "#ef4444", "#f97316", "#fbbf24", "#22c55e",
  "#06b6d4", "#38bdf8", "#3b82f6", "#8b5cf6",
  "#ec4899", "#7c2d12", "#fde68a", "#0ea5e9",
];

export function PaintEditor({ onSave, onClose, initialSize = 32 }: Props) {
  const [size] = useState(initialSize);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#38bdf8");
  const [brush, setBrush] = useState(1);
  const [name, setName] = useState("sprite");

  // pixel buffer: RGBA string "rgba(r,g,b,a)" or "" for transparent
  const [pixels, setPixels] = useState<string[]>(() => Array(size * size).fill(""));
  const undoStack = useRef<string[][]>([]);
  const redoStack = useRef<string[][]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const pushHistory = (prev: string[]) => {
    undoStack.current.push(prev);
    if (undoStack.current.length > 64) undoStack.current.shift();
    redoStack.current = [];
  };

  // draw to canvas
  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const W = c.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = W * dpr;
    c.height = W * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = W / size;

    // checker bg
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = ((x + y) & 1) ? "#1e293b" : "#0f172a";
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // pixels
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = pixels[y * size + x];
        if (p) { ctx.fillStyle = p; ctx.fillRect(x * cell, y * cell, cell, cell); }
      }
    }
    // grid
    ctx.strokeStyle = "rgba(125,211,252,0.10)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, W); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell); ctx.stroke();
    }

    // preview
    const pv = previewRef.current!;
    const pctx = pv.getContext("2d")!;
    pv.width = size; pv.height = size;
    pctx.clearRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = pixels[y * size + x];
        if (p) { pctx.fillStyle = p; pctx.fillRect(x, y, 1, 1); }
      }
    }
  }, [pixels, size]);

  const getCell = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * size);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * size);
    return { x: Math.max(0, Math.min(size - 1, x)), y: Math.max(0, Math.min(size - 1, y)) };
  };

  const paintBrush = (buf: string[], cx: number, cy: number, val: string) => {
    const r = brush - 1;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        buf[y * size + x] = val;
      }
    }
  };

  const floodFill = (buf: string[], sx: number, sy: number, target: string, replace: string) => {
    if (target === replace) return;
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      if (buf[y * size + x] !== target) continue;
      buf[y * size + x] = replace;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  };

  const drawLine = (buf: string[], x0: number, y0: number, x1: number, y1: number, val: string) => {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0, y = y0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      paintBrush(buf, x, y, val);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  };

  const drawRect = (buf: string[], x0: number, y0: number, x1: number, y1: number, val: string) => {
    const lx = Math.min(x0, x1), rx = Math.max(x0, x1);
    const ty = Math.min(y0, y1), by = Math.max(y0, y1);
    for (let x = lx; x <= rx; x++) { paintBrush(buf, x, ty, val); paintBrush(buf, x, by, val); }
    for (let y = ty; y <= by; y++) { paintBrush(buf, lx, y, val); paintBrush(buf, rx, y, val); }
  };

  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; startX: number; startY: number; snapshot: string[] | null }>({
    active: false, lastX: 0, lastY: 0, startX: 0, startY: 0, snapshot: null,
  });

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const { x, y } = getCell(e);
    if (tool === "picker") {
      const p = pixels[y * size + x];
      if (p) setColor(p);
      return;
    }
    pushHistory(pixels);
    const val = tool === "eraser" ? "" : color;
    const buf = [...pixels];
    if (tool === "pencil" || tool === "eraser") {
      paintBrush(buf, x, y, val);
    } else if (tool === "fill") {
      floodFill(buf, x, y, pixels[y * size + x] ?? "", val);
    }
    setPixels(buf);
    dragRef.current = { active: true, lastX: x, lastY: y, startX: x, startY: y, snapshot: tool === "line" || tool === "rect" ? pixels : null };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const { x, y } = getCell(e);
    if (x === dragRef.current.lastX && y === dragRef.current.lastY) return;
    const val = tool === "eraser" ? "" : color;
    if (tool === "pencil" || tool === "eraser") {
      const buf = [...pixels];
      drawLine(buf, dragRef.current.lastX, dragRef.current.lastY, x, y, val);
      setPixels(buf);
      dragRef.current.lastX = x; dragRef.current.lastY = y;
    } else if (tool === "line" && dragRef.current.snapshot) {
      const buf = [...dragRef.current.snapshot];
      drawLine(buf, dragRef.current.startX, dragRef.current.startY, x, y, val);
      setPixels(buf);
    } else if (tool === "rect" && dragRef.current.snapshot) {
      const buf = [...dragRef.current.snapshot];
      drawRect(buf, dragRef.current.startX, dragRef.current.startY, x, y, val);
      setPixels(buf);
    }
  };
  const onUp = () => { dragRef.current.active = false; dragRef.current.snapshot = null; };

  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(pixels);
    setPixels(prev);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(pixels);
    setPixels(next);
  };
  const clearAll = () => {
    pushHistory(pixels);
    setPixels(Array(size * size).fill(""));
  };

  const save = () => {
    const off = document.createElement("canvas");
    off.width = size; off.height = size;
    const c = off.getContext("2d")!;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = pixels[y * size + x];
        if (p) { c.fillStyle = p; c.fillRect(x, y, 1, 1); }
      }
    }
    const dataUrl = off.toDataURL("image/png");
    const asset: SpriteAsset = {
      id: uid(),
      name: name.trim() || "sprite",
      width: size,
      height: size,
      fps: 8,
      loop: true,
      frames: [{ id: uid(), layers: [], composite: dataUrl }],
    };
    onSave(asset);
  };

  const TOOLS: { id: Tool; label: string }[] = [
    { id: "pencil", label: "✎" },
    { id: "eraser", label: "⌫" },
    { id: "fill", label: "▣" },
    { id: "line", label: "／" },
    { id: "rect", label: "▭" },
    { id: "picker", label: "◎" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 panel border-b">
        <div className="flex items-center gap-2 min-w-0">
          <canvas ref={previewRef} className="w-8 h-8 rounded border border-border" style={{ imageRendering: "pixelated" }} />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-input/60 border border-border rounded-md px-2 py-1 text-sm font-mono w-32"
          />
          <span className="text-[10px] font-mono text-muted-foreground">{size}×{size}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onClose} className="text-xs font-display px-3 py-1.5 rounded-md border border-border text-muted-foreground">CANCEL</button>
          <button onClick={save} className="text-xs font-display px-3 py-1.5 rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground glow-border">✓ SAVE SPRITE</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-auto p-3 gap-3">
        <div className="mx-auto w-full max-w-[480px] aspect-square">
          <canvas
            ref={canvasRef}
            className="w-full h-full rounded-md border border-border touch-none"
            style={{ imageRendering: "pixelated" }}
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

        <div className="flex items-center gap-2 justify-center text-xs font-display tracking-widest text-muted-foreground">
          <span>BRUSH</span>
          {[1, 2, 3, 4].map(n => (
            <button
              key={n}
              onClick={() => setBrush(n)}
              className={`w-9 h-9 rounded-md border ${brush === n ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"}`}
            >{n}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
