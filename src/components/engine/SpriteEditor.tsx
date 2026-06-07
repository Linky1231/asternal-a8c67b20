import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SpriteAsset, SpriteFrame, SpriteLayer } from "@/lib/engine/core";
import { uid } from "@/lib/engine/core";

interface Props {
  initial?: SpriteAsset | null;
  defaultSize?: number;
  onClose: () => void;
  onSave: (asset: SpriteAsset) => void;
}

type Tool = "pencil" | "eraser" | "fill" | "eyedropper";

const SIZES = [16, 24, 32, 48, 64];
const PALETTE = [
  "#000000", "#ffffff", "#1f2937", "#94a3b8",
  "#ef4444", "#f97316", "#facc15", "#22c55e",
  "#14b8a6", "#38bdf8", "#6366f1", "#a855f7",
  "#ec4899", "#92400e", "#fde68a", "#7dd3fc",
];

function blankDataUrl(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c.toDataURL("image/png");
}

function makeLayer(w: number, h: number, name = "Layer"): SpriteLayer {
  return { id: uid(), name, visible: true, opacity: 1, dataUrl: blankDataUrl(w, h) };
}

function makeFrame(w: number, h: number): SpriteFrame {
  const blank = blankDataUrl(w, h);
  return { id: uid(), layers: [makeLayer(w, h, "Layer 1")], composite: blank };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export function SpriteEditor({ initial, defaultSize = 32, onClose, onSave }: Props) {
  const [name, setName] = useState(initial?.name ?? "New Sprite");
  const [size, setSize] = useState({
    w: initial?.width ?? defaultSize,
    h: initial?.height ?? defaultSize,
  });
  const [frames, setFrames] = useState<SpriteFrame[]>(
    initial?.frames?.length ? initial.frames : [makeFrame(defaultSize, defaultSize)]
  );
  const [frameIdx, setFrameIdx] = useState(0);
  const [activeLayerId, setActiveLayerId] = useState<string>(() => frames[0].layers[0].id);

  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#38bdf8");
  const [brush, setBrush] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [fps, setFps] = useState(initial?.fps ?? 8);
  const [loop, setLoop] = useState(initial?.loop ?? true);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState<"tools" | "layers" | "frames">("tools");

  // viewport
  const [zoom, setZoom] = useState(10);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // layer canvases — keyed by layer id, native sprite resolution
  const layerCanvases = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Hydrate canvases when frames/size change
  useEffect(() => {
    const map = layerCanvases.current;
    const wanted = new Set<string>();
    for (const f of frames) for (const l of f.layers) wanted.add(l.id);
    for (const id of Array.from(map.keys())) if (!wanted.has(id)) map.delete(id);

    let cancelled = false;
    (async () => {
      for (const f of frames) {
        for (const l of f.layers) {
          let c = map.get(l.id);
          if (!c) {
            c = document.createElement("canvas");
            c.width = size.w; c.height = size.h;
            map.set(l.id, c);
          } else if (c.width !== size.w || c.height !== size.h) {
            c.width = size.w; c.height = size.h;
          }
          try {
            const img = await loadImage(l.dataUrl);
            if (cancelled) return;
            const ctx = c.getContext("2d")!;
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
          } catch { /* blank */ }
          requestRender();
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // initial hydration only

  // --- Display ---
  const displayRef = useRef<HTMLCanvasElement>(null);
  const renderReq = useRef(0);
  const requestRender = useCallback(() => {
    cancelAnimationFrame(renderReq.current);
    renderReq.current = requestAnimationFrame(drawDisplay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawDisplay = useCallback(() => {
    const cnv = displayRef.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cnv.clientWidth, H = cnv.clientHeight;
    if (cnv.width !== W * dpr || cnv.height !== H * dpr) {
      cnv.width = W * dpr; cnv.height = H * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // bg
    ctx.fillStyle = "rgba(2,6,23,0.85)";
    ctx.fillRect(0, 0, W, H);

    const dw = size.w * zoom, dh = size.h * zoom;
    const ox = (W - dw) / 2 + pan.x;
    const oy = (H - dh) / 2 + pan.y;

    // checker
    const cs = Math.max(4, zoom);
    for (let y = 0; y < size.h; y++) {
      for (let x = 0; x < size.w; x++) {
        ctx.fillStyle = (x + y) % 2 ? "rgba(255,255,255,0.05)" : "rgba(125,211,252,0.06)";
        ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
      }
    }

    // layers
    const f = frames[frameIdx];
    for (const l of f.layers) {
      if (!l.visible) continue;
      const c = layerCanvases.current.get(l.id);
      if (!c) continue;
      ctx.globalAlpha = l.opacity;
      ctx.drawImage(c, ox, oy, dw, dh);
    }
    ctx.globalAlpha = 1;

    // grid
    if (showGrid && zoom >= 6) {
      ctx.strokeStyle = "rgba(125,211,252,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= size.w; x++) {
        ctx.moveTo(ox + x * zoom + 0.5, oy);
        ctx.lineTo(ox + x * zoom + 0.5, oy + dh);
      }
      for (let y = 0; y <= size.h; y++) {
        ctx.moveTo(ox, oy + y * zoom + 0.5);
        ctx.lineTo(ox + dw, oy + y * zoom + 0.5);
      }
      ctx.stroke();
    }

    // border
    ctx.strokeStyle = "oklch(0.68 0.21 250)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox - 1, oy - 1, dw + 2, dh + 2);
  }, [frames, frameIdx, size, zoom, pan, showGrid]);

  useEffect(() => { requestRender(); }, [requestRender, drawDisplay]);

  // --- Pointer / gestures ---
  type P = { id: number; x: number; y: number };
  const pointers = useRef<Map<number, P>>(new Map());
  const gesture = useRef<{ d: number; cx: number; cy: number; zoom: number; pan: { x: number; y: number } } | null>(null);
  const stroking = useRef(false);
  const lastPx = useRef<{ x: number; y: number } | null>(null);

  // Undo stack per frame
  const undoStack = useRef<{ frameId: string; layerId: string; prev: string }[]>([]);
  const redoStack = useRef<{ frameId: string; layerId: string; data: string }[]>([]);

  const snapshotLayer = (frameId: string, layerId: string) => {
    const f = frames.find(x => x.id === frameId);
    const l = f?.layers.find(x => x.id === layerId);
    if (!f || !l) return null;
    return l.dataUrl;
  };

  const beginStroke = () => {
    const prev = snapshotLayer(frames[frameIdx].id, activeLayerId);
    if (prev != null) {
      undoStack.current.push({ frameId: frames[frameIdx].id, layerId: activeLayerId, prev });
      if (undoStack.current.length > 60) undoStack.current.shift();
      redoStack.current = [];
    }
  };

  const commitLayer = () => {
    const c = layerCanvases.current.get(activeLayerId);
    if (!c) return;
    const data = c.toDataURL("image/png");
    setFrames(fs => fs.map(f =>
      f.id !== frames[frameIdx].id ? f :
      { ...f, layers: f.layers.map(l => l.id === activeLayerId ? { ...l, dataUrl: data } : l) }
    ));
  };

  const screenToPixel = (clientX: number, clientY: number) => {
    const cnv = displayRef.current!;
    const r = cnv.getBoundingClientRect();
    const W = r.width, H = r.height;
    const dw = size.w * zoom, dh = size.h * zoom;
    const ox = (W - dw) / 2 + pan.x;
    const oy = (H - dh) / 2 + pan.y;
    const x = Math.floor((clientX - r.left - ox) / zoom);
    const y = Math.floor((clientY - r.top - oy) / zoom);
    return { x, y };
  };

  const paintAt = (x: number, y: number) => {
    const c = layerCanvases.current.get(activeLayerId);
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const r = Math.max(0, Math.floor((brush - 1) / 2));
    if (tool === "eraser") {
      ctx.clearRect(x - r, y - r, brush, brush);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x - r, y - r, brush, brush);
    }
  };

  const paintLine = (x0: number, y0: number, x1: number, y1: number) => {
    // Bresenham
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;
    while (true) {
      paintAt(x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  };

  const floodFill = (x: number, y: number) => {
    const c = layerCanvases.current.get(activeLayerId);
    if (!c || x < 0 || y < 0 || x >= c.width || y >= c.height) return;
    const ctx = c.getContext("2d")!;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const data = img.data;
    const idx = (px: number, py: number) => (py * c.width + px) * 4;
    const i0 = idx(x, y);
    const tr = data[i0], tg = data[i0 + 1], tb = data[i0 + 2], ta = data[i0 + 3];
    // parse color
    const tmp = document.createElement("canvas"); tmp.width = tmp.height = 1;
    const tctx = tmp.getContext("2d")!;
    tctx.fillStyle = color; tctx.fillRect(0, 0, 1, 1);
    const [nr, ng, nb, na] = tctx.getImageData(0, 0, 1, 1).data;
    if (tr === nr && tg === ng && tb === nb && ta === na) return;
    const stack: [number, number][] = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= c.width || cy >= c.height) continue;
      const i = idx(cx, cy);
      if (data[i] !== tr || data[i+1] !== tg || data[i+2] !== tb || data[i+3] !== ta) continue;
      data[i] = nr; data[i+1] = ng; data[i+2] = nb; data[i+3] = na;
      stack.push([cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]);
    }
    ctx.putImageData(img, 0, 0);
  };

  const eyedropAt = (x: number, y: number) => {
    // pick from composite of visible layers
    const tmp = document.createElement("canvas");
    tmp.width = size.w; tmp.height = size.h;
    const tctx = tmp.getContext("2d")!;
    for (const l of frames[frameIdx].layers) {
      if (!l.visible) continue;
      const c = layerCanvases.current.get(l.id);
      if (!c) continue;
      tctx.globalAlpha = l.opacity;
      tctx.drawImage(c, 0, 0);
    }
    tctx.globalAlpha = 1;
    if (x < 0 || y < 0 || x >= size.w || y >= size.h) return;
    const [r, g, b, a] = tctx.getImageData(x, y, 1, 1).data;
    if (a === 0) return;
    setColor("#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join(""));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
        zoom, pan: { ...pan },
      };
      stroking.current = false;
      lastPx.current = null;
      return;
    }

    if (pointers.current.size !== 1) return;
    const { x, y } = screenToPixel(e.clientX, e.clientY);
    if (tool === "eyedropper") {
      eyedropAt(x, y);
      return;
    }
    if (tool === "fill") {
      beginStroke();
      floodFill(x, y);
      commitLayer();
      requestRender();
      return;
    }
    beginStroke();
    stroking.current = true;
    lastPx.current = { x, y };
    paintAt(x, y);
    requestRender();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;

    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = Array.from(pointers.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const g = gesture.current;
      const newZoom = Math.max(2, Math.min(48, g.zoom * (d / g.d)));
      setZoom(newZoom);
      setPan({ x: g.pan.x + (cx - g.cx), y: g.pan.y + (cy - g.cy) });
      return;
    }

    if (!stroking.current || !lastPx.current) return;
    const { x, y } = screenToPixel(e.clientX, e.clientY);
    paintLine(lastPx.current.x, lastPx.current.y, x, y);
    lastPx.current = { x, y };
    requestRender();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (stroking.current) {
      stroking.current = false;
      lastPx.current = null;
      commitLayer();
    }
  };

  const undo = () => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    const cur = snapshotLayer(entry.frameId, entry.layerId);
    if (cur != null) redoStack.current.push({ frameId: entry.frameId, layerId: entry.layerId, data: cur });
    loadIntoLayer(entry.frameId, entry.layerId, entry.prev);
  };
  const redo = () => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    const cur = snapshotLayer(entry.frameId, entry.layerId);
    if (cur != null) undoStack.current.push({ frameId: entry.frameId, layerId: entry.layerId, prev: cur });
    loadIntoLayer(entry.frameId, entry.layerId, entry.data);
  };
  const loadIntoLayer = async (frameId: string, layerId: string, dataUrl: string) => {
    const c = layerCanvases.current.get(layerId);
    if (c) {
      const img = await loadImage(dataUrl);
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
    }
    setFrames(fs => fs.map(f => f.id !== frameId ? f :
      { ...f, layers: f.layers.map(l => l.id === layerId ? { ...l, dataUrl } : l) }
    ));
    requestRender();
  };

  // --- Layer ops ---
  const updateFrame = (patch: (f: SpriteFrame) => SpriteFrame) =>
    setFrames(fs => fs.map((f, i) => i === frameIdx ? patch(f) : f));

  const addLayer = () => {
    const l = makeLayer(size.w, size.h, `Layer ${frames[frameIdx].layers.length + 1}`);
    const c = document.createElement("canvas");
    c.width = size.w; c.height = size.h;
    layerCanvases.current.set(l.id, c);
    updateFrame(f => ({ ...f, layers: [...f.layers, l] }));
    setActiveLayerId(l.id);
  };
  const deleteLayer = (id: string) => {
    if (frames[frameIdx].layers.length <= 1) return;
    updateFrame(f => ({ ...f, layers: f.layers.filter(l => l.id !== id) }));
    layerCanvases.current.delete(id);
    if (activeLayerId === id) setActiveLayerId(frames[frameIdx].layers.find(l => l.id !== id)!.id);
  };
  const moveLayer = (id: string, dir: -1 | 1) => updateFrame(f => {
    const i = f.layers.findIndex(l => l.id === id);
    if (i < 0) return f;
    const j = i + dir;
    if (j < 0 || j >= f.layers.length) return f;
    const ls = [...f.layers];
    [ls[i], ls[j]] = [ls[j], ls[i]];
    return { ...f, layers: ls };
  });
  const updateLayer = (id: string, patch: Partial<SpriteLayer>) =>
    updateFrame(f => ({ ...f, layers: f.layers.map(l => l.id === id ? { ...l, ...patch } : l) }));

  // --- Frame ops ---
  const switchFrame = async (idx: number) => {
    setFrameIdx(idx);
    // ensure canvases for the new frame are correct
    for (const l of frames[idx].layers) {
      let c = layerCanvases.current.get(l.id);
      if (!c) {
        c = document.createElement("canvas");
        c.width = size.w; c.height = size.h;
        layerCanvases.current.set(l.id, c);
      }
      try {
        const img = await loadImage(l.dataUrl);
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
      } catch { /* blank */ }
    }
    setActiveLayerId(frames[idx].layers[0].id);
    requestRender();
  };

  const addFrame = (copy = false) => {
    const base = frames[frameIdx];
    const next: SpriteFrame = copy
      ? { id: uid(), composite: base.composite, layers: base.layers.map(l => ({ ...l, id: uid() })) }
      : makeFrame(size.w, size.h);
    // hydrate copy canvases
    if (copy) {
      for (let i = 0; i < base.layers.length; i++) {
        const src = layerCanvases.current.get(base.layers[i].id);
        const c = document.createElement("canvas");
        c.width = size.w; c.height = size.h;
        if (src) c.getContext("2d")!.drawImage(src, 0, 0);
        layerCanvases.current.set(next.layers[i].id, c);
      }
    }
    setFrames(fs => [...fs.slice(0, frameIdx + 1), next, ...fs.slice(frameIdx + 1)]);
    setFrameIdx(frameIdx + 1);
    setActiveLayerId(next.layers[0].id);
  };
  const deleteFrame = (idx: number) => {
    if (frames.length <= 1) return;
    setFrames(fs => fs.filter((_, i) => i !== idx));
    const newIdx = Math.max(0, idx - 1);
    setFrameIdx(newIdx);
  };

  // --- Preview playback ---
  const [playIdx, setPlayIdx] = useState(0);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const ms = 1000 / Math.max(1, fps);
    const t = setInterval(() => {
      setPlayIdx(i => {
        const n = i + 1;
        if (n >= frames.length) return loop ? 0 : i;
        return n;
      });
    }, ms);
    return () => clearInterval(t);
  }, [playing, fps, loop, frames.length]);

  // --- Resize size ---
  const changeSize = (n: number) => {
    if (n === size.w && n === size.h) return;
    if (!confirm(`Resize canvas to ${n}×${n}? Existing pixels will be rescaled.`)) return;
    // rescale every layer canvas
    for (const f of frames) {
      for (const l of f.layers) {
        const old = layerCanvases.current.get(l.id);
        const c = document.createElement("canvas");
        c.width = n; c.height = n;
        if (old) {
          const ctx = c.getContext("2d")!;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(old, 0, 0, n, n);
        }
        layerCanvases.current.set(l.id, c);
      }
    }
    setSize({ w: n, h: n });
    setFrames(fs => fs.map(f => ({
      ...f,
      layers: f.layers.map(l => {
        const c = layerCanvases.current.get(l.id);
        return { ...l, dataUrl: c ? c.toDataURL("image/png") : l.dataUrl };
      }),
    })));
  };

  // --- Save ---
  const handleSave = () => {
    const out: SpriteFrame[] = frames.map(f => {
      const tmp = document.createElement("canvas");
      tmp.width = size.w; tmp.height = size.h;
      const ctx = tmp.getContext("2d")!;
      const updatedLayers = f.layers.map(l => {
        const c = layerCanvases.current.get(l.id);
        const dataUrl = c ? c.toDataURL("image/png") : l.dataUrl;
        if (l.visible && c) {
          ctx.globalAlpha = l.opacity;
          ctx.drawImage(c, 0, 0);
        }
        return { ...l, dataUrl };
      });
      ctx.globalAlpha = 1;
      return { ...f, layers: updatedLayers, composite: tmp.toDataURL("image/png") };
    });
    const asset: SpriteAsset = {
      id: initial?.id ?? uid(),
      name: name.trim() || "Untitled Sprite",
      width: size.w, height: size.h,
      frames: out, fps, loop,
    };
    onSave(asset);
  };

  // --- Render ---
  const activeFrame = frames[frameIdx];
  const previewSrc = useMemo(() => {
    return frames[Math.min(playIdx, frames.length - 1)]?.composite ?? activeFrame?.composite;
  }, [frames, playIdx, activeFrame]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2 panel border-b">
        <button onClick={onClose} className="text-xs font-display px-2 py-1.5 rounded-md border border-border text-muted-foreground">✕</button>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono"
        />
        <button
          onClick={handleSave}
          className="font-display text-xs px-3 py-1.5 rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground glow-border"
        >
          ✓ SAVE
        </button>
      </header>

      {/* Top toolbar */}
      <div className="px-2 py-1.5 panel border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {(["pencil","eraser","fill","eyedropper"] as Tool[]).map(t => (
          <button key={t}
            onClick={() => setTool(t)}
            className={`shrink-0 px-2.5 py-1.5 rounded-md border text-[10px] font-display tracking-widest ${
              tool === t ? "bg-primary/20 border-primary text-primary-glow" : "border-border/50 text-muted-foreground"
            }`}
          >{t.toUpperCase()}</button>
        ))}
        <span className="mx-1 w-px h-5 bg-border" />
        <button onClick={undo} className="shrink-0 px-2 py-1.5 rounded-md border border-border/50 text-muted-foreground text-xs">↶</button>
        <button onClick={redo} className="shrink-0 px-2 py-1.5 rounded-md border border-border/50 text-muted-foreground text-xs">↷</button>
        <span className="mx-1 w-px h-5 bg-border" />
        <button onClick={() => setShowGrid(g => !g)}
          className={`shrink-0 px-2 py-1.5 rounded-md border text-[10px] font-display tracking-widest ${
            showGrid ? "bg-primary/15 border-primary/50 text-primary-glow" : "border-border/50 text-muted-foreground"
          }`}
        >GRID</button>
        <button onClick={() => { setZoom(10); setPan({ x: 0, y: 0 }); }}
          className="shrink-0 px-2 py-1.5 rounded-md border border-border/50 text-muted-foreground text-[10px] font-display tracking-widest"
        >FIT</button>
        <select value={size.w} onChange={e => changeSize(Number(e.target.value))}
          className="shrink-0 bg-input/60 border border-border rounded-md px-2 py-1.5 text-xs font-mono">
          {SIZES.map(s => <option key={s} value={s}>{s}×{s}</option>)}
        </select>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative">
        <canvas
          ref={displayRef}
          className="absolute inset-0 w-full h-full touch-none select-none"
          style={{ imageRendering: "pixelated" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {/* Live preview pill */}
        <div className="absolute top-2 right-2 flex items-center gap-2 panel rounded-md px-2 py-1.5 border border-border/60">
          <div className="w-10 h-10 rounded bg-input/40 grid place-items-center overflow-hidden border border-border/40">
            {previewSrc && <img src={previewSrc} alt="preview" className="w-full h-full object-contain" style={{ imageRendering: "pixelated" }} />}
          </div>
          <div className="flex flex-col">
            <button onClick={() => setPlaying(p => !p)} className="text-[10px] font-display text-primary-glow">{playing ? "⏸" : "▶"} {fps}fps</button>
            <span className="text-[9px] font-mono text-muted-foreground">{frames.length}f</span>
          </div>
        </div>
      </div>

      {/* Bottom panel selector */}
      <div className="grid grid-cols-3 panel border-t">
        {(["tools","layers","frames"] as const).map(p => (
          <button key={p}
            onClick={() => setPanel(p)}
            className={`py-1.5 text-[10px] font-display tracking-widest ${panel === p ? "text-primary-glow" : "text-muted-foreground"}`}
          >{p.toUpperCase()}</button>
        ))}
      </div>

      {/* Panels */}
      <div className="panel border-t max-h-[42vh] overflow-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {panel === "tools" && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-display tracking-widest text-muted-foreground">COLOR</span>
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="w-12 h-7 rounded bg-transparent border border-border" />
              </div>
              <div className="grid grid-cols-8 gap-1">
                {PALETTE.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`h-7 rounded border ${color.toLowerCase() === c ? "border-primary shadow-[0_0_8px_oklch(0.68_0.21_250/0.6)]" : "border-border/40"}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] font-display tracking-widest">
                <span className="text-muted-foreground">BRUSH SIZE</span>
                <span className="text-primary-glow font-mono">{brush}px</span>
              </div>
              <input type="range" min={1} max={8} value={brush} onChange={e => setBrush(Number(e.target.value))}
                className="w-full accent-[oklch(0.68_0.21_250)]" />
            </div>
            <div>
              <div className="flex justify-between text-[10px] font-display tracking-widest">
                <span className="text-muted-foreground">ZOOM</span>
                <span className="text-primary-glow font-mono">×{zoom.toFixed(1)}</span>
              </div>
              <input type="range" min={2} max={48} step={0.5} value={zoom} onChange={e => setZoom(Number(e.target.value))}
                className="w-full accent-[oklch(0.68_0.21_250)]" />
            </div>
          </div>
        )}

        {panel === "layers" && activeFrame && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-display tracking-widest text-muted-foreground">LAYERS · {activeFrame.layers.length}</span>
              <button onClick={addLayer} className="text-[10px] font-display px-2 py-1 rounded bg-primary/15 border border-primary/50 text-primary-glow">+ ADD</button>
            </div>
            {[...activeFrame.layers].reverse().map(l => (
              <div key={l.id}
                className={`rounded-md border p-2 ${activeLayerId === l.id ? "border-primary bg-primary/10" : "border-border/40"}`}
                onClick={() => setActiveLayerId(l.id)}
              >
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible }); }}
                    className="text-sm">{l.visible ? "👁" : "·"}</button>
                  <input value={l.name} onChange={e => updateLayer(l.id, { name: e.target.value })}
                    className="flex-1 bg-transparent text-xs font-mono outline-none" />
                  <button onClick={e => { e.stopPropagation(); moveLayer(l.id, 1); }} className="text-xs text-muted-foreground px-1">▲</button>
                  <button onClick={e => { e.stopPropagation(); moveLayer(l.id, -1); }} className="text-xs text-muted-foreground px-1">▼</button>
                  <button onClick={e => { e.stopPropagation(); deleteLayer(l.id); }} className="text-xs text-destructive px-1">✕</button>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={l.opacity}
                  onChange={e => updateLayer(l.id, { opacity: Number(e.target.value) })}
                  className="w-full mt-1 accent-[oklch(0.68_0.21_250)]" />
              </div>
            ))}
          </div>
        )}

        {panel === "frames" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={() => addFrame(false)} className="flex-1 py-1.5 rounded border border-primary/50 bg-primary/15 text-primary-glow text-[10px] font-display tracking-widest">+ BLANK</button>
              <button onClick={() => addFrame(true)} className="flex-1 py-1.5 rounded border border-border text-muted-foreground text-[10px] font-display tracking-widest">⧉ DUPLICATE</button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {frames.map((f, i) => (
                <div key={f.id} className={`shrink-0 w-16 rounded border ${i === frameIdx ? "border-primary" : "border-border/40"}`}>
                  <button onClick={() => switchFrame(i)} className="block w-full h-14 bg-input/40 overflow-hidden">
                    {f.composite && <img src={f.composite} className="w-full h-full object-contain" style={{ imageRendering: "pixelated" }} alt="" />}
                  </button>
                  <div className="flex justify-between px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
                    <span>{i + 1}</span>
                    <button onClick={() => deleteFrame(i)} className="text-destructive">✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="flex justify-between text-[10px] font-display tracking-widest">
                <span className="text-muted-foreground">FPS</span>
                <span className="text-primary-glow font-mono">{fps}</span>
              </div>
              <input type="range" min={1} max={30} value={fps} onChange={e => setFps(Number(e.target.value))}
                className="w-full accent-[oklch(0.68_0.21_250)]" />
            </div>
            <button onClick={() => setLoop(l => !l)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-xs font-display tracking-widest ${
                loop ? "border-primary/60 bg-primary/15 text-primary-glow" : "border-border text-muted-foreground"
              }`}
            >
              <span>{loop ? "LOOP" : "PLAY ONCE"}</span>
              <span className={`w-8 h-4 rounded-full p-0.5 transition ${loop ? "bg-primary" : "bg-muted"}`}>
                <span className={`block w-3 h-3 rounded-full bg-background transition ${loop ? "translate-x-4" : ""}`} />
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
