import { createFileRoute } from "@tanstack/react-router";
import { AsternalEditor } from "@/components/engine/AsternalEditor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Asternal Engine — Mobile Game Maker" },
      { name: "description", content: "Build 2D mobile games on your phone. Drag, drop, tap PLAY. Asternal Engine — a cyber-glow 2D engine in your pocket." },
      { property: "og:title", content: "Asternal Engine" },
      { property: "og:description", content: "Build 2D mobile games on your phone." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <AsternalEditor />;
}
