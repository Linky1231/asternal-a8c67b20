import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isMod, isAdmin, listManagedUsers, setUserModerator, type ManagedUser,
  listBannedEmails, banEmail, unbanEmail, type BannedEmail,
} from "@/lib/social/api";
import { ArrowLeft, Shield, ShieldCheck, Loader2, Search, Ban, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · Asternal" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState<"mods" | "bans">("mods");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [bans, setBans] = useState<BannedEmail[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("");
  const [banErr, setBanErr] = useState<string | null>(null);

  const load = async (search?: string) => {
    setLoading(true);
    try {
      if (tab === "mods") setUsers(await listManagedUsers(search));
      else setBans(await listBannedEmails());
    } finally { setLoading(false); }
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      const isA = await isAdmin();
      const isM = await isMod();
      setAdmin(isA);
      setAllowed(isA || isM);
      if (isA || isM) await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (allowed) load(q); /* eslint-disable-next-line */ }, [tab]);

  const toggleMod = async (u: ManagedUser) => {
    setBusy(u.id);
    try { await setUserModerator(u.id, !u.is_mod); await load(q); }
    finally { setBusy(null); }
  };

  const addBan = async () => {
    setBanErr(null);
    try { await banEmail(newEmail, newReason || undefined); setNewEmail(""); setNewReason(""); await load(); }
    catch (e) { setBanErr((e as Error).message); }
  };

  const removeBan = async (id: string) => {
    if (!confirm("¿Quitar del baneo?")) return;
    setBusy(id);
    try { await unbanEmail(id); await load(); } finally { setBusy(null); }
  };

  if (allowed === null) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Cargando…</div>;
  if (!allowed) return (
    <div className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <Shield size={32} className="mx-auto text-destructive" />
        <div className="mt-3 font-display text-sm">Acceso restringido</div>
        <div className="text-xs text-muted-foreground mt-1">Solo moderadores o el administrador pueden entrar.</div>
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
            <div className="font-display text-sm text-primary-glow glow-text leading-none flex items-center gap-1.5"><ShieldCheck size={14}/> MODERACIÓN</div>
            <div className="text-[10px] font-mono text-muted-foreground">{admin ? "Administrador" : "Moderador"}</div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-3 pb-2">
          <div className="relative flex bg-muted/40 rounded-2xl p-1">
            <button onClick={() => setTab("mods")}
              className={`relative z-10 flex-1 py-2 rounded-xl text-[11px] font-display tracking-widest ${tab === "mods" ? "text-primary-foreground" : "text-muted-foreground"}`}>
              MODERADORES
            </button>
            <button onClick={() => setTab("bans")}
              className={`relative z-10 flex-1 py-2 rounded-xl text-[11px] font-display tracking-widest ${tab === "bans" ? "text-primary-foreground" : "text-muted-foreground"}`}>
              EMAILS BANEADOS
            </button>
            <div className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-r from-primary to-accent transition-transform duration-300"
              style={{ transform: `translateX(${tab === "mods" ? "0%" : "calc(100% + 8px)"})` }} />
          </div>
        </div>
        {tab === "mods" && (
          <div className="max-w-2xl mx-auto px-3 pb-3 flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-input/50 rounded-xl px-3">
              <Search size={14} className="text-muted-foreground" />
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load(q)}
                placeholder="Buscar por usuario…" className="flex-1 bg-transparent py-2 text-sm outline-none" />
            </div>
            <button onClick={() => load(q)} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-display tracking-widest active:scale-95">IR</button>
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-3 py-3 space-y-2">
        {loading ? (
          <div className="text-center text-xs text-muted-foreground py-10"><Loader2 className="inline animate-spin mr-2" size={14}/>Cargando…</div>
        ) : tab === "mods" ? (
          !admin ? (
            <div className="text-center text-xs text-muted-foreground py-10">Solo el administrador puede asignar moderadores.</div>
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
              {u.is_admin ? (
                <span className="text-[9px] font-display tracking-widest px-2 py-0.5 rounded-full bg-accent/20 text-primary-glow border border-accent/40">ADMIN</span>
              ) : (
                <button onClick={() => toggleMod(u)} disabled={busy === u.id}
                  className={`text-[10px] font-display tracking-widest px-3 py-1.5 rounded-lg border flex items-center gap-1.5 active:scale-95 transition disabled:opacity-60 ${u.is_mod ? "bg-primary/15 border-primary/40 text-primary-glow" : "border-border text-muted-foreground"}`}>
                  {busy === u.id ? <Loader2 size={12} className="animate-spin"/> : <Shield size={12}/>}
                  {u.is_mod ? "MOD" : "HACER MOD"}
                </button>
              )}
            </div>
          ))
        ) : (
          <>
            <div className="panel border border-border/50 rounded-xl p-3 space-y-2">
              <div className="font-display text-[10px] tracking-widest text-primary-glow flex items-center gap-1"><Ban size={12}/> AÑADIR EMAIL</div>
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="usuario@ejemplo.com"
                className="w-full bg-input/50 rounded-lg px-3 py-2 text-sm outline-none" />
              <input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="Motivo (opcional)" maxLength={200}
                className="w-full bg-input/50 rounded-lg px-3 py-2 text-sm outline-none" />
              {banErr && <div className="text-xs text-destructive">{banErr}</div>}
              <button onClick={addBan} disabled={!newEmail.trim()}
                className="w-full py-2 rounded-lg bg-gradient-to-r from-destructive to-accent text-primary-foreground text-[10px] font-display tracking-widest disabled:opacity-50 flex items-center justify-center gap-1 active:scale-95">
                <Plus size={12}/> BANEAR EMAIL
              </button>
            </div>
            {bans.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-10">No hay emails baneados.</div>
            ) : bans.map(b => (
              <div key={b.id} className="panel border border-border/50 rounded-xl px-3 py-2.5 flex items-center gap-3">
                <Ban size={16} className="text-destructive shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono truncate">{b.email}</div>
                  {b.reason && <div className="text-[10px] text-muted-foreground truncate">{b.reason}</div>}
                </div>
                <button onClick={() => removeBan(b.id)} disabled={busy === b.id}
                  className="w-9 h-9 grid place-items-center rounded-lg border border-destructive/40 text-destructive active:scale-95 disabled:opacity-60">
                  {busy === b.id ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={13}/>}
                </button>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
