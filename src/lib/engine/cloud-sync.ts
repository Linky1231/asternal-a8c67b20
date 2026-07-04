import { supabase } from "@/integrations/supabase/client";
import { cloudSaveProject, cloudListProjects, type CloudProject } from "@/lib/social/api";
import { saveProjectById, setProjectCloudId, getProjectCloudId, createProject } from "./storage";
import type { Project } from "./core";

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced push of a locally-saved project to the cloud (fire & forget). */
export function schedulePushToCloud(localId: string, project: Project) {
  if (typeof window === "undefined") return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const cloudId = getProjectCloudId(localId);
      const saved = await cloudSaveProject({ id: cloudId, name: project.name || "Untitled Game", data: project });
      if (!cloudId) setProjectCloudId(localId, saved.id);
    } catch { /* silent */ }
  }, 1500);
}

/** Import all cloud projects that are not present locally. Returns newly created local ids. */
export async function importCloudMissing(): Promise<{ imported: number; total: number }> {
  const list = await cloudListProjects();
  let imported = 0;
  for (const c of list) {
    const already = existsLocalWithCloud(c.id);
    if (already) continue;
    const localId = createProject(c.name);
    saveProjectById(localId, c.data as Project);
    setProjectCloudId(localId, c.id);
    imported++;
  }
  return { imported, total: list.length };
}

function existsLocalWithCloud(cloudId: string): boolean {
  try {
    const raw = localStorage.getItem("asternal:projects:index");
    if (!raw) return false;
    const arr = JSON.parse(raw) as Array<{ cloudId?: string }>;
    return arr.some(x => x.cloudId === cloudId);
  } catch { return false; }
}

export async function fetchCloudProjects(): Promise<CloudProject[]> {
  return cloudListProjects();
}
