// Block-based scripting (events + actions) for Asternal Engine
import type { Entity, EntityKind, RuntimeInput, RuntimeState, Scene } from "./core";
import { intersects } from "./core";
import { playSound, vibrate, type SoundName } from "./sfx";

export type EventType =
  | "onStart"
  | "onUpdate"
  | "onCollide"
  | "onKeyDown"
  | "onScoreReach"
  | "onDestroyed";

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
  | "playSound"
  | "vibrate"
  | "shake"
  | "setColor"
  | "setSize"
  | "setGravity"
  | "setControllable"
  | "if";

export interface Block {
  id: string;
  kind: BlockKind;
  value?: number;
  x?: number;
  y?: number;
  text?: string;
  sound?: SoundName;
  color?: string;
  bool?: boolean;
  cond?: "scoreGte" | "scoreLte";
  thenBlocks?: Block[];
}

export interface Script {
  id: string;
  event: EventType;
  withKind?: EntityKind | "any";          // onCollide
  key?: "left" | "right" | "jump";        // onKeyDown
  threshold?: number;                     // onScoreReach
  blocks: Block[];
}

export const EVENT_LABELS: Record<EventType, string> = {
  onStart: "On Start",
  onUpdate: "On Update",
  onCollide: "On Collide",
  onKeyDown: "On Key Press",
  onScoreReach: "On Score Reach",
  onDestroyed: "On Destroyed",
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
  playSound: "Play sound",
  vibrate: "Vibrate (ms)",
  shake: "Screen shake",
  setColor: "Set color",
  setSize: "Set size",
  setGravity: "Enable gravity",
  setControllable: "Player control",
  if: "If condition",
};

export const ALL_BLOCKS: BlockKind[] = [
  "jump", "setVx", "setVy",
  "addScore", "destroySelf", "destroyOther",
  "win", "lose", "teleport",
  "playSound", "vibrate", "shake",
  "setColor", "setSize", "setGravity", "setControllable",
  "log", "if",
];

export interface RuntimeHooks {
  shake: (intensity: number, duration: number) => void;
}

interface ExecCtx {
  self: Entity;
  other?: Entity;
  scene: Scene;
  state: RuntimeState;
  hooks: RuntimeHooks;
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
    case "playSound": playSound((b.sound ?? "blip") as SoundName); break;
    case "vibrate": vibrate(Math.max(1, b.value ?? 50)); break;
    case "shake": ctx.hooks.shake(Math.max(1, b.value ?? 8), 0.3); break;
    case "setColor": if (b.color) ctx.self.color = b.color; break;
    case "setSize":
      if (b.x) ctx.self.w = Math.max(4, b.x);
      if (b.y) ctx.self.h = Math.max(4, b.y);
      break;
    case "setGravity": ctx.self.gravity = b.bool ?? !ctx.self.gravity; break;
    case "setControllable": ctx.self.controllable = b.bool ?? !ctx.self.controllable; break;
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
  step: (scene: Scene, state: RuntimeState, input: RuntimeInput, hooks: RuntimeHooks) => void;
}

/** Tracks per-entity onStart firing, onCollide edges, key edges, score thresholds, destruction edges. */
export function createScriptRunner(): ScriptRunner {
  const started = new Set<string>();
  const destroyed = new Set<string>();
  const colliding = new Set<string>();
  let prevInput: RuntimeInput = { left: false, right: false, jump: false };
  let prevScore = 0;

  return {
    step(scene, state, input, hooks) {
      const live = scene.entities;
      const keyEdges = {
        left: input.left && !prevInput.left,
        right: input.right && !prevInput.right,
        jump: input.jump && !prevInput.jump,
      };

      // onStart + onUpdate + onKeyDown + onScoreReach + onDestroyed
      for (const e of live) {
        const scripts = e.scripts ?? [];
        if (!scripts.length) continue;

        // onDestroyed (edge: moved off-world)
        if (e.x < -9000 && !destroyed.has(e.id)) {
          destroyed.add(e.id);
          for (const s of scripts) if (s.event === "onDestroyed")
            runScript(s, { self: e, scene, state, hooks });
        }
        if (e.x < -9000) continue;

        if (!started.has(e.id)) {
          for (const s of scripts) if (s.event === "onStart")
            runScript(s, { self: e, scene, state, hooks });
          started.add(e.id);
        }

        for (const s of scripts) {
          if (s.event === "onUpdate") {
            runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onKeyDown" && s.key && keyEdges[s.key]) {
            runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onScoreReach") {
            const t = s.threshold ?? 0;
            if (prevScore < t && state.score >= t)
              runScript(s, { self: e, scene, state, hooks });
          }
        }
      }

      // onCollide (edge-triggered)
      const now = new Set<string>();
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        if (a.x < -9000) continue;
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
              runScript(s, { self: a, other: b, scene, state, hooks });
            }
          }
        }
      }
      colliding.clear();
      now.forEach(k => colliding.add(k));

      prevInput = { ...input };
      prevScore = state.score;
    },
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
