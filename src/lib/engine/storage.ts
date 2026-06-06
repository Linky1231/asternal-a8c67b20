import type { Project } from "./core";
import { newProject } from "./core";

const KEY = "asternal:project";

export function loadProject(): Project {
  if (typeof window === "undefined") return newProject();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newProject();
    const p = JSON.parse(raw) as Project;
    if (!p.scenes?.length) return newProject();
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
