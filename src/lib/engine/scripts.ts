// Block-based scripting (events + actions) for Asternal Engine
import type { Entity, EntityKind, RuntimeInput, RuntimeState, Scene } from "./core";
import { intersects, KIND_PRESETS, uid as makeId } from "./core";
import { playSound, vibrate, type SoundName, SOUND_NAMES } from "./sfx";

export type EventType =
  | "onStart"
  | "onCreate"
  | "onUpdate"
  | "onCollide"
  | "onKeyDown"
  | "onScoreReach"
  | "onDestroyed"
  | "onDestroy"
  | "onTimer"
  | "onLeaveScreen"
  | "onLand"
  | "onWin"
  | "onLose";

export type BlockKind =
  // existing
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
  | "impulse"
  | "setVisible"
  | "restartScene"
  | "setBg"
  | "if"
  // 30 new
  | "setX"
  | "setY"
  | "moveX"
  | "moveY"
  | "flipVx"
  | "flipVy"
  | "bounceY"
  | "stop"
  | "setSpeed"
  | "setOpacity"
  | "setHazard"
  | "setSolid"
  | "setCollectible"
  | "setGoalFlag"
  | "addLives"
  | "setLives"
  | "setScore"
  | "resetScore"
  | "spawnEntity"
  | "cloneSelf"
  | "setSceneGravity"
  | "playRandomSound"
  | "wrapScreen"
  | "faceTarget"
  | "chase"
  | "setHitbox"
  | "clearHitbox"
  | "removeAllOf"
  | "comment"
  | "hurtPlayer"
  | "wait"
  | "setFacing"
  | "knockback"
  | "pushAway";

export interface Block {
  id: string;
  kind: BlockKind;
  value?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
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
  interval?: number;                      // onTimer (ms)
  blocks: Block[];
}

export const EVENT_LABELS: Record<EventType, string> = {
  onStart: "On Start",
  onCreate: "On Create",
  onUpdate: "On Update",
  onCollide: "On Collide",
  onKeyDown: "On Key Press",
  onScoreReach: "On Score Reach",
  onDestroyed: "On Destroyed",
  onDestroy: "On Destroy",
  onTimer: "On Timer",
  onLeaveScreen: "On Leave Screen",
  onLand: "On Land",
  onWin: "On Win",
  onLose: "On Lose",
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
  impulse: "Impulse (x,y)",
  setVisible: "Set visible",
  restartScene: "Restart scene",
  setBg: "Set background",
  if: "If condition",
  // new
  setX: "Set X",
  setY: "Set Y",
  moveX: "Move X by",
  moveY: "Move Y by",
  flipVx: "Flip velocity X",
  flipVy: "Flip velocity Y",
  bounceY: "Bounce Y (%)",
  stop: "Stop motion",
  setSpeed: "Set speed",
  setOpacity: "Set opacity %",
  setHazard: "Set hazard",
  setSolid: "Set solid",
  setCollectible: "Set collectible",
  setGoalFlag: "Set goal flag",
  addLives: "Add lives",
  setLives: "Set lives",
  setScore: "Set score",
  resetScore: "Reset score",
  spawnEntity: "Spawn entity",
  cloneSelf: "Clone self",
  setSceneGravity: "Set scene gravity",
  playRandomSound: "Random sound",
  wrapScreen: "Wrap screen",
  faceTarget: "Face target",
  chase: "Chase target",
  setHitbox: "Set hitbox",
  clearHitbox: "Clear hitbox",
  removeAllOf: "Remove all of kind",
  comment: "Comment",
  hurtPlayer: "Hurt player",
  wait: "Wait (ms)",
  setFacing: "Set facing (-1/1)",
  knockback: "Knockback (x,y)",
  pushAway: "Push away from player",
};

export const ALL_BLOCKS: BlockKind[] = [
  "jump", "impulse", "setVx", "setVy", "setSpeed", "stop", "flipVx", "flipVy", "bounceY",
  "setX", "setY", "moveX", "moveY", "teleport", "wrapScreen",
  "addScore", "setScore", "resetScore", "addLives", "setLives",
  "destroySelf", "destroyOther", "cloneSelf", "spawnEntity", "removeAllOf",
  "win", "lose", "restartScene", "hurtPlayer",
  "playSound", "playRandomSound", "vibrate", "shake",
  "setColor", "setBg", "setVisible", "setOpacity", "setSize",
  "setGravity", "setControllable", "setHazard", "setSolid", "setCollectible", "setGoalFlag",
  "setSceneGravity", "setHitbox", "clearHitbox",
  "faceTarget", "chase", "knockback", "setFacing", "pushAway",
  "log", "comment", "if", "wait",
];

export interface RuntimeHooks {
  shake: (intensity: number, duration: number) => void;
  restart: () => void;
}

interface ExecCtx {
  self: Entity;
  other?: Entity;
  scene: Scene;
  state: RuntimeState;
  hooks: RuntimeHooks;
}

function findFirstOfKind(scene: Scene, kind: EntityKind) {
  for (const e of scene.entities) if (e.kind === kind && e.x > -9000) return e;
  return null;
}

function execBlock(b: Block, ctx: ExecCtx) {
  switch (b.kind) {
    case "jump": ctx.self.vy = -(b.value ?? 520); break;
    case "setVx": ctx.self.vx = b.value ?? 0; break;
    case "setVy": ctx.self.vy = b.value ?? 0; break;
    case "impulse":
      ctx.self.vx += b.x ?? 0;
      ctx.self.vy += b.y ?? 0;
      break;
    case "addScore": ctx.state.score += b.value ?? 1; break;
    case "destroySelf": ctx.self.x = -99999; break;
    case "destroyOther": if (ctx.other) ctx.other.x = -99999; break;
    case "win": ctx.state.win = true; break;
    case "lose": ctx.state.dead = true; break;
    case "restartScene": ctx.hooks.restart(); break;
    case "teleport":
      ctx.self.x = b.x ?? ctx.self.x;
      ctx.self.y = b.y ?? ctx.self.y;
      break;
    case "log": console.log("[script]", b.text ?? "", ctx.self.kind); break;
    case "playSound": playSound((b.sound ?? "blip") as SoundName); break;
    case "vibrate": vibrate(Math.max(1, b.value ?? 50)); break;
    case "shake": ctx.hooks.shake(Math.max(1, b.value ?? 8), 0.3); break;
    case "setColor": if (b.color) ctx.self.color = b.color; break;
    case "setBg": if (b.color) ctx.scene.bg = b.color; break;
    case "setVisible": ctx.self.visible = b.bool ?? !(ctx.self.visible ?? true); break;
    case "setSize":
      if (b.x) ctx.self.w = Math.max(4, b.x);
      if (b.y) ctx.self.h = Math.max(4, b.y);
      break;
    case "setGravity": ctx.self.gravity = b.bool ?? !ctx.self.gravity; break;
    case "setControllable": ctx.self.controllable = b.bool ?? !ctx.self.controllable; break;

    // --- new ---
    case "setX": ctx.self.x = b.value ?? ctx.self.x; break;
    case "setY": ctx.self.y = b.value ?? ctx.self.y; break;
    case "moveX": ctx.self.x += b.value ?? 0; break;
    case "moveY": ctx.self.y += b.value ?? 0; break;
    case "flipVx": ctx.self.vx = -ctx.self.vx; break;
    case "flipVy": ctx.self.vy = -ctx.self.vy; break;
    case "bounceY": ctx.self.vy = -ctx.self.vy * ((b.value ?? 80) / 100); break;
    case "stop": ctx.self.vx = 0; ctx.self.vy = 0; break;
    case "setSpeed": {
      const s = b.value ?? 0;
      const dir = ctx.self.vx === 0 ? 1 : Math.sign(ctx.self.vx);
      ctx.self.vx = s * dir;
      break;
    }
    case "setOpacity": ctx.self.opacity = Math.max(0, Math.min(1, (b.value ?? 100) / 100)); break;
    case "setHazard": ctx.self.hazard = b.bool ?? !ctx.self.hazard; break;
    case "setSolid": ctx.self.solid = b.bool ?? !ctx.self.solid; break;
    case "setCollectible": ctx.self.collectible = b.bool ?? !ctx.self.collectible; break;
    case "setGoalFlag": ctx.self.goal = b.bool ?? !ctx.self.goal; break;
    case "addLives": ctx.state.lives += b.value ?? 1; break;
    case "setLives": ctx.state.lives = b.value ?? 1; break;
    case "setScore": ctx.state.score = b.value ?? 0; break;
    case "resetScore": ctx.state.score = 0; break;
    case "spawnEntity": {
      const k = (b.text as EntityKind) || "coin";
      const preset = KIND_PRESETS[k];
      if (preset) {
        ctx.scene.entities.push({
          ...preset,
          id: makeId(),
          x: b.x ?? ctx.self.x,
          y: b.y ?? ctx.self.y,
        });
      }
      break;
    }
    case "cloneSelf": {
      ctx.scene.entities.push({
        ...ctx.self,
        id: makeId(),
        x: ctx.self.x + (b.x ?? 20),
        y: ctx.self.y + (b.y ?? 0),
        scripts: [], // no script inheritance to avoid runaway
      });
      break;
    }
    case "setSceneGravity": ctx.scene.gravity = Math.max(0, b.value ?? 1400); break;
    case "playRandomSound": playSound(SOUND_NAMES[Math.floor(Math.random() * SOUND_NAMES.length)]); break;
    case "wrapScreen": {
      const e = ctx.self;
      if (e.x + e.w < 0) e.x = ctx.scene.width;
      else if (e.x > ctx.scene.width) e.x = -e.w;
      if (e.y + e.h < 0) e.y = ctx.scene.height;
      else if (e.y > ctx.scene.height) e.y = -e.h;
      break;
    }
    case "faceTarget": {
      const t = findFirstOfKind(ctx.scene, (b.text as EntityKind) || "player");
      if (t) ctx.self.vx = Math.sign(t.x - ctx.self.x) * Math.abs(ctx.self.vx || 60);
      break;
    }
    case "chase": {
      const t = findFirstOfKind(ctx.scene, (b.text as EntityKind) || "player");
      if (t) {
        const sp = b.value ?? 80;
        ctx.self.vx = Math.sign(t.x - ctx.self.x) * sp;
      }
      break;
    }
    case "setHitbox":
      ctx.self.hitbox = { x: b.x ?? 0, y: b.y ?? 0, w: Math.max(1, b.w ?? ctx.self.w), h: Math.max(1, b.h ?? ctx.self.h) };
      break;
    case "clearHitbox": ctx.self.hitbox = null; break;
    case "removeAllOf": {
      const k = (b.text as EntityKind) || "coin";
      for (const e of ctx.scene.entities) if (e.kind === k) e.x = -99999;
      break;
    }
    case "comment": break;
    case "hurtPlayer": ctx.state.dead = true; break;
    case "wait": break; // no-op marker; sub-frame waits handled via onTimer
    case "setFacing": {
      const f = (b.value ?? 1) >= 0 ? 1 : -1;
      ctx.self.facing = f;
      ctx.self.flipX = f === -1;
      break;
    }
    case "knockback": {
      const target = ctx.other ?? ctx.self;
      target.vx = b.x ?? 240;
      target.vy = b.y ?? -320;
      break;
    }
    case "pushAway": {
      const p = findFirstOfKind(ctx.scene, "player");
      if (p) {
        const force = b.value ?? 280;
        const dir = ctx.self.x < p.x ? -1 : 1;
        ctx.self.vx = dir * force;
        ctx.self.vy = -180;
      }
      break;
    }

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
  step: (scene: Scene, state: RuntimeState, input: RuntimeInput, hooks: RuntimeHooks, dt: number) => void;
}

export function createScriptRunner(): ScriptRunner {
  const started = new Set<string>();
  const destroyed = new Set<string>();
  const left = new Set<string>();
  const colliding = new Set<string>();
  const prevVy = new Map<string, number>();
  const timerAcc = new Map<string, number>();
  let prevInput: RuntimeInput = { left: false, right: false, jump: false };
  let prevScore = 0;
  let prevWin = false;
  let prevDead = false;

  return {
    step(scene, state, input, hooks, dt) {
      const live = scene.entities;
      const keyEdges = {
        left: input.left && !prevInput.left,
        right: input.right && !prevInput.right,
        jump: input.jump && !prevInput.jump,
      };

      const winEdge = state.win && !prevWin;
      const loseEdge = state.dead && !prevDead;

      for (let i = 0; i < live.length; i++) {
        const e = live[i];
        const scripts = e.scripts ?? [];
        if (!scripts.length) { prevVy.set(e.id, e.vy); continue; }

        if (e.x < -9000 && !destroyed.has(e.id)) {
          destroyed.add(e.id);
          for (const s of scripts) if (s.event === "onDestroyed" || s.event === "onDestroy")
            runScript(s, { self: e, scene, state, hooks });
        }
        if (e.x < -9000) continue;

        const outside = e.x + e.w < 0 || e.x > scene.width || e.y > scene.height + 200 || e.y + e.h < -200;
        if (outside && !left.has(e.id)) {
          left.add(e.id);
          for (const s of scripts) if (s.event === "onLeaveScreen")
            runScript(s, { self: e, scene, state, hooks });
        } else if (!outside) {
          left.delete(e.id);
        }

        if (!started.has(e.id)) {
          for (const s of scripts) if (s.event === "onStart" || s.event === "onCreate")
            runScript(s, { self: e, scene, state, hooks });
          started.add(e.id);
        }

        const pv = prevVy.get(e.id) ?? 0;
        const landed = pv > 80 && e.vy === 0;

        for (const s of scripts) {
          if (s.event === "onUpdate") {
            runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onKeyDown" && s.key && keyEdges[s.key]) {
            runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onScoreReach") {
            const t = s.threshold ?? 0;
            if (prevScore < t && state.score >= t)
              runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onTimer") {
            const iv = Math.max(0.05, (s.interval ?? 1000) / 1000);
            const acc = (timerAcc.get(s.id) ?? 0) + dt;
            if (acc >= iv) { timerAcc.set(s.id, 0); runScript(s, { self: e, scene, state, hooks }); }
            else timerAcc.set(s.id, acc);
          } else if (s.event === "onLand" && landed) {
            runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onWin" && winEdge) {
            runScript(s, { self: e, scene, state, hooks });
          } else if (s.event === "onLose" && loseEdge) {
            runScript(s, { self: e, scene, state, hooks });
          }
        }

        prevVy.set(e.id, e.vy);
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
      prevWin = state.win;
      prevDead = state.dead;
    },
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
