// Shared image cache. Key = data URL (or any src string).
const cache = new Map<string, HTMLImageElement>();

export type RenderableImage = HTMLImageElement | ImageBitmap;

export function getImage(src: string): HTMLImageElement | null {
  if (!src) return null;
  let img = cache.get(src);
  if (img) return img.complete && img.naturalWidth > 0 ? img : null;
  img = new Image();
  img.decoding = "async";
  // Preserve PNG transparency (Safari can render bitmaps with black bg otherwise)
  img.crossOrigin = "anonymous";
  img.src = src;
  cache.set(src, img);
  return null;
}

// Always return HTMLImageElement: createImageBitmap on iOS/Safari can
// premultiply alpha incorrectly and turn transparent PNGs into black squares.
export function getRenderableImage(src: string): RenderableImage | null {
  return getImage(src);
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
