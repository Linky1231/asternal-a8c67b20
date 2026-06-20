// Asternal Engine core: ECS-lite + loop + physics + scenes + input
import type { AnimationClip } from "./animations";
import type { Script } from "./scripts";

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

export interface Hitbox {
  x: number; // offset relative to entity x
  y: number;
  w: number;
  h: number;
}

export type PowerupKind = "speed" | "djump" | "invuln";

export interface MovingSpec { axis: "x" | "y"; range: number; speed: number; _origin?: number; _dir?: number }
export interface CrumbleSpec { delay: number; respawn: number; _t?: number; _state?: "idle" | "break" | "gone"; _rt?: number }
export interface SpringSpec { force: number }
export interface PatrolSpec { range: number; ledgeSafe?: boolean; _origin?: number }

export interface ParticleEmitter {
  enabled: boolean;
  rate: number;       // particles/sec
  lifetime: number;   // seconds
  speed: number;      // px/sec
  direction: number;  // degrees, 0 = right, 90 = down
  spread: number;     // degrees (total cone)
  size: number;       // px
  gravity: number;    // px/s^2 applied to y
  color: string;
  _acc?: number;
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
  visible?: boolean;
  opacity?: number;
  texture?: string | null;
  animations?: AnimationClip[];
  scripts?: Script[];
  hitbox?: Hitbox | null;
  // advanced behaviors
  value?: number;
  moving?: MovingSpec | null;
  crumble?: CrumbleSpec | null;
  spring?: SpringSpec | null;
  patrol?: PatrolSpec | null;
  checkpoint?: boolean;
  slippery?: boolean;
  sticky?: boolean;
  locked?: boolean;          // layer lock — editor only, blocks select/move
  powerup?: PowerupKind | null;
  switchId?: string;
  doorId?: string;
  emitter?: ParticleEmitter | null;
  // depth / rendering
  z?: number;                // higher = drawn on top
  facing?: 1 | -1;           // last horizontal direction
  flipX?: boolean;           // force horizontal flip
  textureFit?: "stretch" | "contain" | "cover";
  // goal-specific
  nextSceneId?: string | null;
  endsGame?: boolean;
}

export interface ParallaxLayer { color: string; speed: number; height: number; y: number }

// ---- UI Overlay ----
export type UIElementKind = "button" | "label" | "image" | "panel" | "bar" | "joystick";
export type UIAnchor = "tl" | "tc" | "tr" | "cl" | "c" | "cr" | "bl" | "bc" | "br";
export type UIAction = "none" | "left" | "right" | "jump" | "restart" | "exit" | "event";
export type UIBind = "none" | "score" | "lives" | "time";

export interface UIElement {
  id: string;
  kind: UIElementKind;
  name: string;
  x: number;            // offset from anchor (px)
  y: number;
  w: number;
  h: number;
  anchor: UIAnchor;
  text?: string;
  fontSize?: number;
  color?: string;       // text / fg color
  bg?: string;          // background
  border?: string;
  radius?: number;
  opacity?: number;
  image?: string | null;
  action?: UIAction;
  eventName?: string;
  bind?: UIBind;
  max?: number;
  visible?: boolean;
}

export interface Scene {
  id: string;
  name: string;
  bg: string;
  bgImage?: string | null;       // dataURL or CDN URL
  bgImageMode?: "cover" | "contain" | "stretch" | "tile";
  gravity: number;
  width: number;
  height: number;
  entities: Entity[];
  timeLimit?: number;            // seconds; 0 = no limit
  parallax?: ParallaxLayer[];
  startLives?: number;
  ui?: UIElement[];
}

export interface ProjectSettings {
  fpsCap: 30 | 60;
  showHUD: boolean;
  showFPS?: boolean;
  gridSize?: number;
  snapToGrid?: boolean;
  showGrid?: boolean;
  volume?: number;       // 0..1
  muted?: boolean;
  music?: boolean;
  musicUrl?: string | null;       // dataURL or URL to custom audio file
  musicName?: string | null;      // display name of the uploaded track
  touchControls?: boolean;
  autoPause?: boolean;
  showHitboxes?: boolean;
  language?: "es" | "en" | "pt" | "fr" | "de";
  perfOptimized?: boolean;
  fpsDefault60Applied?: boolean;
}

export interface Project {
  name: string;
  scenes: Scene[];
  activeSceneId: string;
  assets?: { sprites: SpriteAsset[] };
  settings: ProjectSettings;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  fpsCap: 60,
  showHUD: true,
  showFPS: true,
  gridSize: 16,
  snapToGrid: false,
  showGrid: true,
  volume: 0.8,
  muted: false,
  music: false,
  touchControls: true,
  autoPause: true,
  showHitboxes: false,
};

export const KIND_PRESETS: Record<EntityKind, Omit<Entity, "id" | "x" | "y">> = {
  player: { kind: "player", w: 40, h: 56, vx: 0, vy: 0, color: "#38bdf8", solid: true, gravity: true, controllable: true, collectible: false, hazard: false, goal: false, visible: true, opacity: 1, texture: null },
  platform: { kind: "platform", w: 160, h: 24, vx: 0, vy: 0, color: "#1e3a8a", solid: true, gravity: false, controllable: false, collectible: false, hazard: false, goal: false, visible: true, opacity: 1, texture: null },
  enemy: { kind: "enemy", w: 40, h: 40, vx: 60, vy: 0, color: "#f43f5e", solid: false, gravity: true, controllable: false, collectible: false, hazard: true, goal: false, visible: true, opacity: 1, texture: null },
  coin: { kind: "coin", w: 22, h: 22, vx: 0, vy: 0, color: "#fbbf24", solid: false, gravity: false, controllable: false, collectible: true, hazard: false, goal: false, visible: true, opacity: 1, texture: null },
  goal: { kind: "goal", w: 36, h: 64, vx: 0, vy: 0, color: "#7dd3fc", solid: false, gravity: false, controllable: false, collectible: false, hazard: false, goal: true, visible: true, opacity: 1, texture: null },
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
    settings: { ...DEFAULT_SETTINGS },
  };
}


// --- Physics: AABB ---
export function aabb(e: Entity) {
  const hb = e.hitbox;
  if (hb) return { x: e.x + hb.x, y: e.y + hb.y, w: hb.w, h: hb.h };
  return { x: e.x, y: e.y, w: e.w, h: e.h };
}

export function intersects(a: Entity, b: Entity) {
  const A = aabb(a), B = aabb(b);
  return A.x < B.x + B.w && A.x + A.w > B.x && A.y < B.y + B.h && A.y + A.h > B.y;
}

export interface RuntimeInput {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export interface ParticleSpec { x: number; y: number; color: string; count?: number }

export interface RuntimeState {
  score: number;
  lives: number;
  win: boolean;
  dead: boolean;
  cameraX: number;
  time: number;
  jumpPrev: boolean;
  djumpAvailable: boolean;
  invulnT: number;
  speedT: number;
  switches: Record<string, boolean>;
  checkpoint?: { x: number; y: number } | null;
  particles?: ParticleSpec[];
}

export function newRuntimeState(scene?: Scene): RuntimeState {
  return {
    score: 0,
    lives: scene?.startLives ?? 1,
    win: false, dead: false, cameraX: 0,
    time: 0,
    jumpPrev: false,
    djumpAvailable: false,
    invulnT: 0, speedT: 0,
    switches: {},
    checkpoint: null,
    particles: [],
  };
}

function emit(state: RuntimeState, p: ParticleSpec) {
  if (!state.particles) state.particles = [];
  state.particles.push(p);
}

export function stepScene(scene: Scene, input: RuntimeInput, state: RuntimeState, dt: number) {
  const BASE_SPEED = 220;
  const JUMP = 520;
  state.time += dt;

  // time limit
  if (scene.timeLimit && scene.timeLimit > 0 && state.time > scene.timeLimit && !state.win) {
    state.dead = true;
  }

  // power-up timers
  if (state.invulnT > 0) state.invulnT = Math.max(0, state.invulnT - dt);
  if (state.speedT > 0) state.speedT = Math.max(0, state.speedT - dt);

  // Moving platforms
  for (const e of scene.entities) {
    const m = e.moving;
    if (!m) continue;
    if (m._origin === undefined) { m._origin = m.axis === "x" ? e.x : e.y; m._dir = 1; }
    const v = (m.speed || 60) * (m._dir ?? 1);
    if (m.axis === "x") {
      e.x += v * dt;
      if (e.x - (m._origin) > m.range) { e.x = m._origin + m.range; m._dir = -1; }
      else if (e.x - m._origin < -m.range) { e.x = m._origin - m.range; m._dir = 1; }
    } else {
      e.y += v * dt;
      if (e.y - m._origin > m.range) { e.y = m._origin + m.range; m._dir = -1; }
      else if (e.y - m._origin < -m.range) { e.y = m._origin - m.range; m._dir = 1; }
    }
  }

  // Crumble respawn
  for (const e of scene.entities) {
    const c = e.crumble;
    if (!c) continue;
    if (c._state === "gone") {
      c._rt = (c._rt ?? 0) + dt;
      if (c._rt >= (c.respawn || 3)) { c._state = "idle"; c._t = 0; c._rt = 0; e.solid = true; e.visible = true; e.opacity = 1; }
    } else if (c._state === "break") {
      c._t = (c._t ?? 0) + dt;
      e.opacity = Math.max(0.2, 1 - (c._t / (c.delay || 1)));
      if (c._t >= (c.delay || 1)) { c._state = "gone"; e.solid = false; e.visible = false; }
    }
  }

  // Player input
  const speedMul = state.speedT > 0 ? 1.6 : 1;
  for (const e of scene.entities) {
    if (e.controllable) {
      const target = (input.right ? 1 : 0) * BASE_SPEED * speedMul - (input.left ? 1 : 0) * BASE_SPEED * speedMul;
      e.vx = target;
    }
    if (e.gravity) e.vy += scene.gravity * dt;
    // facing direction follows velocity
    if ((e.controllable || e.kind === "enemy") && Math.abs(e.vx) > 1) {
      e.facing = e.vx > 0 ? 1 : -1;
    }
  }
  const solids = scene.entities.filter((e) => e.solid);
  const interactables = scene.entities.filter((e) => e.collectible || e.hazard || e.goal || e.switchId || e.checkpoint || e.crumble);

  // Predictive ledge detection for enemies (before moving)
  for (const e of scene.entities) {
    if (e.kind !== "enemy" || Math.abs(e.vx) <= 0.1) continue;
    const wasGrounded = (e as Entity & { _grounded?: boolean })._grounded;
    const ledgeSafe = e.patrol ? (e.patrol.ledgeSafe ?? true) : true;
    if (!wasGrounded || !ledgeSafe) continue;
    const nextX = e.x + e.vx * dt;
    const ahead = e.vx >= 0 ? nextX + e.w + 1 : nextX - 1;
    const probeY = e.y + e.h + 2;
    const probeW = 3, probeH = 6;
    let hasGround = false;
    for (const o of solids) {
      if (o === e || !o.solid) continue;
      if (
        ahead < o.x + o.w &&
        ahead + probeW > o.x &&
        probeY < o.y + o.h &&
        probeY + probeH > o.y
      ) { hasGround = true; break; }
    }
    if (!hasGround) e.vx = -e.vx;
  }

  // --- Unified collision resolution (MTV-based) ---
  // 1) Integrate position on both axes
  // 2) Iteratively resolve each overlap on its smallest-penetration axis.
  // This prevents corner-snagging, wall-sticking, and enemies inverting wrong.
  const grounded = new Set<string>();
  const groundedOn = new Map<string, Entity>();
  const EPS = 0.001;

  for (const e of scene.entities) {
    if (e.kind === "platform") continue;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  // Entities that physically collide with solids: anything with gravity OR
  // controllable (player). Pickups (coin/goal) and hazard enemies w/o gravity
  // are skipped so they remain in place for the interaction loop.
  const collidesWithSolids = (e: Entity) =>
    e.kind !== "platform" && (e.gravity || e.controllable || e.kind === "enemy");

  for (let iter = 0; iter < 4; iter++) {
    let anyHit = false;
    for (const e of scene.entities) {
      if (!collidesWithSolids(e)) continue;
      for (const o of solids) {
        if (o === e || !o.solid) continue;
        if (!intersects(e, o)) continue;
        anyHit = true;
        const A = aabb(e), B = aabb(o);
        const pushLeft  = A.x + A.w - B.x;
        const pushRight = B.x + B.w - A.x;
        const pushUp    = A.y + A.h - B.y;
        const pushDown  = B.y + B.h - A.y;
        const minX = Math.min(pushLeft, pushRight);
        const minY = Math.min(pushUp, pushDown);

        // Strict MTV: resolve on the axis with the smallest penetration.
        // Only bias to "land on top" if Y is already the smaller axis AND
        // we're moving downward — never override when X penetration is
        // clearly smaller (that's a side hit; player must NOT teleport up).
        const resolveY = minY <= minX;

        if (resolveY) {
          if (pushUp <= pushDown) {
            e.y -= pushUp + EPS;
            if (o.spring) {
              e.vy = -(o.spring.force || 720);
            } else {
              if (e.vy > 0) e.vy = 0;
              grounded.add(e.id);
              groundedOn.set(e.id, o);
            }
          } else {
            e.y += pushDown + EPS;
            if (e.vy < 0) e.vy = 0;
          }
        } else {
          if (pushLeft <= pushRight) {
            e.x -= pushLeft + EPS;
            if (e.kind === "enemy") e.vx = -Math.abs(e.vx || 60);
            else if (e.vx > 0) e.vx = 0;
          } else {
            e.x += pushRight + EPS;
            if (e.kind === "enemy") e.vx = Math.abs(e.vx || 60);
            else if (e.vx < 0) e.vx = 0;
          }
        }
      }
    }
    if (!anyHit) break;
  }

  // Persist grounded flag for next-frame predictive ledge checks
  for (const e of scene.entities) {
    if (e.kind === "platform") continue;
    (e as Entity & { _grounded?: boolean })._grounded = grounded.has(e.id);
  }



  // Enemy patrol (with ledge detection so enemies don't fall off platforms)
  for (const e of scene.entities) {
    if (e.kind !== "enemy" || !e.patrol) continue;
    if (e.patrol._origin === undefined) e.patrol._origin = e.x;
    if (e.x - e.patrol._origin > e.patrol.range) { e.x = e.patrol._origin + e.patrol.range; e.vx = -Math.abs(e.vx || 60); }
    else if (e.x - e.patrol._origin < -e.patrol.range) { e.x = e.patrol._origin - e.patrol.range; e.vx = Math.abs(e.vx || 60); }

    // Ledge detection — only when grounded; probe a small cell just past the
    // leading edge to see if any solid is underneath. If not, turn around.
    if (grounded.has(e.id) && (e.patrol.ledgeSafe ?? true)) {
      const ahead = e.vx >= 0 ? e.x + e.w + 2 : e.x - 2;
      const probeY = e.y + e.h + 2;
      const probeW = 4, probeH = 6;
      let hasGround = false;
      for (const o of solids) {
        if (o === e) continue;
        if (
          ahead < o.x + o.w &&
          ahead + probeW > o.x &&
          probeY < o.y + o.h &&
          probeY + probeH > o.y
        ) { hasGround = true; break; }
      }
      // also keep them inside scene bounds (treat scene floor as ground)
      if (!hasGround) {
        // reverse and step back to keep enemy safely on the platform
        e.vx = e.vx >= 0 ? -Math.abs(e.vx || 60) : Math.abs(e.vx || 60);
        e.x += e.vx >= 0 ? 2 : -2;
      }
    }
  }

  // Player jump + interactions
  for (const e of scene.entities) {
    if (!e.controllable) continue;
    const onGround = grounded.has(e.id);
    if (onGround) state.djumpAvailable = true;

    // slippery: keep momentum on slippery ground (ignore zero-input snap)
    const floor = groundedOn.get(e.id);
    if (floor?.slippery && !input.left && !input.right) {
      // don't actually do anything—input was zero already, vx set to 0 above
    }

    const jumpEdge = input.jump && !state.jumpPrev;
    if (input.jump && onGround) { e.vy = -JUMP; }
    else if (jumpEdge && !onGround && state.djumpAvailable) {
      // double jump (powerup)
      // available only if djump pickup was collected before? we set djumpAvailable on ground; track separately
      // We use a stricter flag: only when invulnT acts as marker? Use a dedicated state.canDjump
      // (Simplification: powerup always grants single mid-air jump)
      if ((state as RuntimeState & { canDjump?: boolean }).canDjump) {
        e.vy = -JUMP;
        (state as RuntimeState & { canDjump?: boolean }).canDjump = false;
      }
    }

    // world bounds
    if (e.y > scene.height + 200) {
      if (state.checkpoint) { e.x = state.checkpoint.x; e.y = state.checkpoint.y; e.vx = 0; e.vy = 0; }
      else state.dead = true;
    }

    // interact
    for (const o of interactables) {
      if (o === e) continue;
      if (o.x < -9000) continue;
      if (!intersects(e, o)) continue;
      // Crumble start when stood on
      if (o.crumble && grounded.has(e.id) && groundedOn.get(e.id) === o && o.crumble._state !== "break" && o.crumble._state !== "gone") {
        o.crumble._state = "break"; o.crumble._t = 0;
      }
      if (o.checkpoint) {
        state.checkpoint = { x: o.x, y: o.y - e.h };
        o.color = "#22c55e";
      }
      if (o.collectible) {
        emit(state, { x: o.x + o.w / 2, y: o.y + o.h / 2, color: o.color, count: 8 });
        const pu = o.powerup;
        if (pu === "speed") state.speedT = 6;
        else if (pu === "djump") (state as RuntimeState & { canDjump?: boolean }).canDjump = true;
        else if (pu === "invuln") state.invulnT = 5;
        else state.score += o.value ?? 10;
        o.x = -9999;
      } else if (o.hazard) {
        if (state.invulnT <= 0) {
          emit(state, { x: e.x + e.w / 2, y: e.y + e.h / 2, color: "#f43f5e", count: 14 });
          // Knockback player away from hazard so they don't get stuck inside
          const A = aabb(e), B = aabb(o);
          const dirX = (A.x + A.w / 2) < (B.x + B.w / 2) ? -1 : 1;
          e.vx = dirX * 260;
          e.vy = -320;
          if (state.lives > 1) { state.lives -= 1; state.invulnT = 1.2; if (state.checkpoint) { e.x = state.checkpoint.x; e.y = state.checkpoint.y; e.vx = 0; e.vy = 0; } }
          else state.dead = true;
        }

      } else if (o.goal) {
        state.win = true;
        if (typeof window !== "undefined") {
          try {
            window.dispatchEvent(new CustomEvent("asternal:goal", {
              detail: { nextSceneId: o.nextSceneId ?? null, endsGame: !!o.endsGame },
            }));
          } catch { /* ignore */ }
        }
      } else if (o.switchId) {
        if (!state.switches[o.switchId]) {
          state.switches[o.switchId] = true;
          o.color = "#22c55e";
          // open matching doors
          for (const d of scene.entities) {
            if (d.doorId === o.switchId) { d.solid = false; d.opacity = 0.25; }
          }
        }
      }
    }
    // camera follow
    state.cameraX = Math.max(0, Math.min(scene.width - 360, e.x - 160));
  }

  state.jumpPrev = input.jump;
}


// ---- UI helpers ----
export function resolveUIRect(el: UIElement, screenW: number, screenH: number) {
  let ax = 0, ay = 0;
  const a = el.anchor;
  if (a.includes("c") && a.length === 1) { ax = screenW / 2; ay = screenH / 2; }
  else {
    if (a[0] === "t") ay = 0;
    else if (a[0] === "c") ay = screenH / 2;
    else if (a[0] === "b") ay = screenH;
    if (a[1] === "l") ax = 0;
    else if (a[1] === "c") ax = screenW / 2;
    else if (a[1] === "r") ax = screenW;
  }
  return { x: ax + el.x, y: ay + el.y, w: el.w, h: el.h };
}

export function newUIElement(kind: UIElementKind): UIElement {
  const base = { id: uid(), kind, name: kind, x: 20, y: 20, w: 120, h: 48, anchor: "tl" as UIAnchor, opacity: 1, visible: true };
  switch (kind) {
    case "button":
      return { ...base, anchor: "br", x: -100, y: -100, w: 80, h: 80, radius: 999, bg: "#0ea5e9", color: "#fff", border: "#7dd3fc", text: "JUMP", fontSize: 14, action: "jump" };
    case "label":
      return { ...base, anchor: "tl", x: 16, y: 16, w: 160, h: 28, color: "#7dd3fc", text: "SCORE: 0", fontSize: 16, bind: "score" };
    case "image":
      return { ...base, anchor: "tr", x: -80, y: 16, w: 64, h: 64, image: null };
    case "panel":
      return { ...base, anchor: "tc", x: -120, y: 12, w: 240, h: 40, bg: "rgba(2,6,23,0.6)", border: "#7dd3fc", radius: 8 };
    case "bar":
      return { ...base, anchor: "tl", x: 16, y: 52, w: 180, h: 14, bg: "rgba(2,6,23,0.6)", color: "#22c55e", border: "#7dd3fc", radius: 6, bind: "lives", max: 3 };
    case "joystick":
      return { ...base, anchor: "bl", x: 24, y: -160, w: 140, h: 140, bg: "rgba(2,6,23,0.4)", border: "#7dd3fc", color: "#7dd3fc", radius: 999 };
  }
}
