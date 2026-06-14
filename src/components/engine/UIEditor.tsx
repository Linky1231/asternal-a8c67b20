import { useEffect, useRef, useState } from "react";
import type { Scene, UIElement, UIElementKind, UIAnchor, UIAction, UIBind } from "@/lib/engine/core";
import { newUIElement, resolveUIRect, uid } from "@/lib/engine/core";
import { getImage } from "@/lib/engine/images";
import { fileToDataURL } from "@/lib/engine/images";

interface Props {
  scene: Scene;
  onChange: (s: Scene) => void;
}

const KIND_LIST: { id: UIElementKind; icon: string; label: string }[] = [
  { id: "button", icon: "◉", label: "BUTTON" },
  { id: "label", icon: "T", label: "LABEL" },
  { id: "image", icon: "▣", label: "IMAGE" },
  { id: "panel", icon: "▭", label: "PANEL" },
  { id: "bar", icon: "▬", label: "BAR" },
  { id: "joystick", icon: "◎", label: "STICK" },
];

const ANCHORS: UIAnchor[] = ["tl","tc","tr","cl","c","cr","bl","bc","br"];

export function UIEditor({ scene, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selId, setSelId] = useState<string | null>(null);
  // `virt` = the size the game will actually render at (used for layout math
  // so what you place here lands at the same spot in PLAY). `size` = the
  // scaled-down on-screen size of the preview inside the editor.
  const [virt, setVirt] = useState({ w: 360, h: 640 });
  const [size, setSize] = useState({ w: 360, h: 640 });
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);
  const tickRef = useRef(0);

  const ui = scene.ui ?? [];
  const sel = ui.find(e => e.id === selId) ?? null;

  // Fit preview to wrap while matching the REAL game canvas aspect (window
  // minus header & tab bar), so anchored offsets are 1:1 with PLAY.
  useEffect(() => {
    const fit = () => {
      const w = wrapRef.current; if (!w) return;
      const aw = Math.max(80, w.clientWidth - 16);
      const ah = Math.max(80, w.clientHeight - 16);
      const HEADER = 56, TABS = 72;
      const vw = Math.max(240, window.innerWidth);
      const vh = Math.max(240, window.innerHeight - HEADER - TABS);
      const sc = Math.min(aw / vw, ah / vh);
      setVirt({ w: vw, h: vh });
      setSize({ w: Math.round(vw * sc), h: Math.round(vh * sc) });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // render loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      tickRef.current++;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Canvas internal coords = virtual game size; CSS scales it to fit.
      if (canvas.width !== virt.w * dpr || canvas.height !== virt.h * dpr) {
        canvas.width = virt.w * dpr; canvas.height = virt.h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = virt.w, H = virt.h;
      // game backdrop
      ctx.fillStyle = scene.bg || "#0b1e3f";
      ctx.fillRect(0, 0, W, H);
      if (scene.bgImage) {
        const img = getImage(scene.bgImage);
        if (img?.width) {
          const sa = img.width / img.height, da = W / H;
          const cover = sa > da;
          const dw = cover ? H * sa : W;
          const dh = cover ? H : W / sa;
          ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        }
      }
      // dim
      ctx.fillStyle = "rgba(2,6,23,0.35)";
      ctx.fillRect(0, 0, W, H);

      // safe area + anchor crosshair
      ctx.strokeStyle = "rgba(125,211,252,0.18)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(8, 8, W - 16, H - 16);
      ctx.setLineDash([]);

      const t = tickRef.current / 60;
      const mockState = {
        score: Math.floor(t * 5),
        lives: Math.max(1, (scene.startLives ?? 3) - Math.floor(t / 4) % (scene.startLives ?? 3)),
        time: t,
        timeLimit: scene.timeLimit && scene.timeLimit > 0 ? scene.timeLimit : undefined,
      };
      for (const el of ui) {
        if (el.visible === false) continue;
        drawUIElement(ctx, el, W, H, tickRef.current, mockState);
      }

      if (sel) {
        const r = resolveUIRect(sel, W, H);
        ctx.strokeStyle = "#7dd3fc";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
        ctx.setLineDash([]);
        // resize handle (scaled up so it stays grabbable when the canvas is scaled down)
        const hs = Math.max(14, 16 / Math.max(0.001, size.w / virt.w));
        ctx.fillStyle = "#f8fafc";
        ctx.strokeStyle = "#0ea5e9";
        ctx.fillRect(r.x + r.w - hs / 2, r.y + r.h - hs / 2, hs, hs);
        ctx.strokeRect(r.x + r.w - hs / 2 + 0.5, r.y + r.h - hs / 2 + 0.5, hs - 1, hs - 1);
      }
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [scene.bg, scene.bgImage, ui, sel, size, virt]);

  const updateEl = (id: string, patch: Partial<UIElement>) => {
    onChange({ ...scene, ui: ui.map(e => e.id === id ? { ...e, ...patch } : e) });
  };

  const addEl = (kind: UIElementKind) => {
    const el = newUIElement(kind);
    onChange({ ...scene, ui: [...ui, el] });
    setSelId(el.id);
  };

  const removeEl = (id: string) => {
    onChange({ ...scene, ui: ui.filter(e => e.id !== id) });
    if (selId === id) setSelId(null);
  };

  const cloneEl = (id: string) => {
    const e = ui.find(x => x.id === id); if (!e) return;
    const copy: UIElement = { ...e, id: uid(), x: e.x + 12, y: e.y + 12 };
    onChange({ ...scene, ui: [...ui, copy] });
    setSelId(copy.id);
  };

  const toVirt = (ev: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = (ev.clientX - rect.left) * (virt.w / Math.max(1, rect.width));
    const sy = (ev.clientY - rect.top) * (virt.h / Math.max(1, rect.height));
    return { sx, sy };
  };
  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.target as Element).setPointerCapture(ev.pointerId);
    const { sx, sy } = toVirt(ev);
    // resize handle hit (use a generous grab radius in virtual coords)
    if (sel) {
      const r = resolveUIRect(sel, virt.w, virt.h);
      const grab = Math.max(18, 20 / Math.max(0.001, size.w / virt.w));
      if (sx >= r.x + r.w - grab && sx <= r.x + r.w + grab && sy >= r.y + r.h - grab && sy <= r.y + r.h + grab) {
        dragRef.current = { id: sel.id, mode: "resize", sx, sy, ox: sel.x, oy: sel.y, ow: sel.w, oh: sel.h };
        return;
      }
    }
    for (let i = ui.length - 1; i >= 0; i--) {
      const el = ui[i];
      const r = resolveUIRect(el, virt.w, virt.h);
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
        setSelId(el.id);
        dragRef.current = { id: el.id, mode: "move", sx, sy, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
        return;
      }
    }
    setSelId(null);
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const { sx, sy } = toVirt(ev);
    const dx = sx - d.sx, dy = sy - d.sy;
    if (d.mode === "move") updateEl(d.id, { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) });
    else updateEl(d.id, { w: Math.max(16, Math.round(d.ow + dx)), h: Math.max(16, Math.round(d.oh + dy)) });
  };
  const onPointerUp = () => { dragRef.current = null; };

  return (
    <div className="h-full w-full grid grid-rows-[auto_1fr_auto] overflow-hidden">
      {/* Toolbar: add elements */}
      <div className="px-2 pt-2 panel border-b">
        <div className="flex gap-1.5 overflow-x-auto pb-2 no-scrollbar">
          {KIND_LIST.map(k => (
            <button key={k.id} onClick={() => addEl(k.id)}
              className="shrink-0 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md min-w-[58px] border border-border/40 text-muted-foreground hover:border-primary/50 hover:text-primary-glow transition">
              <span className="text-lg leading-none">{k.icon}</span>
              <span className="text-[9px] font-display tracking-wider">{k.label}</span>
            </button>
          ))}
          <button onClick={() => { if (confirm("Clear all UI?")) onChange({ ...scene, ui: [] }); }}
            className="shrink-0 ml-auto flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md border border-destructive/30 text-destructive">
            <span className="text-lg leading-none">✕</span>
            <span className="text-[9px] font-display tracking-wider">CLEAR</span>
          </button>
        </div>
      </div>

      {/* Preview canvas */}
      <div ref={wrapRef} className="relative w-full h-full grid place-items-center bg-background overflow-hidden">
        <div className="relative rounded-2xl border-2 border-primary/30 shadow-[0_0_24px_oklch(0.68_0.21_250/0.3)] overflow-hidden bg-black"
          style={{ width: size.w, height: size.h }}>
          <canvas
            ref={canvasRef}
            className="block touch-none"
            style={{ width: size.w, height: size.h }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
        <div className="absolute top-2 left-2 panel rounded-md px-2 py-1 text-[10px] font-mono text-primary-glow">
          UI · {ui.length} · {virt.w}×{virt.h}
        </div>
      </div>

      {/* Inspector — extra bottom padding so content never sits under the tab bar */}
      <div className="panel border-t max-h-[42vh] overflow-auto p-3 pb-8 space-y-2">
        {!sel ? (
          <div className="text-[11px] font-mono text-muted-foreground text-center py-4">
            Tap an element to edit · use the toolbar above to add UI components
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {ui.map(e => (
                <button key={e.id} onClick={() => setSelId(e.id)}
                  className="text-left px-2 py-1.5 rounded border border-border text-[10px] font-mono text-muted-foreground flex items-center gap-2">
                  <span className="text-primary-glow">{e.kind.toUpperCase()}</span>
                  <span className="truncate">{e.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ElementInspector el={sel} update={(p) => updateEl(sel.id, p)} remove={() => removeEl(sel.id)} clone={() => cloneEl(sel.id)} back={() => setSelId(null)} />
        )}
      </div>
    </div>
  );
}

function ElementInspector({ el, update, remove, clone, back }: {
  el: UIElement;
  update: (p: Partial<UIElement>) => void;
  remove: () => void;
  clone: () => void;
  back: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-display text-xs tracking-[0.25em] text-primary-glow">{el.kind.toUpperCase()} · {el.name}</span>
        <button onClick={back} className="text-xs text-muted-foreground">← Back</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <LabeledInput label="NAME" value={el.name} onChange={v => update({ name: v })} />
        <div>
          <div className="text-[10px] font-display tracking-widest text-muted-foreground">ANCHOR</div>
          <div className="grid grid-cols-3 gap-0.5 mt-1 w-fit">
            {ANCHORS.map(a => (
              <button key={a} onClick={() => update({ anchor: a })}
                className={`w-7 h-7 rounded text-[10px] font-mono border ${el.anchor === a ? "bg-primary/30 border-primary text-primary-glow" : "border-border text-muted-foreground"}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <NumInput label="X" value={el.x} onChange={v => update({ x: v })} />
        <NumInput label="Y" value={el.y} onChange={v => update({ y: v })} />
        <NumInput label="W" value={el.w} onChange={v => update({ w: v })} />
        <NumInput label="H" value={el.h} onChange={v => update({ h: v })} />
      </div>

      {(el.kind === "button" || el.kind === "label" || el.kind === "panel") && (
        <LabeledInput label="TEXT" value={el.text ?? ""} onChange={v => update({ text: v })} />
      )}

      {(el.kind === "button" || el.kind === "label") && (
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="FONT SIZE" value={el.fontSize ?? 14} onChange={v => update({ fontSize: v })} />
          <ColorInput label="TEXT COLOR" value={el.color ?? "#ffffff"} onChange={v => update({ color: v })} />
        </div>
      )}

      {el.kind !== "label" && (
        <div className="grid grid-cols-2 gap-2">
          <ColorInput label="BACKGROUND" value={el.bg ?? "#0ea5e9"} onChange={v => update({ bg: v })} />
          <ColorInput label="BORDER" value={el.border ?? "#7dd3fc"} onChange={v => update({ border: v })} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumInput label="RADIUS" value={el.radius ?? 0} onChange={v => update({ radius: v })} />
        <NumInput label="OPACITY %" value={Math.round((el.opacity ?? 1) * 100)} onChange={v => update({ opacity: Math.max(0, Math.min(1, v / 100)) })} />
      </div>

      {el.kind === "image" && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-display tracking-widest text-muted-foreground">IMAGE</div>
          <div className="flex items-center gap-2">
            {el.image && <img src={el.image} alt="" className="w-12 h-12 rounded border border-border object-contain bg-background" />}
            <button onClick={() => fileRef.current?.click()} className="flex-1 py-2 rounded border border-primary/50 bg-primary/10 text-primary-glow text-[10px] font-display tracking-widest">PICK IMAGE</button>
            {el.image && <button onClick={() => update({ image: null })} className="py-2 px-3 rounded border border-border text-muted-foreground text-[10px] font-display">CLEAR</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const url = await fileToDataURL(f); update({ image: url }); e.target.value = ""; }} />
        </div>
      )}

      {el.kind === "button" && (
        <>
          <div className="text-[10px] font-display tracking-widest text-muted-foreground">ACTION</div>
          <div className="grid grid-cols-4 gap-1">
            {(["none","left","right","jump","restart","exit","event"] as UIAction[]).map(a => (
              <button key={a} onClick={() => update({ action: a })}
                className={`py-1.5 rounded text-[10px] font-display tracking-widest border ${(el.action ?? "none") === a ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"}`}>
                {a.toUpperCase()}
              </button>
            ))}
          </div>
          {el.action === "event" && (
            <LabeledInput label="EVENT NAME" value={el.eventName ?? ""} onChange={v => update({ eventName: v })} />
          )}
        </>
      )}

      {(el.kind === "label" || el.kind === "bar") && (
        <>
          <div className="text-[10px] font-display tracking-widest text-muted-foreground">DATA BINDING</div>
          <div className="grid grid-cols-4 gap-1">
            {(["none","score","lives","time"] as UIBind[]).map(b => (
              <button key={b} onClick={() => update({ bind: b })}
                className={`py-1.5 rounded text-[10px] font-display tracking-widest border ${(el.bind ?? "none") === b ? "bg-primary/20 border-primary text-primary-glow" : "border-border text-muted-foreground"}`}>
                {b.toUpperCase()}
              </button>
            ))}
          </div>
          {el.kind === "bar" && (
            <NumInput label="MAX VALUE" value={el.max ?? 100} onChange={v => update({ max: v })} />
          )}
        </>
      )}

      <div className="grid grid-cols-3 gap-2 pt-2">
        <button onClick={clone} className="py-2 rounded border border-primary/50 bg-primary/10 text-primary-glow font-display text-[10px] tracking-widest">⧉ CLONE</button>
        <button onClick={() => update({ visible: !(el.visible ?? true) })} className="py-2 rounded border border-border text-muted-foreground font-display text-[10px] tracking-widest">
          {el.visible === false ? "SHOW" : "HIDE"}
        </button>
        <button onClick={remove} className="py-2 rounded border border-destructive/50 bg-destructive/15 text-destructive font-display text-[10px] tracking-widest">✕ DELETE</button>
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[10px] font-display tracking-widest text-muted-foreground">{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-full mt-1 px-2 py-1.5 rounded bg-input/60 border border-border text-xs font-mono focus:outline-none focus:border-primary" />
    </div>
  );
}
function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="text-[10px] font-display tracking-widest text-muted-foreground">{label}</div>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-full mt-1 px-2 py-1.5 rounded bg-input/60 border border-border text-xs font-mono focus:outline-none focus:border-primary" />
    </div>
  );
}
function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[10px] font-display tracking-widest text-muted-foreground">{label}</div>
      <input type="color" value={hexOf(value)} onChange={e => onChange(e.target.value)}
        className="w-full h-9 mt-1 rounded border border-border bg-transparent" />
    </div>
  );
}
function hexOf(v: string): string {
  if (v.startsWith("#")) return v.slice(0, 7);
  return "#0ea5e9";
}

// ---- shared drawing (used by editor preview and runtime) ----
export function drawUIElement(ctx: CanvasRenderingContext2D, el: UIElement, W: number, H: number, tick: number, state?: { score: number; lives: number; time: number; timeLimit?: number }) {
  const r = resolveUIRect(el, W, H);
  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  const radius = el.radius ?? 8;
  const path = () => roundRectPath(ctx, r.x, r.y, r.w, r.h, Math.min(radius, Math.min(r.w, r.h) / 2));

  if (el.kind === "image" && el.image) {
    const img = getImage(el.image);
    if (img) {
      ctx.save(); path(); ctx.clip();
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(125,211,252,0.15)"; path(); ctx.fill();
    }
  } else if (el.kind === "bar") {
    // bg
    ctx.fillStyle = el.bg ?? "rgba(2,6,23,0.6)"; path(); ctx.fill();
    // value
    let v = 1;
    if (state && el.bind && el.bind !== "none") {
      const max = el.max && el.max > 0
        ? el.max
        : (el.bind === "lives" ? Math.max(1, state.lives) : 100);
      let cur = 0;
      if (el.bind === "score") cur = state.score;
      else if (el.bind === "lives") cur = state.lives;
      else if (el.bind === "time") cur = state.timeLimit ? Math.max(0, state.timeLimit - state.time) : state.time;
      v = Math.max(0, Math.min(1, cur / Math.max(1, max)));
    }
    ctx.save(); path(); ctx.clip();
    ctx.fillStyle = el.color ?? "#22c55e";
    ctx.fillRect(r.x, r.y, r.w * v, r.h);
    ctx.restore();
    if (el.border) { ctx.lineWidth = 1; ctx.strokeStyle = el.border; path(); ctx.stroke(); }
  } else if (el.kind === "joystick") {
    ctx.fillStyle = el.bg ?? "rgba(2,6,23,0.4)";
    ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) / 2, 0, Math.PI * 2); ctx.fill();
    if (el.border) { ctx.strokeStyle = el.border; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) / 2 - 1, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = el.color ?? "#7dd3fc";
    ctx.globalAlpha = (el.opacity ?? 1) * 0.7;
    // animated knob preview so it looks alive in the editor
    const ang = (tick * 0.04);
    const off = Math.min(r.w, r.h) / 6;
    const kx = r.x + r.w / 2 + Math.cos(ang) * off * (state ? 0 : 1);
    const ky = r.y + r.h / 2 + Math.sin(ang) * off * (state ? 0 : 1);
    ctx.beginPath(); ctx.arc(kx, ky, Math.min(r.w, r.h) / 5, 0, Math.PI * 2); ctx.fill();
  } else if (el.kind === "label") {
    let text = el.text ?? "";
    if (state && el.bind && el.bind !== "none") {
      if (el.bind === "score") text = text.replace(/\{v\}/g, String(state.score)) || `SCORE: ${state.score}`;
      else if (el.bind === "lives") text = text.replace(/\{v\}/g, String(state.lives)) || `♥ ${state.lives}`;
      else if (el.bind === "time") {
        const t = state.timeLimit ? Math.max(0, Math.ceil(state.timeLimit - state.time)) : Math.floor(state.time);
        text = text.replace(/\{v\}/g, String(t)) || `⏱ ${t}`;
      }
    }
    ctx.fillStyle = el.color ?? "#7dd3fc";
    ctx.font = `600 ${el.fontSize ?? 14}px Rajdhani, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(text, r.x, r.y + r.h / 2);
  } else {
    // button / panel
    ctx.fillStyle = el.bg ?? "rgba(2,6,23,0.6)";
    path(); ctx.fill();
    if (el.border) { ctx.lineWidth = 1.5; ctx.strokeStyle = el.border; path(); ctx.stroke(); }
    if (el.text) {
      ctx.fillStyle = el.color ?? "#ffffff";
      ctx.font = `700 ${el.fontSize ?? 14}px Rajdhani, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(el.text, r.x + r.w / 2, r.y + r.h / 2);
      ctx.textAlign = "start";
    }
  }

  // subtle pulse for buttons
  if (el.kind === "button" && (el.action === "jump" || el.action === "restart")) {
    const pulse = (Math.sin(tick * 0.05) + 1) / 2 * 0.4 + 0.6;
    ctx.globalAlpha = (el.opacity ?? 1) * pulse * 0.3;
    ctx.strokeStyle = el.border ?? "#7dd3fc";
    ctx.lineWidth = 2;
    path(); ctx.stroke();
  }

  ctx.restore();
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
