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

export function PaintEditor({ onSave, onClose, size = 512 }: Props) {
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#38bdf8");
  const [width, setWidth] = useState(6);
  const [name, setName] = useState("drawing");
  const [stabilize, setStabilize] = useState(true);
  const [pressureOn, setPressureOn] = useState(true);
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
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
    // Transparent — checker pattern shows through from the wrapper
    ctx.clearRect(0, 0, W, W);
    ctx.drawImage(buf, 0, 0, W, W);
    if (preview) {
      ctx.save();
      ctx.scale(W / size, W / size);
      preview(ctx);
      ctx.restore();
    }
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
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--gradient-deep)" }}>
      {/* Top bar — Apple-style translucent */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 gap-2 shrink-0"
        style={{
          background: "linear-gradient(180deg, oklch(0.22 0.04 260 / 0.85), oklch(0.18 0.035 263 / 0.7))",
          backdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className="w-9 h-9 rounded-lg shrink-0"
            style={{
              backgroundColor: "#e5e7eb",
              backgroundImage: thumb ? `url(${thumb})` : undefined,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.08), 0 1px 3px oklch(0 0 0 / 0.3)",
            }}
            aria-label="preview"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[13px] font-medium tracking-tight min-w-0 flex-1 max-w-[180px] focus:outline-none focus:border-primary/50 focus:bg-white/10 transition"
          />
          <span className="text-[10px] font-mono text-muted-foreground shrink-0 tabular-nums">{size}×{size}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onClose}
            className="text-[12px] font-medium px-3.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-foreground/80 hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="text-[12px] font-semibold px-4 py-1.5 rounded-lg text-primary-foreground transition active:scale-[0.97]"
            style={{
              background: "linear-gradient(180deg, oklch(0.78 0.17 250), oklch(0.66 0.18 252))",
              boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.25), 0 4px 14px -4px oklch(0.66 0.18 252 / 0.55)",
            }}
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-auto px-4 py-4 gap-4">
        {/* Canvas surface */}
        <div className="mx-auto w-full max-w-[460px] aspect-square relative">
          <div
            className="absolute inset-0 rounded-2xl p-[10px]"
            style={{
              background: "linear-gradient(180deg, oklch(0.28 0.05 260 / 0.6), oklch(0.18 0.04 265 / 0.6))",
              boxShadow:
                "inset 0 1px 0 oklch(1 0 0 / 0.08), 0 20px 60px -20px oklch(0 0 0 / 0.55), 0 0 0 1px oklch(1 0 0 / 0.05)",
            }}
          >
            <div
              className="w-full h-full rounded-xl overflow-hidden"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, oklch(0.93 0 0) 25%, transparent 25%), linear-gradient(-45deg, oklch(0.93 0 0) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, oklch(0.93 0 0) 75%), linear-gradient(-45deg, transparent 75%, oklch(0.93 0 0) 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
                backgroundColor: "#fcfcfc",
              }}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full touch-none block"
                style={{ touchAction: "none", background: "transparent" }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              />
            </div>
          </div>
          {textInput?.open && (
            <div
              className="absolute rounded-xl p-2.5 flex flex-col gap-2 z-10"
              style={{
                left: `${(textInput.x / size) * 100}%`,
                top: `${(textInput.y / size) * 100}%`,
                maxWidth: "80%",
                background: "oklch(0.2 0.04 262 / 0.92)",
                backdropFilter: "blur(20px) saturate(180%)",
                border: "1px solid oklch(1 0 0 / 0.12)",
                boxShadow: "0 12px 40px -10px oklch(0 0 0 / 0.6)",
              }}
            >
              <textarea
                autoFocus
                value={textInput.value}
                onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                placeholder="Type text…"
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[13px] w-48 min-h-[60px] focus:outline-none focus:border-primary/50"
              />
              <div className="flex items-center gap-1.5">
                <select
                  value={textInput.font}
                  onChange={(e) => setTextInput({ ...textInput, font: e.target.value })}
                  className="bg-white/5 border border-white/10 rounded-lg text-[11px] px-2 py-1 flex-1"
                >
                  {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={textInput.fontSize}
                  onChange={(e) => setTextInput({ ...textInput, fontSize: Number(e.target.value) })}
                  className="bg-white/5 border border-white/10 rounded-lg text-[11px] px-2 py-1 w-14 tabular-nums"
                />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setTextInput(null)} className="text-[11px] font-medium px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 flex-1">Cancel</button>
                <button onClick={commitText} className="text-[11px] font-semibold px-2 py-1.5 rounded-lg text-primary-foreground flex-1" style={{ background: "linear-gradient(180deg, oklch(0.78 0.17 250), oklch(0.66 0.18 252))" }}>Add</button>
              </div>
            </div>
          )}
        </div>

        {/* Tool dock — Apple segmented */}
        <div className="mx-auto w-full max-w-[460px]">
          <div
            className="flex gap-1 p-1 rounded-2xl"
            style={{
              background: "oklch(0.22 0.04 262 / 0.6)",
              backdropFilter: "blur(20px) saturate(180%)",
              border: "1px solid oklch(1 0 0 / 0.06)",
              boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 4px 14px -8px oklch(0 0 0 / 0.4)",
            }}
          >
            {TOOLS.map(t => (
              <button
                key={t.id}
                title={t.title}
                onClick={() => setTool(t.id)}
                className={`flex-1 h-10 rounded-xl text-base transition-all flex items-center justify-center ${
                  tool === t.id ? "text-primary-foreground" : "text-foreground/60 hover:text-foreground/90"
                }`}
                style={tool === t.id ? {
                  background: "linear-gradient(180deg, oklch(0.78 0.17 250), oklch(0.64 0.18 252))",
                  boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.25), 0 2px 8px -2px oklch(0.66 0.18 252 / 0.5)",
                } : undefined}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* History row */}
        <div className="mx-auto w-full max-w-[460px] flex gap-1.5">
          <button onClick={undo} title="Undo" className="flex-1 h-10 rounded-xl border border-white/10 bg-white/5 text-foreground/80 hover:bg-white/10 transition text-lg">↶</button>
          <button onClick={redo} title="Redo" className="flex-1 h-10 rounded-xl border border-white/10 bg-white/5 text-foreground/80 hover:bg-white/10 transition text-lg">↷</button>
          <button onClick={clearAll} title="Clear" className="flex-1 h-10 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition text-[12px] font-medium">Clear</button>
        </div>

        {/* Color + size card */}
        <div
          className="mx-auto w-full max-w-[460px] p-3 rounded-2xl flex flex-col gap-3"
          style={{
            background: "oklch(0.22 0.04 262 / 0.5)",
            backdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid oklch(1 0 0 / 0.06)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative w-10 h-10 shrink-0">
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div
                className="w-10 h-10 rounded-xl pointer-events-none"
                style={{
                  background: color,
                  boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.18), 0 4px 12px -4px oklch(0 0 0 / 0.4)",
                }}
              />
            </div>
            <div className="flex-1 grid grid-cols-8 gap-1.5">
              {PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="aspect-square rounded-lg transition-all"
                  style={{
                    background: c,
                    boxShadow: color === c
                      ? "inset 0 0 0 1.5px oklch(1 0 0 / 0.9), 0 0 0 2px oklch(0.72 0.17 250 / 0.7)"
                      : "inset 0 0 0 1px oklch(1 0 0 / 0.12)",
                    transform: color === c ? "scale(1.06)" : undefined,
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-medium text-foreground/70">
            <span className="w-10 shrink-0">Size</span>
            <input
              type="range"
              min={1}
              max={48}
              value={width}
              onChange={e => setWidth(Number(e.target.value))}
              className="flex-1 accent-[oklch(0.72_0.17_250)]"
            />
            <span className="font-mono text-primary-glow w-7 text-right tabular-nums">{width}</span>
          </div>

          <label className="flex items-center justify-between text-[12px] font-medium text-foreground/85 cursor-pointer select-none">
            <span>Stabilize brush</span>
            <span
              role="switch"
              aria-checked={stabilize}
              onClick={() => setStabilize(!stabilize)}
              className="relative w-[42px] h-[26px] rounded-full transition-colors"
              style={{
                background: stabilize ? "oklch(0.7 0.17 145)" : "oklch(0.35 0.02 260)",
                boxShadow: "inset 0 1px 2px oklch(0 0 0 / 0.3)",
              }}
            >
              <span
                className="absolute top-[2px] w-[22px] h-[22px] rounded-full bg-white transition-all"
                style={{
                  left: stabilize ? "18px" : "2px",
                  boxShadow: "0 2px 4px oklch(0 0 0 / 0.3)",
                }}
              />
            </span>
            <input type="checkbox" checked={stabilize} onChange={(e) => setStabilize(e.target.checked)} className="sr-only" />
          </label>
        </div>
      </div>
    </div>
  );
}
