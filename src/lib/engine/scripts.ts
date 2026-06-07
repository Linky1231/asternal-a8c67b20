// Block-based scripting (events + actions) for Asternal Engine
import type { Entity, EntityKind, RuntimeState, Scene } from "./core";
import { intersects } from "./core";

export type EventType = "onStart" | "onUpdate" | "onCollide";

export type BlockKind =
  | "jump"
  | "setVx"
  | "setVy"
  | "addScore"
  | "destroySelf"
  | "destroyOther"
  | "win"
  | "lose"
  | "teleport"
  | "log"
  | "if";

export interface Block {
  id: string;
  kind: BlockKind;
  // generic params
  value?: number;
  x?: number;
  y?: number;
  text?: string;
  // for if
  cond?: "scoreGte" | "scoreLte";
  thenBlocks?: Block[];
}

export interface Script {
  id: string;
  event: EventType;
  // only used when event === 'onCollide'
  withKind?: EntityKind | "any";
  blocks: Block[];
}

export const EVENT_LABELS: Record<EventType, string> = {
  onStart: "On Start",
  onUpdate: "On Update",
  onCollide: "On Collide",
};

export const BLOCK_LABELS: Record<BlockKind, string> = {
  jump: "Jump (force)",
  setVx: "Set velocity X",
  setVy: "Set velocity Y",
  addScore: "Add score",
  destroySelf: "Destroy self",
  destroyOther: "Destroy other",
  win: "Win level",
  lose: "Game over",
  teleport: "Teleport (x,y)",
  log: "Log message",
  if: "If condition",
};

export const ALL_BLOCKS: BlockKind[] = [
  "jump", "setVx", "setVy", "addScore",
  "destroySelf", "destroyOther", "win", "lose",
  "teleport", "log", "if",
];

interface ExecCtx {
  self: Entity;
  other?: Entity;
  scene: Scene;
  state: RuntimeState;
}

function execBlock(b: Block, ctx: ExecCtx) {
  switch (b.kind) {
    case "jump": ctx.self.vy = -(b.value ?? 520); break;
    case "setVx": ctx.self.vx = b.value ?? 0; break;
    case "setVy": ctx.self.vy = b.value ?? 0; break;
    case "addScore": ctx.state.score += b.value ?? 1; break;
    case "destroySelf": ctx.self.x = -99999; break;
    case "destroyOther": if (ctx.other) ctx.other.x = -99999; break;
    case "win": ctx.state.win = true; break;
    case "lose": ctx.state.dead = true; break;
    case "teleport":
      ctx.self.x = b.x ?? ctx.self.x;
      ctx.self.y = b.y ?? ctx.self.y;
      break;
    case "log": console.log("[script]", b.text ?? "", ctx.self.kind); break;
    case "if": {
      const v = b.value ?? 0;
      const ok =
        b.cond === "scoreGte" ? ctx.state.score >= v :
        b.cond === "scoreLte" ? ctx.state.score <= v : false;
      if (ok) for (const sub of b.thenBlocks ?? []) execBlock(sub, ctx);
      break;
    }
  }
}

function runScript(s: Script, ctx: ExecCtx) {
  for (const b of s.blocks) execBlock(b, ctx);
}

export interface ScriptRunner {
  step: (scene: Scene, state: RuntimeState) => void;
}

/** Create a runner that tracks per-entity onStart firing and onCollide edges. */
export function createScriptRunner(): ScriptRunner {
  const started = new Set<string>();
  const colliding = new Set<string>(); // key: `${a}|${b}`

  return {
    step(scene, state) {
      const live = scene.entities;
      // onStart + onUpdate
      for (const e of live) {
        const scripts = e.scripts ?? [];
        if (!scripts.length) continue;
        if (!started.has(e.id)) {
          for (const s of scripts) if (s.event === "onStart") runScript(s, { self: e, scene, state });
          started.add(e.id);
        }
        for (const s of scripts) if (s.event === "onUpdate") runScript(s, { self: e, scene, state });
      }
      // onCollide (edge-triggered: only fire when entering collision)
      const now = new Set<string>();
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        const aScripts = (a.scripts ?? []).filter(s => s.event === "onCollide");
        if (!aScripts.length) continue;
        for (let j = 0; j < live.length; j++) {
          if (i === j) continue;
          const b = live[j];
          if (b.x < -9000) continue;
          if (!intersects(a, b)) continue;
          const key = `${a.id}|${b.id}`;
          now.add(key);
          if (colliding.has(key)) continue;
          for (const s of aScripts) {
            if (!s.withKind || s.withKind === "any" || s.withKind === b.kind) {
              runScript(s, { self: a, other: b, scene, state });
            }
          }
        }
      }
      colliding.clear();
      now.forEach(k => colliding.add(k));
    },
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
