import { createFileRoute } from "@tanstack/react-router";
import { AsternalEditor } from "@/components/engine/AsternalEditor";

export const Route = createFileRoute("/editor")({
  head: () => ({ meta: [{ title: "Editor · Asternal" }] }),
  component: () => <AsternalEditor />,
});
