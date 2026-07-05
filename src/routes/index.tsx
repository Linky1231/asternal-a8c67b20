import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Gamepad2, Newspaper, Search, LogOut, Wrench, Plus, ShieldCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchFeed, fetchGames, getMyProfile, isMod, isAdmin, type PostWithMeta, type Profile } from "@/lib/social/api";
import { PostComposer } from "@/components/social/PostComposer";
import { PostCard } from "@/components/social/PostCard";
import { GameCard } from "@/components/social/GameCard";
import { NotificationBell } from "@/components/social/NotificationBell";
import { ProfilePanel } from "@/components/social/ProfilePanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Asternal — Juegos y Comunidad" },
      { name: "description", content: "Descubre y juega creaciones hechas con Asternal. Crea las tuyas y publícalas al instante." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" },
    ],
  }),
  component: HomePage,
});

type Tab = "games" | "feed" | "profile";

function HomePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Profile | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [mod, setMod] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("games");
  const [games, setGames] = useState<PostWithMeta[]>([]);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const reload = useCallback(async (which: Tab) => {
    setLoading(true);
    try {
      if (which === "games") setGames(await fetchGames({ search: search || undefined }));
      else setPosts(await fetchFeed({ search: search || undefined }));
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      setMyId(session.user.id);
      setMe(await getMyProfile());
      setMod(await isMod());
      setAdmin(await isAdmin());
      await reload(tab);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (myId) reload(tab); }, [tab, reload, myId]);

  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };

  return (
    <div className="min-h-screen w-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 panel border-b backdrop-blur-xl">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-3 py-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center shadow-[0_6px_16px_-6px_oklch(0.68_0.21_250/0.6)]">
            <span className="font-display text-sm text-primary-foreground">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-sm text-primary-glow glow-text leading-none">ASTERNAL</div>
            <div className="text-[10px] font-mono text-muted-foreground truncate">@{me?.username ?? "…"}</div>
          </div>
          <button onClick={() => setShowSearch(s => !s)} title="Buscar"
            className="w-9 h-9 rounded-xl border border-border grid place-items-center active:scale-95 transition">
            <Search size={16} />
          </button>
          <NotificationBell />
          {admin && (
            <Link to="/admin" title="Admin"
              className="w-9 h-9 rounded-xl border border-accent/40 bg-accent/10 grid place-items-center active:scale-95 transition">
              <ShieldCheck size={16} className="text-primary-glow" />
            </Link>
          )}
          <Link to="/editor" title="Editor"
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/40 grid place-items-center active:scale-95 transition">
            <Wrench size={16} className="text-primary-glow" />
          </Link>
          <button onClick={logout} title="Cerrar sesión"
            className="w-9 h-9 rounded-xl border border-border grid place-items-center text-muted-foreground active:scale-95 transition">
            <LogOut size={15} />
          </button>

        </div>

        {showSearch && (
          <div className="max-w-2xl mx-auto px-3 pb-2 flex gap-2 animate-in fade-in slide-in-from-top-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && reload(tab)}
              placeholder={tab === "games" ? "Buscar juegos…" : "Buscar publicaciones…"}
              className="flex-1 bg-input/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            <button onClick={() => reload(tab)} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-display tracking-widest active:scale-95">IR</button>
          </div>
        )}

        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-3 pb-2">
          <div className="relative flex bg-muted/40 rounded-2xl p-1">
            <button
              onClick={() => setTab("games")}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-display tracking-widest transition-all ${tab === "games" ? "text-primary-foreground" : "text-muted-foreground"}`}
            >
              <Gamepad2 size={15} /> JUEGOS
            </button>
            <button
              onClick={() => setTab("feed")}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-display tracking-widest transition-all ${tab === "feed" ? "text-primary-foreground" : "text-muted-foreground"}`}
            >
              <Newspaper size={15} /> FEED
            </button>
            <div
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-r from-primary to-accent shadow-[0_4px_14px_-4px_oklch(0.68_0.21_250/0.55)] transition-transform duration-300"
              style={{ transform: `translateX(${tab === "games" ? "0%" : "calc(100% + 8px)"})` }}
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-3 py-3 space-y-3 pb-24">
        {tab === "games" ? (
          loading ? (
            <SkeletonList />
          ) : games.length === 0 ? (
            <EmptyGames />
          ) : (
            games.map(g => <GameCard key={g.id} post={g} myId={myId} isMod={mod} onChange={() => reload("games")} />)
          )
        ) : (
          <>
            <PostComposer onCreated={() => reload("feed")} />
            {loading ? <SkeletonList /> :
              posts.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-10">Sé el primero en publicar.</div>
              ) : posts.map(p => <PostCard key={p.id} post={p} myId={myId} isMod={mod} onChange={() => reload("feed")} />)}
          </>
        )}
      </main>

      {/* Floating CTA to editor */}
      <Link
        to="/editor"
        className="fixed bottom-5 right-5 z-30 h-14 pl-4 pr-5 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_10px_30px_-6px_oklch(0.68_0.21_250/0.7)] flex items-center gap-2 active:scale-95 transition font-display tracking-widest text-xs"
      >
        <Plus size={18} /> CREAR
      </Link>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="panel rounded-2xl border border-border/50 overflow-hidden animate-pulse">
          <div className="aspect-[16/10] bg-muted/40" />
          <div className="p-3 space-y-2">
            <div className="h-3 w-1/2 bg-muted/50 rounded" />
            <div className="h-2.5 w-1/3 bg-muted/40 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyGames() {
  return (
    <div className="panel rounded-2xl border border-dashed border-border p-8 text-center space-y-3">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 grid place-items-center">
        <Gamepad2 size={26} className="text-primary-glow" />
      </div>
      <div className="font-display text-sm">Aún no hay juegos publicados</div>
      <div className="text-xs text-muted-foreground max-w-xs mx-auto">
        Abre el editor, crea tu juego y pulsa <b className="text-primary-glow">PUBLICAR</b> para compartirlo aquí.
      </div>
      <Link to="/editor" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs font-display tracking-widest active:scale-95 transition">
        <Wrench size={14} /> ABRIR EDITOR
      </Link>
    </div>
  );
}
