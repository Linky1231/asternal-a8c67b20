import type { Entity } from "./core";
import { getRenderableImage } from "./images";
import { currentFrameRenderable } from "./animations";

/**
 * Shared entity renderer used by both the build editor and the play runtime
 * so that the editor preview always matches what the player will see.
 */
export function drawEntityVisual(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  time: number,
  opts: { animClip?: string; visualEffects?: boolean } = {},
) {
  const { animClip, visualEffects = true } = opts;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const flipX = (e.facing === -1) !== !!e.flipX;
  const flipY = !!(e as Entity & { flipY?: boolean }).flipY;
  ctx.translate(e.x + (flipX ? e.w : 0), e.y + (flipY ? e.h : 0));
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);

  const animImg = currentFrameRenderable(e, time, animClip);
  const drawFit = (img: HTMLImageElement | ImageBitmap) => {
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
    const img = getRenderableImage(e.texture);
    if (img) { drawFit(img); ctx.restore(); return; }
  }

  // No texture — render the same kind-aware fallback shape as the runtime.
  ctx.restore();
  ctx.save();
  if (visualEffects) {
    ctx.shadowColor = e.color;
    ctx.shadowBlur = e.kind === "coin" ? 10 : e.kind === "goal" ? 12 : 4;
  }
  ctx.fillStyle = e.color;
  if (e.kind === "coin") {
    ctx.beginPath();
    ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === "goal") {
    ctx.fillStyle = "rgba(120,120,120,0.25)";
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
    roundRectFill(ctx, e.x, e.y, e.w, e.h, r);
    ctx.fill();
    if (e.kind === "player") {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(e.x + 10, e.y + 16, 6, 6);
      ctx.fillRect(e.x + 24, e.y + 16, 6, 6);
    }
  }
  ctx.restore();
}

function roundRectFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
