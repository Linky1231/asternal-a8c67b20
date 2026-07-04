import type { Project } from "./core";
import { DEFAULT_SETTINGS, newProject, uid } from "./core";

const LEGACY_KEY = "asternal:project";
const INDEX_KEY = "asternal:projects:index";
const CURRENT_KEY = "asternal:projects:current";
const ITEM_PREFIX = "asternal:projects:item:";
const FPS_60_MIGRATION_KEY = "asternal:fps60-migration:v2";

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  cloudId?: string;
}

export function setProjectCloudId(id: string, cloudId: string) {
  if (typeof window === "undefined") return;
  const idx = readIndex();
  const i = idx.findIndex(m => m.id === id);
  if (i >= 0) {
    idx[i] = { ...idx[i], cloudId };
    writeIndex(idx);
  }
}

export function getProjectCloudId(id: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return readIndex().find(m => m.id === id)?.cloudId;
}


function readIndex(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x.id === "string");
  } catch { return []; }
}

function writeIndex(items: ProjectMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(items));
}

function normalize(p: Project): Project {
  if (!p.scenes?.length) return newProject();
  if (!p.assets) p.assets = { sprites: [] };
  if (!p.assets.sprites) p.assets.sprites = [];
  p.settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
  if (!p.settings.perfOptimized) p.settings = { ...p.settings, fpsCap: 60, perfOptimized: true };
  if (!p.settings.fpsDefault60Applied) p.settings = { ...p.settings, fpsCap: 60, fpsDefault60Applied: true };
  return p;
}

function migrateLegacy() {
  if (readIndex().length > 0) return;
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  try {
    const p = normalize(JSON.parse(raw));
    const id = uid();
    localStorage.setItem(ITEM_PREFIX + id, JSON.stringify(p));
    writeIndex([{ id, name: p.name || "Untitled Game", updatedAt: Date.now() }]);
    localStorage.setItem(CURRENT_KEY, id);
  } catch { /* ignore */ }
}

function ensureAtLeastOne(): string {
  migrateLegacy();
  let idx = readIndex();
  if (idx.length === 0) {
    const id = uid();
    const p = newProject();
    localStorage.setItem(ITEM_PREFIX + id, JSON.stringify(p));
    idx = [{ id, name: p.name, updatedAt: Date.now() }];
    writeIndex(idx);
    localStorage.setItem(CURRENT_KEY, id);
  }
  let cur = localStorage.getItem(CURRENT_KEY);
  if (!cur || !idx.some(m => m.id === cur)) {
    cur = idx[0].id;
    localStorage.setItem(CURRENT_KEY, cur);
  }
  return cur;
}

export function listProjects(): ProjectMeta[] {
  if (typeof window === "undefined") return [];
  ensureAtLeastOne();
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getCurrentProjectId(): string {
  if (typeof window === "undefined") return "";
  return ensureAtLeastOne();
}

export function setCurrentProjectId(id: string) {
  if (typeof window === "undefined") return;
  if (readIndex().some(m => m.id === id)) {
    localStorage.setItem(CURRENT_KEY, id);
  }
}

export function loadProjectById(id: string): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ITEM_PREFIX + id);
    if (!raw) return null;
    const p = normalize(JSON.parse(raw));
    if (!localStorage.getItem(FPS_60_MIGRATION_KEY)) {
      p.settings = { ...p.settings, fpsCap: 60 };
      localStorage.setItem(FPS_60_MIGRATION_KEY, "1");
    }
    return p;
  } catch { return null; }
}

export function loadProject(): Project {
  if (typeof window === "undefined") return newProject();
  const id = ensureAtLeastOne();
  return loadProjectById(id) ?? newProject();
}

export function saveProject(p: Project) {
  if (typeof window === "undefined") return;
  const id = ensureAtLeastOne();
  saveProjectById(id, p);
}

export function saveProjectById(id: string, p: Project) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ITEM_PREFIX + id, JSON.stringify(p));
    const idx = readIndex();
    const i = idx.findIndex(m => m.id === id);
    const meta: ProjectMeta = { id, name: p.name || "Untitled Game", updatedAt: Date.now() };
    if (i >= 0) idx[i] = meta; else idx.push(meta);
    writeIndex(idx);
  } catch { /* quota */ }
}

export function createProject(name?: string): string {
  const id = uid();
  const p = newProject();
  if (name && name.trim()) p.name = name.trim();
  saveProjectById(id, p);
  setCurrentProjectId(id);
  return id;
}

export function deleteProjectById(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ITEM_PREFIX + id);
  const idx = readIndex().filter(m => m.id !== id);
  writeIndex(idx);
  if (localStorage.getItem(CURRENT_KEY) === id) {
    localStorage.removeItem(CURRENT_KEY);
  }
  ensureAtLeastOne();
}

export function renameProject(id: string, name: string) {
  const p = loadProjectById(id);
  if (!p) return;
  p.name = name.trim() || p.name;
  saveProjectById(id, p);
}

export function duplicateProject(id: string): string | null {
  const p = loadProjectById(id);
  if (!p) return null;
  const copy: Project = JSON.parse(JSON.stringify(p));
  copy.name = (p.name || "Untitled") + " copy";
  const newId = uid();
  saveProjectById(newId, copy);
  return newId;
}
