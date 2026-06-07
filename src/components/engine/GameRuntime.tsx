import { useEffect, useRef, useState } from "react";
import type { Entity, RuntimeInput, RuntimeState, Scene } from "@/lib/engine/core";
import { stepScene } from "@/lib/engine/core";
import { getImage } from "@/lib/engine/images";
import { currentFrameImage } from "@/lib/engine/animations";
import { createScriptRunner } from "@/lib/engine/scripts";

interface Props {
  scene: Scene;
  fpsCap: 30 | 60;
  showHUD: boolean;
  onExit: () => void;
}

export function GameRuntime({ scene, fpsCap, showHUD, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<RuntimeInput>({ left: false, right: false, jump: false });
  const [hud, setHud] = useState({ score: 0, fps: 0, win: false, dead: false });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const work: Scene = JSON.parse(JSON.stringify(scene));
    const state: RuntimeState = { score: 0, lives: 1, win: false, dead: false, cameraX: 0 };
    const scripts = createScriptRunner();

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

    const draw = () => {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      // bg
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0b1e3f");
      g.addColorStop(1, "#020617");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // parallax grid
      ctx.strokeStyle = "rgba(56,189,248,0.12)";
      ctx.lineWidth = 1;
      const off = -state.cameraX * 0.4;
      for (let x = (off % 40); x < W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // scale world to fit height
      const scale = H / work.height;
      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(-state.cameraX, 0);

      const tSec = performance.now() / 1000;
      for (const e of work.entities) {
        drawEntity(ctx, e, tSec);
      }
      ctx.restore();

      if (showHUD) {
        ctx.fillStyle = "rgba(2,6,23,0.6)";
        ctx.fillRect(12, 12, 140, 36);
        ctx.strokeStyle = "rgba(125,211,252,0.5)";
        ctx.strokeRect(12, 12, 140, 36);
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "600 14px Rajdhani, sans-serif";
        ctx.fillText(`SCORE ${state.score}`, 22, 35);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const elapsed = (now - last) / 1000;
      last = now;
      acc += elapsed;
      let steps = 0;
      while (acc >= targetDt && steps < 5) {
        if (!state.win && !state.dead) {
          stepScene(work, inputRef.current, state, targetDt);
          scripts.step(work, state);
        }
        acc -= targetDt;
        steps++;
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
    };
  }, [scene, fpsCap, showHUD]);

  const press = (k: keyof RuntimeInput, v: boolean) => {
    inputRef.current[k] = v;
  };

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full block" />

      {/* HUD overlay */}
      <div className="pointer-events-none absolute top-3 right-3 flex gap-2">
        <div className="panel rounded-md px-2 py-1 text-[10px] font-mono text-primary-glow">
          {hud.fps} FPS
        </div>
        <button
          onClick={onExit}
          className="pointer-events-auto panel rounded-md px-3 py-1 text-xs font-display text-foreground glow-border"
        >
          STOP
        </button>
      </div>

      {/* Touch controls */}
      <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between select-none">
        <div className="flex gap-3">
          <TouchBtn label="◀" onDown={() => press("left", true)} onUp={() => press("left", false)} />
          <TouchBtn label="▶" onDown={() => press("right", true)} onUp={() => press("right", false)} />
        </div>
        <TouchBtn
          label="JUMP"
          big
          onDown={() => press("jump", true)}
          onUp={() => press("jump", false)}
        />
      </div>

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
            >
              BACK TO EDITOR
            </button>
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
  const animImg = currentFrameImage(e, time);
  if (animImg) {
    ctx.drawImage(animImg, e.x, e.y, e.w, e.h);
    ctx.restore();
    return;
  }
  if (e.texture) {
    const img = getImage(e.texture);
    if (img) {
      ctx.drawImage(img, e.x, e.y, e.w, e.h);
      ctx.restore();
      return;
    }
  }
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
