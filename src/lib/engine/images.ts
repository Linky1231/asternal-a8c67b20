// Shared image cache. Key = data URL (or any src string).
const cache = new Map<string, HTMLImageElement>();

export function getImage(src: string): HTMLImageElement | null {
  if (!src) return null;
  let img = cache.get(src);
  if (img) return img.complete && img.naturalWidth > 0 ? img : null;
  img = new Image();
  img.src = src;
  cache.set(src, img);
  return null;
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const existing = cache.get(src);
    if (existing && existing.complete && existing.naturalWidth > 0) return resolve(existing);
    const img = existing ?? new Image();
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
