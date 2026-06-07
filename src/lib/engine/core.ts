// Asternal Engine core: ECS-lite + loop + physics + scenes + input
import type { AnimationClip } from "./animations";

export type EntityKind = "player" | "platform" | "enemy" | "coin" | "goal";

// --- Sprite asset (created in the in-engine pixel editor) ---
export interface SpriteLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;      // 0..1
  dataUrl: string;      // PNG of just this layer at native resolution
}
export interface SpriteFrame {
  id: string;
  layers: SpriteLayer[];
  composite: string;    // PNG, all visible layers flattened
}
export interface SpriteAsset {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  loop: boolean;
  frames: SpriteFrame[];
}

export interface Entity {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  color: string;
  // behavior flags
  solid: boolean;
  gravity: boolean;
  controllable: boolean;
  collectible: boolean;
  hazard: boolean;
  goal: boolean;
  texture?: string | null;
  animations?: AnimationClip[];
}

export interface Scene {
  id: string;
  name: string;
  bg: string;
  gravity: number;
  width: number;
  height: number;
  entities: Entity[];
}

export interface Project {
  name: string;
  scenes: Scene[];
  activeSceneId: string;
  assets?: { sprites: SpriteAsset[] };
  settings: {
    fpsCap: 30 | 60;
    showHUD: boolean;
  };
}

export const KIND_PRESETS: Record<EntityKind, Omit<Entity, "id" | "x" | "y">> = {
  player: { kind: "player", w: 40, h: 56, vx: 0, vy: 0, color: "#38bdf8", solid: true, gravity: true, controllable: true, collectible: false, hazard: false, goal: false, texture: null },
  platform: { kind: "platform", w: 160, h: 24, vx: 0, vy: 0, color: "#1e3a8a", solid: true, gravity: false, controllable: false, collectible: false, hazard: false, goal: false, texture: null },
  enemy: { kind: "enemy", w: 40, h: 40, vx: 60, vy: 0, color: "#f43f5e", solid: false, gravity: true, controllable: false, collectible: false, hazard: true, goal: false, texture: null },
  coin: { kind: "coin", w: 22, h: 22, vx: 0, vy: 0, color: "#fbbf24", solid: false, gravity: false, controllable: false, collectible: true, hazard: false, goal: false, texture: null },
  goal: { kind: "goal", w: 36, h: 64, vx: 0, vy: 0, color: "#7dd3fc", solid: false, gravity: false, controllable: false, collectible: false, hazard: false, goal: true, texture: null },
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export function newScene(name = "Scene 1"): Scene {
  return {
    id: uid(),
    name,
    bg: "#0b1e3f",
    gravity: 1400,
    width: 1200,
    height: 700,
    entities: [
      { ...KIND_PRESETS.platform, id: uid(), x: 40, y: 600, w: 1120, h: 40 },
      { ...KIND_PRESETS.platform, id: uid(), x: 240, y: 480, w: 200, h: 24 },
      { ...KIND_PRESETS.platform, id: uid(), x: 520, y: 380, w: 200, h: 24 },
      { ...KIND_PRESETS.coin, id: uid(), x: 320, y: 440 },
      { ...KIND_PRESETS.coin, id: uid(), x: 600, y: 340 },
      { ...KIND_PRESETS.enemy, id: uid(), x: 800, y: 540 },
      { ...KIND_PRESETS.goal, id: uid(), x: 1080, y: 536 },
      { ...KIND_PRESETS.player, id: uid(), x: 80, y: 540 },
    ],
  };
}

export function newProject(): Project {
  const s = newScene();
  return {
    name: "Untitled Game",
    scenes: [s],
    activeSceneId: s.id,
    assets: { sprites: [] },
    settings: { fpsCap: 60, showHUD: true },
  };
}

// --- Physics: AABB ---
export function intersects(a: Entity, b: Entity) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface RuntimeInput {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export interface RuntimeState {
  score: number;
  lives: number;
  win: boolean;
  dead: boolean;
  cameraX: number;
}

export function stepScene(scene: Scene, input: RuntimeInput, state: RuntimeState, dt: number) {
  const SPEED = 220;
  const JUMP = 520;

  for (const e of scene.entities) {
    if (e.controllable) {
      e.vx = (input.right ? 1 : 0) * SPEED - (input.left ? 1 : 0) * SPEED;
    }
    if (e.gravity) e.vy += scene.gravity * dt;
  }

  // Horizontal pass
  for (const e of scene.entities) {
    if (e.kind === "platform") continue;
    e.x += e.vx * dt;
    for (const o of scene.entities) {
      if (o === e || !o.solid) continue;
      if (intersects(e, o)) {
        if (e.vx > 0) e.x = o.x - e.w;
        else if (e.vx < 0) e.x = o.x + o.w;
        if (e.kind === "enemy") e.vx = -e.vx;
      }
    }
  }

  // Vertical pass
  const grounded = new Set<string>();
  for (const e of scene.entities) {
    if (e.kind === "platform") continue;
    e.y += e.vy * dt;
    for (const o of scene.entities) {
      if (o === e || !o.solid) continue;
      if (intersects(e, o)) {
        if (e.vy > 0) {
          e.y = o.y - e.h;
          e.vy = 0;
          grounded.add(e.id);
        } else if (e.vy < 0) {
          e.y = o.y + o.h;
          e.vy = 0;
        }
      }
    }
  }

  // Jump + interactions for player
  for (const e of scene.entities) {
    if (!e.controllable) continue;
    if (input.jump && grounded.has(e.id)) e.vy = -JUMP;
    // world bounds
    if (e.y > scene.height + 200) {
      state.dead = true;
    }
    // interact
    for (const o of scene.entities) {
      if (o === e) continue;
      if (intersects(e, o)) {
        if (o.collectible) {
          o.x = -9999;
          state.score += 10;
        } else if (o.hazard) {
          state.dead = true;
        } else if (o.goal) {
          state.win = true;
        }
      }
    }
    // camera follow
    state.cameraX = Math.max(0, Math.min(scene.width - 360, e.x - 160));
  }
}
