import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchFeed, getMyProfile, isMod, type PostWithMeta, type Profile } from "@/lib/social/api";
import { PostComposer } from "@/components/social/PostComposer";
import { PostCard } from "@/components/social/PostCard";
import { NotificationBell } from "@/components/social/NotificationBell";

export const Route = createFileRoute("/feed")({
  head: () => ({ meta: [{ title: "Feed · Asternal" }] }),
  component: FeedPage,
});

function FeedPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Profile | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [mod, setMod] = useState(false);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [category, setCategory] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchFeed({ search: search || undefined, tag: tag || undefined, category: category || undefined });
      setPosts(data);
    } finally { setLoading(false); }
  }, [search, tag, category]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      setMyId(session.user.id);
      setMe(await getMyProfile());
      setMod(await isMod());
      await reload();
    })();
  }, [navigate, reload]);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen w-screen flex flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 panel border-b">
        <Link to="/" className="w-9 h-9 rounded-md bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_0_16px_oklch(0.68_0.21_250/0.5)]">
          <span className="font-display text-sm text-primary-foreground">A</span>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="font-display text-sm text-primary-glow glow-text leading-none">FEED</div>
          <div className="text-[10px] font-mono text-muted-foreground -mt-0.5 truncate">@{me?.username ?? "..."}</div>
        </div>
        <button onClick={() => setShowFilters(s => !s)} className="w-9 h-9 rounded-md border border-border">🔍</button>
        <NotificationBell />
        <button onClick={logout} title="Cerrar sesión" className="w-9 h-9 rounded-md border border-border text-muted-foreground">⎋</button>
      </header>

      {showFilters && (
        <div className="p-2 panel border-b grid grid-cols-3 gap-1.5">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="buscar…"
            className="bg-input/40 rounded px-2 py-1.5 text-xs" />
          <input value={tag} onChange={e => setTag(e.target.value)} placeholder="etiqueta"
            className="bg-input/40 rounded px-2 py-1.5 text-xs" />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="categoría"
            className="bg-input/40 rounded px-2 py-1.5 text-xs" />
          <button onClick={reload} className="col-span-3 py-1.5 rounded bg-primary/20 text-primary-glow text-[10px] font-display tracking-widest">APLICAR</button>
        </div>
      )}

      <main className="flex-1 p-3 space-y-3 max-w-2xl mx-auto w-full pb-[env(safe-area-inset-bottom)]">
        <PostComposer onCreated={reload} />
        {loading ? (
          <div className="text-center text-xs text-muted-foreground py-10">Cargando…</div>
        ) : posts.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-10">No hay publicaciones aún.</div>
        ) : posts.map(p => (
          <PostCard key={p.id} post={p} myId={myId} isMod={mod} onChange={reload} />
        ))}
      </main>
    </div>
  );
}
