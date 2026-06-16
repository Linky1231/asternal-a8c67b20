import { useEffect, useRef, useState } from "react";
import type { SpriteAsset } from "@/lib/engine/core";
import { uid } from "@/lib/engine/core";

type Tool = "brush" | "eraser" | "fill" | "line" | "rect" | "circle" | "picker" | "text";

interface Props {
  onSave: (sprite: SpriteAsset) => void;
  onClose: () => void;
  size?: number;
}

const PALETTE = [
  "#000000", "#1f2937", "#6b7280", "#f8fafc",
  "#ef4444", "#f97316", "#fbbf24", "#22c55e",
  "#06b6d4", "#38bdf8", "#3b82f6", "#8b5cf6",
  "#ec4899", "#7c2d12", "#fde68a", "#0ea5e9",
];

const FONTS = ["Rajdhani", "Orbitron", "JetBrains Mono", "Georgia", "Arial"];

export function PaintEditor({ onSave, onClose, size = 384 }: Props) {
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#38bdf8");
  const [width, setWidth] = useState(6);
  const [name, setName] = useState("drawing");
  const [stabilize, setStabilize] = useState(true);
  const [previewVersion, setPreviewVersion] = useState(0);

  // text overlay state
  const [textInput, setTextInput] = useState<{
    open: boolean; x: number; y: number; value: string; fontSize: number; font: string;
  } | null>(null);

  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const activePointerId = useRef<number | null>(null);
  const activePointers = useRef<Set<number>>(new Set());

  useEffect(() => {
    const buf = document.createElement("canvas");
    buf.width = size; buf.height = size;
    const ctx = buf.getContext("2d")!;
    // start with transparent (kept) — page bg shows the light checker
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
    setPreviewVersion(v => v + 1);
  };

  const blit = (preview?: (ctx: CanvasRenderingContext2D) => void) => {
    const c = canvasRef.current; const buf = bufferRef.current;
    if (!c || !buf) return;
    const ctx = c.getContext("2d")!;
    const W = c.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = W * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Light checker background
    const cell = 16;
    for (let y = 0; y < W; y += cell) {
      for (let x = 0; x < W; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) & 1) ? "#f1f5f9" : "#e2e8f0";
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
    ctx.strokeStyle = "rgba(100,116,139,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, W - 1);
  };

  const getPos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * size,
      y: ((e.clientY - r.top) / r.height) * size,
    };
  };

  const drag = useRef<{
    active: boolean; tool: Tool;
    last: { x: number; y: number };
    start: { x: number; y: number };
    smooth: { x: number; y: number };
  }>({ active: false, tool: "brush", last: { x: 0, y: 0 }, start: { x: 0, y: 0 }, smooth: { x: 0, y: 0 } });

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

  const cancelStroke = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    // revert last snapshot (undo the in-progress stroke)
    const buf = bufferRef.current; if (!buf) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    if (!prev) return;
    const img = new Image();
    img.onload = () => {
      const c = bctx();
      c.clearRect(0, 0, size, size);
      c.drawImage(img, 0, 0);
      blit();
    };
    img.src = prev;
  };

  const onDown = (e: React.PointerEvent) => {
    activePointers.current.add(e.pointerId);
    // Multi-touch: cancel in-progress stroke and ignore extra fingers
    if (activePointers.current.size > 1) {
      cancelStroke();
      activePointerId.current = null;
      return;
    }
    activePointerId.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = getPos(e);
    if (tool === "picker") { pickColorAt(p.x, p.y); return; }
    if (tool === "text") {
      setTextInput({ open: true, x: p.x, y: p.y, value: "", fontSize: Math.max(16, width * 4), font: "Rajdhani" });
      return;
    }
    pushSnapshot();
    drag.current = { active: true, tool, last: p, start: p, smooth: p };
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
    if (activePointerId.current !== e.pointerId) return;
    if (activePointers.current.size > 1) { cancelStroke(); return; }
    const p = getPos(e);
    if (drag.current.tool === "brush" || drag.current.tool === "eraser") {
      // Use coalesced events for full-resolution input, draw directly to the
      // real pointer position (no lag). Light smoothing only when stabilize is on,
      // applied via midpoint quadratic curves rather than a low-pass filter.
      const events = (typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : []) as PointerEvent[];
      const points = events.length ? events.map(ev => {
        const c = canvasRef.current!;
        const r = c.getBoundingClientRect();
        return { x: ((ev.clientX - r.left) / r.width) * size, y: ((ev.clientY - r.top) / r.height) * size };
      }) : [p];
      const erase = drag.current.tool === "eraser";
      for (const pt of points) {
        if (stabilize) {
          const mx = (drag.current.last.x + pt.x) / 2;
          const my = (drag.current.last.y + pt.y) / 2;
          strokeSegment(drag.current.last.x, drag.current.last.y, mx, my, erase);
          drag.current.last = { x: mx, y: my };
        } else {
          strokeSegment(drag.current.last.x, drag.current.last.y, pt.x, pt.y, erase);
          drag.current.last = pt;
        }
      }
      blit();
    } else if (drag.current.tool === "line" || drag.current.tool === "rect" || drag.current.tool === "circle") {
      const t = drag.current.tool;
      blit(ctx => drawPreviewShape(ctx, t, drag.current.start.x, drag.current.start.y, p.x, p.y));
    }
  };


  const onUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (!drag.current.active) return;
    if (activePointerId.current !== e.pointerId) return;
    const p = getPos(e);
    const t = drag.current.tool;
    if (t === "brush" || t === "eraser") {
      strokeSegment(drag.current.last.x, drag.current.last.y, p.x, p.y, t === "eraser");
    } else if (t === "line" || t === "rect" || t === "circle") {
      commitShape(t, drag.current.start.x, drag.current.start.y, p.x, p.y);
    }
    drag.current.active = false;
    activePointerId.current = null;
    blit();
    setPreviewVersion(v => v + 1);
  };


  const commitText = () => {
    if (!textInput || !textInput.value.trim()) { setTextInput(null); return; }
    pushSnapshot();
    const c = bctx();
    c.save();
    c.fillStyle = color;
    c.font = `${textInput.fontSize}px "${textInput.font}", sans-serif`;
    c.textBaseline = "top";
    const lines = textInput.value.split("\n");
    lines.forEach((ln, i) => c.fillText(ln, textInput.x, textInput.y + i * textInput.fontSize * 1.1));
    c.restore();
    setTextInput(null);
    blit();
    setPreviewVersion(v => v + 1);
  };

  const undo = () => {
    const buf = bufferRef.current; if (!buf) return;
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(buf.toDataURL("image/png"));
    const img = new Image();
    img.onload = () => { const c = bctx(); c.clearRect(0, 0, size, size); c.drawImage(img, 0, 0); blit(); setPreviewVersion(v => v + 1); };
    img.src = prev;
  };
  const redo = () => {
    const buf = bufferRef.current; if (!buf) return;
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(buf.toDataURL("image/png"));
    const img = new Image();
    img.onload = () => { const c = bctx(); c.clearRect(0, 0, size, size); c.drawImage(img, 0, 0); blit(); setPreviewVersion(v => v + 1); };
    img.src = next;
  };
  const clearAll = () => {
    if (!confirm("Clear the canvas?")) return;
    pushSnapshot();
    const c = bctx();
    c.clearRect(0, 0, size, size);
    blit();
    setPreviewVersion(v => v + 1);
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

  // Stable thumbnail data url
  const thumb = (() => {
    const buf = bufferRef.current;
    if (!buf) return "";
    try { return buf.toDataURL("image/png"); } catch { return ""; }
  })();
  // touch previewVersion so re-renders recompute thumb
  void previewVersion;

  const TOOLS: { id: Tool; label: string; title: string }[] = [
    { id: "brush", label: "✎", title: "Brush" },
    { id: "eraser", label: "⌫", title: "Eraser" },
    { id: "fill", label: "▣", title: "Fill" },
    { id: "line", label: "／", title: "Line" },
    { id: "rect", label: "▭", title: "Rectangle" },
    { id: "circle", label: "◯", title: "Circle" },
    { id: "picker", label: "◎", title: "Color picker" },
    { id: "text", label: "T", title: "Text" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 panel border-b gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="w-8 h-8 rounded border border-border shrink-0"
            style={{
              backgroundColor: "#f1f5f9",
              backgroundImage: thumb ? `url(${thumb})` : undefined,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
            aria-label="preview"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-input/60 border border-border rounded-md px-2 py-1 text-sm font-mono min-w-0 flex-1 max-w-[140px]"
          />
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">{size}px</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onClose} className="text-xs font-display px-3 py-1.5 rounded-md border border-border text-muted-foreground">CANCEL</button>
          <button onClick={save} className="text-xs font-display px-3 py-1.5 rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground glow-border">✓ SAVE</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-auto p-3 gap-3">
        <div className="mx-auto w-full max-w-[480px] aspect-square relative">
          <canvas
            ref={canvasRef}
            className="w-full h-full rounded-md border border-border touch-none bg-card"
            style={{ touchAction: "none" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {textInput?.open && (
            <div
              className="absolute panel border border-primary/60 rounded-md p-2 flex flex-col gap-2 z-10"
              style={{
                left: `${(textInput.x / size) * 100}%`,
                top: `${(textInput.y / size) * 100}%`,
                maxWidth: "80%",
              }}
            >
              <textarea
                autoFocus
                value={textInput.value}
                onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                placeholder="Type text…"
                className="bg-input/80 border border-border rounded px-2 py-1 text-sm font-mono w-48 min-h-[60px]"
              />
              <div className="flex items-center gap-2">
                <select
                  value={textInput.font}
                  onChange={(e) => setTextInput({ ...textInput, font: e.target.value })}
                  className="bg-input/80 border border-border rounded text-xs px-1 py-0.5 flex-1"
                >
                  {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={textInput.fontSize}
                  onChange={(e) => setTextInput({ ...textInput, fontSize: Number(e.target.value) })}
                  className="bg-input/80 border border-border rounded text-xs px-1 py-0.5 w-14"
                />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setTextInput(null)} className="text-[10px] font-display px-2 py-1 rounded border border-border text-muted-foreground flex-1">CANCEL</button>
                <button onClick={commitText} className="text-[10px] font-display px-2 py-1 rounded bg-primary/30 border border-primary text-primary-glow flex-1">ADD</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-1.5 justify-center flex-wrap">
          {TOOLS.map(t => (
            <button
              key={t.id}
              title={t.title}
              onClick={() => setTool(t.id)}
              className={`w-11 h-11 rounded-md border font-display text-lg ${
                tool === t.id
                  ? "bg-primary/20 border-primary text-primary-glow glow-border"
                  : "border-border text-muted-foreground"
              }`}
            >{t.label}</button>
          ))}
          <button onClick={undo} title="Undo" className="w-11 h-11 rounded-md border border-border text-muted-foreground font-display">↶</button>
          <button onClick={redo} title="Redo" className="w-11 h-11 rounded-md border border-border text-muted-foreground font-display">↷</button>
          <button onClick={clearAll} title="Clear" className="w-11 h-11 rounded-md border border-destructive/50 text-destructive font-display">✕</button>
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

        <label className="flex items-center gap-2 justify-center text-xs font-display tracking-widest text-muted-foreground">
          <input
            type="checkbox"
            checked={stabilize}
            onChange={(e) => setStabilize(e.target.checked)}
            className="accent-[oklch(0.68_0.21_250)]"
          />
          STABILIZE BRUSH
        </label>
      </div>
    </div>
  );
}
