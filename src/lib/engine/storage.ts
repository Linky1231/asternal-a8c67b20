import type { Project } from "./core";
import { DEFAULT_SETTINGS, newProject } from "./core";

const KEY = "asternal:project";

export function loadProject(): Project {
  if (typeof window === "undefined") return newProject();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newProject();
    const p = JSON.parse(raw) as Project;
    if (!p.scenes?.length) return newProject();
    if (!p.assets) p.assets = { sprites: [] };
    if (!p.assets.sprites) p.assets.sprites = [];
    p.settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
    if (!p.settings.perfOptimized) p.settings = { ...p.settings, fpsCap: 60, perfOptimized: true };
    return p;
  } catch {
    return newProject();
  }
}

export function saveProject(p: Project) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore quota */
  }
}
