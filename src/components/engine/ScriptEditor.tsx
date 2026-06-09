import { useState } from "react";
import type { Entity, EntityKind } from "@/lib/engine/core";
import {
  type Block, type BlockKind, type EventType, type Script,
  ALL_BLOCKS, BLOCK_LABELS, EVENT_LABELS, uid,
} from "@/lib/engine/scripts";
import { SOUND_NAMES, type SoundName, playSound } from "@/lib/engine/sfx";

const KIND_OPTIONS: (EntityKind | "any")[] = ["any", "player", "platform", "enemy", "coin", "goal"];

interface Props {
  entity: Entity;
  onChange: (patch: Partial<Entity>) => void;
  onClose: () => void;
}

export function ScriptEditor({ entity, onChange, onClose }: Props) {
  const [scripts, setScripts] = useState<Script[]>(entity.scripts ?? []);
  const [openId, setOpenId] = useState<string | null>(scripts[0]?.id ?? null);

  const commit = (next: Script[]) => {
    setScripts(next);
    onChange({ scripts: next });
  };

  const addScript = () => {
    const s: Script = { id: uid(), event: "onStart", blocks: [] };
    const next = [...scripts, s];
    commit(next);
    setOpenId(s.id);
  };

  const updateScript = (id: string, patch: Partial<Script>) =>
    commit(scripts.map(s => s.id === id ? { ...s, ...patch } : s));

  const removeScript = (id: string) =>
    commit(scripts.filter(s => s.id !== id));

  const addBlock = (sid: string, kind: BlockKind) => {
    const def = defaultBlock(kind);
    commit(scripts.map(s => s.id === sid ? { ...s, blocks: [...s.blocks, def] } : s));
  };

  const updateBlock = (sid: string, bid: string, patch: Partial<Block>) =>
    commit(scripts.map(s => s.id === sid
      ? { ...s, blocks: s.blocks.map(b => b.id === bid ? { ...b, ...patch } : b) }
      : s));

  const removeBlock = (sid: string, bid: string) =>
    commit(scripts.map(s => s.id === sid
      ? { ...s, blocks: s.blocks.filter(b => b.id !== bid) }
      : s));

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 panel border-b">
        <div>
          <div className="font-display text-sm text-primary-glow glow-text">EVENTS · {entity.kind.toUpperCase()}</div>
          <div className="text-[10px] font-mono text-muted-foreground">block-code scripting</div>
        </div>
        <button onClick={onClose} className="px-3 py-1.5 rounded-md panel glow-border text-xs font-display">CLOSE</button>
      </header>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {scripts.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10">
            No scripts yet. Tap <span className="text-primary-glow">+ NEW SCRIPT</span> to start.
          </div>
        )}

        {scripts.map(s => {
          const open = openId === s.id;
          return (
            <div key={s.id} className="panel rounded-lg border border-border/60 overflow-hidden">
              <button
                onClick={() => setOpenId(open ? null : s.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
              >
                <span className="font-display text-xs text-primary-glow tracking-widest">
                  ◉ {EVENT_LABELS[s.event]}{s.event === "onCollide" ? ` · ${s.withKind ?? "any"}` : ""}
                </span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">{s.blocks.length} BLK</span>
              </button>

              {open && (
                <div className="border-t border-border/40 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] font-display tracking-widest text-muted-foreground">
                      EVENT
                      <select
                        value={s.event}
                        onChange={e => updateScript(s.id, { event: e.target.value as EventType })}
                        className="mt-1 w-full bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                      >
                        {(Object.keys(EVENT_LABELS) as EventType[]).map(k =>
                          <option key={k} value={k}>{EVENT_LABELS[k]}</option>
                        )}
                      </select>
                    </label>
                    {s.event === "onCollide" && (
                      <label className="text-[10px] font-display tracking-widest text-muted-foreground">
                        WITH
                        <select
                          value={s.withKind ?? "any"}
                          onChange={e => updateScript(s.id, { withKind: e.target.value as EntityKind | "any" })}
                          className="mt-1 w-full bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                        >
                          {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </label>
                    )}
                    {s.event === "onKeyDown" && (
                      <label className="text-[10px] font-display tracking-widest text-muted-foreground">
                        KEY
                        <select
                          value={s.key ?? "jump"}
                          onChange={e => updateScript(s.id, { key: e.target.value as Script["key"] })}
                          className="mt-1 w-full bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                        >
                          <option value="jump">jump</option>
                          <option value="left">left</option>
                          <option value="right">right</option>
                        </select>
                      </label>
                    )}
                    {s.event === "onScoreReach" && (
                      <label className="text-[10px] font-display tracking-widest text-muted-foreground">
                        SCORE ≥
                        <input
                          type="number"
                          value={s.threshold ?? 0}
                          onChange={e => updateScript(s.id, { threshold: Number(e.target.value) })}
                          className="mt-1 w-full bg-input/60 border border-border rounded-md px-2 py-1.5 text-sm font-mono"
                        />
                      </label>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {s.blocks.map(b => (
                      <BlockRow
                        key={b.id}
                        block={b}
                        onChange={patch => updateBlock(s.id, b.id, patch)}
                        onRemove={() => removeBlock(s.id, b.id)}
                      />
                    ))}
                  </div>

                  <AddBlock onAdd={k => addBlock(s.id, k)} />

                  <button
                    onClick={() => removeScript(s.id)}
                    className="w-full mt-1 py-1.5 rounded-md bg-destructive/15 border border-destructive/40 text-destructive font-display text-[10px] tracking-widest"
                  >DELETE SCRIPT</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t panel">
        <button
          onClick={addScript}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-primary to-accent text-primary-foreground font-display tracking-widest text-sm glow-border"
        >+ NEW SCRIPT</button>
      </div>
    </div>
  );
}

function defaultBlock(k: BlockKind): Block {
  const base: Block = { id: uid(), kind: k };
  switch (k) {
    case "jump": return { ...base, value: 520 };
    case "setVx": return { ...base, value: 120 };
    case "setVy": return { ...base, value: 0 };
    case "addScore": return { ...base, value: 10 };
    case "teleport": return { ...base, x: 100, y: 100 };
    case "log": return { ...base, text: "hello" };
    case "playSound": return { ...base, sound: "coin" };
    case "vibrate": return { ...base, value: 50 };
    case "shake": return { ...base, value: 8 };
    case "setColor": return { ...base, color: "#7dd3fc" };
    case "setSize": return { ...base, x: 32, y: 32 };
    case "setGravity": return { ...base, bool: true };
    case "setControllable": return { ...base, bool: true };
    case "if": return { ...base, cond: "scoreGte", value: 10, thenBlocks: [] };
    default: return base;
  }
}

function BlockRow({ block, onChange, onRemove }: { block: Block; onChange: (p: Partial<Block>) => void; onRemove: () => void }) {
  return (
    <div className="panel rounded-md border border-border/60 p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-display text-primary-glow tracking-widest">{BLOCK_LABELS[block.kind]}</span>
        <button onClick={onRemove} className="ml-auto text-destructive text-sm px-1">✕</button>
      </div>
      <BlockFields block={block} onChange={onChange} />
    </div>
  );
}

function BlockFields({ block, onChange }: { block: Block; onChange: (p: Partial<Block>) => void }) {
  const num = (k: keyof Block, v: string) => onChange({ [k]: Number(v) } as Partial<Block>);
  switch (block.kind) {
    case "jump":
    case "setVx":
    case "setVy":
    case "addScore":
    case "vibrate":
    case "shake":
      return (
        <input type="number" value={block.value ?? 0} onChange={e => num("value", e.target.value)}
          className="w-full bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
      );
    case "teleport":
    case "setSize":
      return (
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={block.x ?? 0} onChange={e => num("x", e.target.value)}
            placeholder={block.kind === "setSize" ? "w" : "x"} className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
          <input type="number" value={block.y ?? 0} onChange={e => num("y", e.target.value)}
            placeholder={block.kind === "setSize" ? "h" : "y"} className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
        </div>
      );
    case "log":
      return (
        <input value={block.text ?? ""} onChange={e => onChange({ text: e.target.value })}
          className="w-full bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
      );
    case "playSound":
      return (
        <div className="flex gap-2">
          <select value={block.sound ?? "blip"} onChange={e => onChange({ sound: e.target.value as SoundName })}
            className="flex-1 bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono">
            {SOUND_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button type="button" onClick={() => playSound((block.sound ?? "blip") as SoundName)}
            className="px-2 py-1 text-xs rounded border border-primary/40 text-primary-glow font-display">▶</button>
        </div>
      );
    case "setColor":
      return (
        <input type="color" value={block.color ?? "#7dd3fc"} onChange={e => onChange({ color: e.target.value })}
          className="w-full h-9 bg-transparent border border-border rounded" />
      );
    case "setGravity":
    case "setControllable":
      return (
        <button onClick={() => onChange({ bool: !block.bool })}
          className={`w-full py-1.5 rounded border text-xs font-display tracking-widest ${
            block.bool ? "bg-primary/15 border-primary/50 text-primary-glow" : "border-border text-muted-foreground"
          }`}>{block.bool ? "ON" : "OFF"}</button>
      );
    case "if":
      return (
        <div className="grid grid-cols-2 gap-2">
          <select value={block.cond ?? "scoreGte"} onChange={e => onChange({ cond: e.target.value as Block["cond"] })}
            className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono">
            <option value="scoreGte">score ≥</option>
            <option value="scoreLte">score ≤</option>
          </select>
          <input type="number" value={block.value ?? 0} onChange={e => num("value", e.target.value)}
            className="bg-input/60 border border-border rounded px-2 py-1 text-sm font-mono" />
          <div className="col-span-2 text-[10px] font-mono text-muted-foreground">
            then-blocks unsupported in this version — gate scripts by adding multiple separate scripts.
          </div>
        </div>
      );
    default:
      return null;
  }
}

function AddBlock({ onAdd }: { onAdd: (k: BlockKind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full py-2 rounded-md border border-dashed border-primary/40 text-primary-glow font-display text-xs tracking-widest"
      >+ ADD BLOCK</button>
      {open && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {ALL_BLOCKS.map(k => (
            <button key={k}
              onClick={() => { onAdd(k); setOpen(false); }}
              className="text-[11px] py-1.5 rounded panel border border-border/60 text-left px-2 font-mono"
            >{BLOCK_LABELS[k]}</button>
          ))}
        </div>
      )}
    </div>
  );
}
