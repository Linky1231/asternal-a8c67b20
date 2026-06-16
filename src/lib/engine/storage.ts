import type { Project } from "./core";
import { DEFAULT_SETTINGS, newProject } from "./core";

const KEY = "asternal:project";
const FPS_60_MIGRATION_KEY = "asternal:fps60-migration:v2";

export function loadProject(): Project {
  if (typeof window === "undefined") return newProject();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(FPS_60_MIGRATION_KEY, "1");
      return newProject();
    }
    const p = JSON.parse(raw) as Project;
    if (!p.scenes?.length) return newProject();
    if (!p.assets) p.assets = { sprites: [] };
    if (!p.assets.sprites) p.assets.sprites = [];
    p.settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
    if (!p.settings.perfOptimized) p.settings = { ...p.settings, fpsCap: 60, perfOptimized: true };
    if (!p.settings.fpsDefault60Applied) p.settings = { ...p.settings, fpsCap: 60, fpsDefault60Applied: true };
    if (!localStorage.getItem(FPS_60_MIGRATION_KEY)) {
      p.settings = { ...p.settings, fpsCap: 60 };
      localStorage.setItem(FPS_60_MIGRATION_KEY, "1");
      localStorage.setItem(KEY, JSON.stringify(p));
    }
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
