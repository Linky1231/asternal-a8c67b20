import { createFileRoute } from "@tanstack/react-router";

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", js: "text/javascript", mjs: "text/javascript", css: "text/css",
  json: "application/json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon", mp3: "audio/mpeg", ogg: "audio/ogg",
  wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", mp4: "video/mp4", webm: "video/webm",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", wasm: "application/wasm",
  fnt: "text/plain", xml: "application/xml", txt: "text/plain", atlas: "text/plain",
  glb: "model/gltf-binary", gltf: "model/gltf+json", zip: "application/zip",
};

// Serves files of published GDevelop games (read-only, public by design: they are published games).
export const Route = createFileRoute("/api/public/gd/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = decodeURIComponent((params as { _splat?: string })._splat ?? "");
        if (!path || path.includes("..") || !/^[0-9a-f-]{36}\//i.test(path)) {
          return new Response("Not found", { status: 404 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("gd-games").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        const headers: Record<string, string> = {
          "Content-Type": MIME[ext] ?? "application/octet-stream",
          "Cache-Control": ext === "html" ? "no-cache" : "public, max-age=86400",
        };
        if (ext === "zip" || ext === "json") headers["Content-Disposition"] = `attachment; filename="${path.split("/").pop()}"`;
        return new Response(data, { headers });
      },
    },
  },
});
