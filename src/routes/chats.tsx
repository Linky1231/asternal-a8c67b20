import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Users, Plus, Loader2, X, Search, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyChats, respondChatInvite, createGroupChat, createDirectChat, searchUsers,
  type ChatSummary, type Profile,
} from "@/lib/social/api";

export const Route = createFileRoute("/chats")({
  head: () => ({ meta: [{ title: "Mensajes · Asternal" }] }),
  component: ChatsPage,
});

function ChatsPage() {
  const navigate = useNavigate();
  const [myId, setMyId] = useState<string | null>(null);
  const [active, setActive] = useState<ChatSummary[]>([]);
  const [pending, setPending] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const { active, pending } = await listMyChats();
      setActive(active); setPending(pending);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      setMyId(session.user.id);
      await reload();
    })();
  }, [navigate]);

  const accept = async (chatId: string) => { await respondChatInvite(chatId, true); reload(); };
  const reject = async (chatId: string) => { await respondChatInvite(chatId, false); reload(); };

  const chatLabel = (s: ChatSummary): string => {
    if (s.chat.type === "direct") return s.other?.display_name ?? s.other?.username ?? "Chat";
    return s.chat.name ?? "Grupo";
  };

  return (
    <div className="min-h-screen w-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 panel border-b backdrop-blur-xl">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-3 py-2.5">
          <Link to="/" className="w-9 h-9 rounded-xl border border-border grid place-items-center active:scale-95">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex-1 font-display text-sm text-primary-glow glow-text flex items-center gap-1.5">
            <MessageCircle size={14} /> MENSAJES
          </div>
          <button onClick={() => setNewOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-[10px] font-display tracking-widest flex items-center gap-1 active:scale-95">
            <Plus size={12} /> NUEVO
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-3 py-3 space-y-4 pb-24">
        {loading ? (
          <div className="text-center text-xs text-muted-foreground py-10"><Loader2 className="animate-spin inline mr-2" size={14} />Cargando…</div>
        ) : (
          <>
            {pending.length > 0 && (
              <section className="space-y-2">
                <div className="font-display text-[10px] tracking-widest text-primary-glow px-1">INVITACIONES · {pending.length}</div>
                {pending.map(s => (
                  <div key={s.chat.id} className="panel border border-primary/40 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center">
                        {s.chat.type === "group" ? <Users size={16} className="text-primary-glow"/> : <MessageCircle size={16} className="text-primary-glow"/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-sm truncate">{chatLabel(s)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          Invitación de {s.members.find(m => m.user_id === s.chat.created_by)?.profile?.username ?? "alguien"}
                          {s.chat.type === "group" && ` · ${s.members.length} miembros`}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => accept(s.chat.id)}
                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-[10px] font-display tracking-widest active:scale-95 flex items-center justify-center gap-1">
                        <Check size={12} /> ACEPTAR
                      </button>
                      <button onClick={() => reject(s.chat.id)}
                        className="flex-1 py-2 rounded-xl border border-border text-[10px] font-display tracking-widest active:scale-95 flex items-center justify-center gap-1">
                        <X size={12} /> RECHAZAR
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="space-y-2">
              <div className="font-display text-[10px] tracking-widest text-muted-foreground px-1">CHATS · {active.length}</div>
              {active.length === 0 ? (
                <div className="panel rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Sin chats aún. Pulsa <b className="text-primary-glow">NUEVO</b> para empezar.
                </div>
              ) : active.map(s => (
                <Link key={s.chat.id} to="/chats/$chatId" params={{ chatId: s.chat.id }}
                  className="panel border border-border/50 rounded-2xl p-3 flex items-center gap-3 active:scale-[0.99]">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center overflow-hidden shrink-0">
                    {s.chat.type === "direct" && s.other?.avatar_url ? (
                      <img src={s.other.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : s.chat.type === "group" ? (
                      <Users size={18} className="text-primary-glow" />
                    ) : (
                      <span className="text-sm font-display text-primary-glow">{chatLabel(s)[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-sm truncate">{chatLabel(s)}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      {s.last_message?.content ?? (s.last_message?.sticker_url ? "🖼 sticker" : "Sin mensajes")}
                    </div>
                  </div>
                </Link>
              ))}
            </section>
          </>
        )}
      </main>

      {newOpen && myId && (
        <NewChatDialog myId={myId} onClose={() => setNewOpen(false)}
          onCreated={id => { setNewOpen(false); navigate({ to: "/chats/$chatId", params: { chatId: id } }); }} />
      )}
    </div>
  );
}

function NewChatDialog({ myId, onClose, onCreated }: { myId: string; onClose: () => void; onCreated: (chatId: string) => void }) {
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      try { setResults((await searchUsers(q)).filter(u => u.id !== myId)); }
      catch (e) { setErr((e as Error).message); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, myId]);

  const toggleSel = (p: Profile) => {
    setSelected(sel => sel.find(x => x.id === p.id) ? sel.filter(x => x.id !== p.id) : [...sel, p]);
  };

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      if (mode === "direct") {
        if (selected.length !== 1) throw new Error("Selecciona 1 usuario");
        onCreated(await createDirectChat(selected[0].id));
      } else {
        if (!selected.length) throw new Error("Añade al menos 1 miembro");
        onCreated(await createGroupChat(groupName || "Grupo", selected.map(s => s.id)));
      }
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 grid place-items-end sm:place-items-center p-3" onClick={onClose}>
      <div className="w-full max-w-md panel border border-border rounded-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="font-display text-sm text-primary-glow">NUEVO CHAT</div>
          <button onClick={onClose} className="ml-auto w-8 h-8 grid place-items-center rounded-lg border border-border"><X size={14}/></button>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-muted/40 rounded-xl p-1">
          <button onClick={() => { setMode("direct"); setSelected([]); }}
            className={`py-2 rounded-lg text-[10px] font-display tracking-widest ${mode === "direct" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <MessageCircle size={12} className="inline mr-1"/> INDIVIDUAL
          </button>
          <button onClick={() => setMode("group")}
            className={`py-2 rounded-lg text-[10px] font-display tracking-widest ${mode === "group" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <Users size={12} className="inline mr-1"/> GRUPO
          </button>
        </div>
        {mode === "group" && (
          <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nombre del grupo" maxLength={60}
            className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none" />
        )}
        <div className="flex items-center gap-2 bg-input/50 rounded-xl px-3">
          <Search size={14} className="text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar usuarios…"
            className="flex-1 bg-transparent py-2 text-sm outline-none" />
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map(s => (
              <button key={s.id} onClick={() => toggleSel(s)}
                className="text-[10px] font-mono px-2 py-1 rounded-full bg-primary/20 text-primary-glow border border-primary/40 flex items-center gap-1">
                @{s.username} <X size={10} />
              </button>
            ))}
          </div>
        )}
        <div className="max-h-[40vh] overflow-auto space-y-1">
          {results.map(u => {
            const sel = !!selected.find(x => x.id === u.id);
            return (
              <button key={u.id} onClick={() => toggleSel(u)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-xl border ${sel ? "border-primary bg-primary/10" : "border-border/50"} active:scale-[0.99]`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center overflow-hidden">
                  {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover"/> : (
                    <span className="text-[11px] font-display text-primary-glow">{(u.display_name ?? u.username ?? "?")[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-display truncate">{u.display_name || u.username}</div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate">@{u.username}</div>
                </div>
                {sel && <Check size={14} className="text-primary-glow" />}
              </button>
            );
          })}
          {q && !results.length && <div className="text-center text-xs text-muted-foreground py-4">Sin resultados</div>}
        </div>
        {err && <div className="text-xs text-destructive">{err}</div>}
        <button onClick={create} disabled={busy || (mode === "direct" ? selected.length !== 1 : selected.length === 0)}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-display tracking-widest text-xs disabled:opacity-50 active:scale-95">
          {busy ? "..." : mode === "direct" ? "ABRIR CHAT" : "CREAR GRUPO"}
        </button>
      </div>
    </div>
  );
}
