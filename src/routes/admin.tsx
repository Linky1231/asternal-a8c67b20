import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, listManagedUsers, setUserModerator, type ManagedUser } from "@/lib/social/api";
import { ArrowLeft, Shield, ShieldCheck, Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · Asternal" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (search?: string) => {
    setLoading(true);
    try { setUsers(await listManagedUsers(search)); } finally { setLoading(false); }
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      const ok = await isAdmin();
      setAllowed(ok);
      if (ok) await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (u: ManagedUser) => {
    setBusy(u.id);
    try { await setUserModerator(u.id, !u.is_mod); await load(q); }
    finally { setBusy(null); }
  };

  if (allowed === null) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Cargando…</div>;
  if (!allowed) return (
    <div className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <Shield size={32} className="mx-auto text-destructive" />
        <div className="mt-3 font-display text-sm">Acceso restringido</div>
        <div className="text-xs text-muted-foreground mt-1">Solo el administrador puede gestionar moderadores.</div>
        <Link to="/" className="inline-block mt-4 px-4 py-2 rounded-xl border border-border text-xs font-display tracking-widest">← VOLVER</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 panel border-b">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-3 py-2.5">
          <Link to="/" className="w-9 h-9 rounded-xl border border-border grid place-items-center active:scale-95"><ArrowLeft size={16} /></Link>
          <div className="flex-1 min-w-0">
            <div className="font-display text-sm text-primary-glow glow-text leading-none flex items-center gap-1.5"><ShieldCheck size={14}/> ADMIN</div>
            <div className="text-[10px] font-mono text-muted-foreground">Gestión de moderadores</div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-3 pb-3 flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-input/50 rounded-xl px-3">
            <Search size={14} className="text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load(q)}
              placeholder="Buscar por usuario…" className="flex-1 bg-transparent py-2 text-sm outline-none" />
          </div>
          <button onClick={() => load(q)} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-display tracking-widest active:scale-95">IR</button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-3 py-3 space-y-2">
        {loading ? (
          <div className="text-center text-xs text-muted-foreground py-10">Cargando usuarios…</div>
        ) : users.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-10">Sin resultados.</div>
        ) : users.map(u => (
          <div key={u.id} className="panel border border-border/50 rounded-xl px-3 py-2.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground font-display">
              {(u.display_name?.[0] ?? u.username[0] ?? "?").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-sm truncate">{u.display_name || u.username}</div>
              <div className="text-[10px] font-mono text-muted-foreground truncate">@{u.username}</div>
            </div>
            {u.is_admin && (
              <span className="text-[9px] font-display tracking-widest px-2 py-0.5 rounded-full bg-accent/20 text-primary-glow border border-accent/40">ADMIN</span>
            )}
            {!u.is_admin && (
              <button onClick={() => toggle(u)} disabled={busy === u.id}
                className={`text-[10px] font-display tracking-widest px-3 py-1.5 rounded-lg border flex items-center gap-1.5 active:scale-95 transition disabled:opacity-60 ${u.is_mod ? "bg-primary/15 border-primary/40 text-primary-glow" : "border-border text-muted-foreground"}`}>
                {busy === u.id ? <Loader2 size={12} className="animate-spin"/> : <Shield size={12}/>}
                {u.is_mod ? "MOD" : "HACER MOD"}
              </button>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
