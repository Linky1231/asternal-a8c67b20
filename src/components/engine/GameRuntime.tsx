import { useEffect, useRef, useState } from "react";
import type { Entity, RuntimeInput, RuntimeState, Scene } from "@/lib/engine/core";
import { stepScene, newRuntimeState } from "@/lib/engine/core";
import { getImage } from "@/lib/engine/images";
import { currentFrameImage } from "@/lib/engine/animations";
import { createScriptRunner } from "@/lib/engine/scripts";
import { startMusic, stopMusic, setVolume, setMuted } from "@/lib/engine/sfx";

interface Props {
  scene: Scene;
  fpsCap: 30 | 60;
  showHUD: boolean;
  showFPS?: boolean;
  volume?: number;
  muted?: boolean;
  music?: boolean;
  touchControls?: boolean;
  autoPause?: boolean;
  showHitboxes?: boolean;
  onExit: () => void;
}

export function GameRuntime({
  scene, fpsCap, showHUD,
  showFPS = true, volume = 0.8, muted = false, music = false,
  touchControls = true, autoPause = true, showHitboxes = false,
  onExit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<RuntimeInput>({ left: false, right: false, jump: false });
  const [hud, setHud] = useState({ score: 0, fps: 0, win: false, dead: false });

  useEffect(() => { setVolume(volume); }, [volume]);
  useEffect(() => { setMuted(muted); }, [muted]);
  useEffect(() => {
    if (music && !muted) startMusic(); else stopMusic();
    return () => stopMusic();
  }, [music, muted]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const initial: Scene = JSON.parse(JSON.stringify(scene));
    let work: Scene = JSON.parse(JSON.stringify(initial));
    const state: RuntimeState = newRuntimeState(initial);
    let scripts = createScriptRunner();
    const shake = { intensity: 0, time: 0 };
    const hooks = {
      shake: (intensity: number, duration: number) => {
        shake.intensity = Math.max(shake.intensity, intensity);
        shake.time = Math.max(shake.time, duration);
      },
      restart: () => {
        work = JSON.parse(JSON.stringify(initial));
        Object.assign(state, newRuntimeState(initial));
        scripts = createScriptRunner();
      },
    };

    let paused = false;
    const onVis = () => { if (autoPause) paused = document.hidden; };
    document.addEventListener("visibilitychange", onVis);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const targetDt = 1 / fpsCap;
    let frames = 0;
    let fpsT = last;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; gravity: number };
    const particles: Part[] = [];
    const flushParticles = () => {
      const list = state.particles ?? [];
      for (const p of list) {
        const n = p.count ?? 8;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 60 + Math.random() * 140;
          particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.6, max: 0.6, color: p.color, size: 3, gravity: 400 });
        }
      }
      if (list.length) state.particles = [];
    };

    const tickEmitters = (dt: number) => {
      for (const e of work.entities) {
        const em = e.emitter;
        if (!em || !em.enabled) continue;
        em._acc = (em._acc ?? 0) + (em.rate || 0) * dt;
        while ((em._acc ?? 0) >= 1) {
          em._acc = (em._acc ?? 0) - 1;
          const dir = ((em.direction || 0) + (Math.random() - 0.5) * (em.spread || 0)) * Math.PI / 180;
          const sp = em.speed || 80;
          particles.push({
            x: e.x + e.w / 2,
            y: e.y + e.h / 2,
            vx: Math.cos(dir) * sp,
            vy: Math.sin(dir) * sp,
            life: em.lifetime || 1,
            max: em.lifetime || 1,
            color: em.color || "#7dd3fc",
            size: em.size || 3,
            gravity: em.gravity ?? 0,
          });
        }
      }
    };


    const draw = () => {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ctx.fillStyle = work.bg || "#0b1e3f";
      ctx.fillRect(0, 0, W, H);

      // Background image
      if (work.bgImage) {
        const img = getImage(work.bgImage);
        if (img && img.width) {
          const mode = work.bgImageMode || "cover";
          if (mode === "stretch") {
            ctx.drawImage(img, 0, 0, W, H);
          } else if (mode === "tile") {
            for (let x = 0; x < W; x += img.width) for (let y = 0; y < H; y += img.height) ctx.drawImage(img, x, y);
          } else {
            const sa = img.width / img.height;
            const da = W / H;
            const fit = mode === "cover" ? sa > da : sa < da;
            const dw = fit ? H * sa : W;
            const dh = fit ? H : W / sa;
            ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
          }
        }
      }


      // Parallax bands
      if (work.parallax?.length) {
        for (const pl of work.parallax) {
          ctx.fillStyle = pl.color;
          const off = (-state.cameraX * (pl.speed ?? 0.3)) % W;
          const y = (pl.y ?? H * 0.6);
          ctx.fillRect(off, y, W, pl.height ?? 60);
          ctx.fillRect(off + W, y, W, pl.height ?? 60);
          ctx.fillRect(off - W, y, W, pl.height ?? 60);
        }
      }

      ctx.strokeStyle = "rgba(56,189,248,0.10)";
      ctx.lineWidth = 1;
      const off = -state.cameraX * 0.4;
      for (let x = (off % 40); x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      const scale = H / work.height;
      const sx = shake.time > 0 ? (Math.random() - 0.5) * shake.intensity : 0;
      const sy = shake.time > 0 ? (Math.random() - 0.5) * shake.intensity : 0;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(scale, scale);
      ctx.translate(-state.cameraX, 0);

      const tSec = performance.now() / 1000;
      const sorted = [...work.entities].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
      for (const e of sorted) {
        if (e.visible === false) continue;
        const a = e.opacity ?? 1;
        // invuln blink
        if (e.controllable && state.invulnT > 0 && Math.floor(state.invulnT * 16) % 2 === 0) {
          ctx.globalAlpha = 0.4;
        } else if (a !== 1) ctx.globalAlpha = a;
        drawEntity(ctx, e, tSec);
        ctx.globalAlpha = 1;
      }

      // particles
      flushParticles();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;


      if (showHitboxes) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#f43f5e";
        ctx.setLineDash([4, 3]);
        for (const e of work.entities) {
          const hb = e.hitbox;
          if (hb) ctx.strokeRect(e.x + hb.x, e.y + hb.y, hb.w, hb.h);
          else ctx.strokeRect(e.x, e.y, e.w, e.h);
        }
        ctx.setLineDash([]);
      }
      ctx.restore();

      if (showHUD) {
        ctx.fillStyle = "rgba(2,6,23,0.6)";
        ctx.fillRect(12, 12, 260, 36);
        ctx.strokeStyle = "rgba(125,211,252,0.5)";
        ctx.strokeRect(12, 12, 260, 36);
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "600 14px Rajdhani, sans-serif";
        ctx.fillText(`SCORE ${state.score}`, 22, 35);
        ctx.fillText(`♥ ${state.lives}`, 130, 35);
        if (work.timeLimit && work.timeLimit > 0) {
          const left = Math.max(0, Math.ceil(work.timeLimit - state.time));
          ctx.fillStyle = left < 10 ? "#f43f5e" : "#7dd3fc";
          ctx.fillText(`⏱ ${left}`, 190, 35);
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const elapsed = (now - last) / 1000;
      last = now;
      if (!paused) {
        acc += elapsed;
        let steps = 0;
        while (acc >= targetDt && steps < 5) {
          if (!state.win && !state.dead) {
            stepScene(work, inputRef.current, state, targetDt);
            scripts.step(work, state, inputRef.current, hooks, targetDt);
          }
          if (shake.time > 0) shake.time = Math.max(0, shake.time - targetDt);
          tickEmitters(targetDt);
          // particle physics
          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * targetDt;
            p.y += p.vy * targetDt;
            p.vy += p.gravity * targetDt;
            p.life -= targetDt;
            if (p.life <= 0) particles.splice(i, 1);
          }
          acc -= targetDt;
          steps++;
        }
      }
      draw();
      frames++;
      if (now - fpsT > 500) {
        const fps = Math.round((frames * 1000) / (now - fpsT));
        setHud({ score: state.score, fps, win: state.win, dead: state.dead });
        frames = 0; fpsT = now;
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [scene, fpsCap, showHUD, autoPause, showHitboxes]);

  const press = (k: keyof RuntimeInput, v: boolean) => {
    inputRef.current[k] = v;
  };

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full block" />

      <div className="pointer-events-none absolute top-3 right-3 flex gap-2">
        {showFPS && (
          <div className="panel rounded-md px-2 py-1 text-[10px] font-mono text-primary-glow">
            {hud.fps} FPS
          </div>
        )}
        <button
          onClick={onExit}
          className="pointer-events-auto panel rounded-md px-3 py-1 text-xs font-display text-foreground glow-border"
        >STOP</button>
      </div>

      {touchControls && (
        <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between select-none">
          <div className="flex gap-3">
            <TouchBtn label="◀" onDown={() => press("left", true)} onUp={() => press("left", false)} />
            <TouchBtn label="▶" onDown={() => press("right", true)} onUp={() => press("right", false)} />
          </div>
          <TouchBtn label="JUMP" big onDown={() => press("jump", true)} onUp={() => press("jump", false)} />
        </div>
      )}

      {(hud.win || hud.dead) && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="panel rounded-2xl px-8 py-6 text-center glow-border">
            <div className="font-display text-2xl glow-text mb-2">
              {hud.win ? "LEVEL CLEAR" : "GAME OVER"}
            </div>
            <div className="text-sm text-muted-foreground mb-4">Score: {hud.score}</div>
            <button
              onClick={onExit}
              className="font-display text-sm px-5 py-2 rounded-md bg-primary text-primary-foreground glow-border"
            >BACK TO EDITOR</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TouchBtn({ label, onDown, onUp, big }: { label: string; onDown: () => void; onUp: () => void; big?: boolean }) {
  return (
    <button
      onTouchStart={(e) => { e.preventDefault(); onDown(); }}
      onTouchEnd={(e) => { e.preventDefault(); onUp(); }}
      onTouchCancel={(e) => { e.preventDefault(); onUp(); }}
      onMouseDown={(e) => { e.preventDefault(); onDown(); }}
      onMouseUp={(e) => { e.preventDefault(); onUp(); }}
      onMouseLeave={onUp}
      className={`${big ? "h-20 w-20 text-base" : "h-16 w-16 text-2xl"} rounded-full panel glow-border font-display text-primary-glow active:scale-95 active:bg-primary/30 transition-transform`}
    >
      {label}
    </button>
  );
}

function drawEntity(ctx: CanvasRenderingContext2D, e: Entity, time: number) {
  ctx.save();
  const flip = (e.facing === -1) !== !!e.flipX;
  if (flip) {
    ctx.translate(e.x + e.w, e.y);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(e.x, e.y);
  }
  const animImg = currentFrameImage(e, time);
  const drawFit = (img: HTMLImageElement) => {
    const fit = e.textureFit ?? "stretch";
    if (fit === "stretch") { ctx.drawImage(img, 0, 0, e.w, e.h); return; }
    const sa = img.width / img.height;
    const da = e.w / e.h;
    const cover = fit === "cover" ? sa > da : sa < da;
    const dw = cover ? e.h * sa : e.w;
    const dh = cover ? e.h : e.w / sa;
    ctx.drawImage(img, (e.w - dw) / 2, (e.h - dh) / 2, dw, dh);
  };
  if (animImg) { drawFit(animImg); ctx.restore(); return; }
  if (e.texture) {
    const img = getImage(e.texture);
    if (img) { drawFit(img); ctx.restore(); return; }
  }
  // fallback shape — restore translate to absolute coords for legacy drawing
  ctx.restore();
  ctx.save();
  ctx.shadowColor = e.color;
  ctx.shadowBlur = e.kind === "coin" ? 18 : e.kind === "goal" ? 24 : 8;
  ctx.fillStyle = e.color;
  if (e.kind === "coin") {
    ctx.beginPath();
    ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === "goal") {
    ctx.fillStyle = "rgba(125,211,252,0.3)";
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x + e.w / 2 - 2, e.y, 4, e.h);
    ctx.beginPath();
    ctx.moveTo(e.x + e.w / 2 + 2, e.y + 4);
    ctx.lineTo(e.x + e.w / 2 + 22, e.y + 12);
    ctx.lineTo(e.x + e.w / 2 + 2, e.y + 20);
    ctx.closePath();
    ctx.fill();
  } else {
    const r = e.kind === "platform" ? 4 : 6;
    roundRect(ctx, e.x, e.y, e.w, e.h, r);
    ctx.fill();
    if (e.kind === "player") {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#020617";
      ctx.fillRect(e.x + 10, e.y + 16, 6, 6);
      ctx.fillRect(e.x + 24, e.y + 16, 6, 6);
    }
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
