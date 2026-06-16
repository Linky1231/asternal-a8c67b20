// Shared image cache. Key = data URL (or any src string).
const cache = new Map<string, HTMLImageElement>();

const bitmapCache = new Map<string, ImageBitmap | HTMLImageElement>();
const pendingBitmap = new Set<string>();

export function getImage(src: string): HTMLImageElement | null {
  if (!src) return null;
  let img = cache.get(src);
  if (img) return img.complete && img.naturalWidth > 0 ? img : null;
  img = new Image();
  img.decoding = "async";
  img.src = src;
  cache.set(src, img);
  return null;
}

export function getRenderableImage(src: string): CanvasImageSource | null {
  if (!src) return null;
  const bitmap = bitmapCache.get(src);
  if (bitmap) return bitmap;
  const img = getImage(src);
  if (!img) return null;
  if (typeof createImageBitmap !== "function") return img;
  if (!pendingBitmap.has(src)) {
    pendingBitmap.add(src);
    createImageBitmap(img)
      .then((bmp) => bitmapCache.set(src, bmp))
      .catch(() => bitmapCache.set(src, img))
      .finally(() => pendingBitmap.delete(src));
  }
  return img;
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const existing = cache.get(src);
    if (existing && existing.complete && existing.naturalWidth > 0) return resolve(existing);
    const img = existing ?? new Image();
    img.decoding = "async";
    if (!existing) cache.set(src, img);
    img.onload = () => resolve(img);
    img.onerror = reject;
    if (!img.src) img.src = src;
    if (img.complete && img.naturalWidth > 0) resolve(img);
  });
}

export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
