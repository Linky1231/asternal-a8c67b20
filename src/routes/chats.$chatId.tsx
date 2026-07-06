import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Smile, Trash2, MoreVertical, Users, Upload, X, LogOut, UserPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getChat, fetchChatMessages, sendChatMessage, listStickers, uploadSticker,
  leaveChat, deleteChat, inviteToChat, searchUsers,
  type ChatSummary, type ChatMessageRow, type Profile, type Sticker,
} from "@/lib/social/api";

export const Route = createFileRoute("/chats/$chatId")({
  head: () => ({ meta: [{ title: "Chat · Asternal" }] }),
  component: ChatDetailPage,
});

type Msg = ChatMessageRow & { author: Profile | null };

function ChatDetailPage() {
  const navigate = useNavigate();
  const { chatId } = useParams({ from: "/chats/$chatId" });
  const [myId, setMyId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const c = await getChat(chatId); setChat(c);
    if (c && c.my_status === "active") setMessages(await fetchChatMessages(chatId));
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      setMyId(session.user.id);
      await load();
      setStickers(await listStickers());
    })();
    // realtime subscription
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` },
        async () => { setMessages(await fetchChatMessages(chatId)); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId, navigate]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const send = async () => {
    const content = text.trim(); if (!content) return;
    setText("");
    await sendChatMessage(chatId, { content });
    setMessages(await fetchChatMessages(chatId));
  };
  const sendSticker = async (url: string) => {
    setPickerOpen(false);
    await sendChatMessage(chatId, { sticker_url: url });
    setMessages(await fetchChatMessages(chatId));
  };
  const doUpload = async (f: File | null) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { alert("Máx 2MB"); return; }
    const s = await uploadSticker(f);
    setStickers(prev => [s, ...prev]);
  };
  const leave = async () => {
    if (!confirm("¿Salir de este chat?")) return;
    await leaveChat(chatId); navigate({ to: "/chats" });
  };
  const remove = async () => {
    if (!confirm("¿Borrar toda la conversación? Esto elimina el chat para todos.")) return;
    await deleteChat(chatId); navigate({ to: "/chats" });
  };

  if (!chat) return <div className="min-h-screen grid place-items-center text-xs text-muted-foreground"><Loader2 className="animate-spin inline mr-2" size={14}/>Cargando…</div>;

  const title = chat.chat.type === "direct"
    ? (chat.other?.display_name ?? chat.other?.username ?? "Chat")
    : (chat.chat.name ?? "Grupo");
  const isCreator = chat.chat.created_by === myId;

  return (
    <div className="min-h-screen w-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 panel border-b backdrop-blur-xl">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-3 py-2.5">
          <Link to="/chats" className="w-9 h-9 rounded-xl border border-border grid place-items-center active:scale-95"><ArrowLeft size={16} /></Link>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center overflow-hidden shrink-0">
            {chat.chat.type === "direct" && chat.other?.avatar_url ? (
              <img src={chat.other.avatar_url} alt="" className="w-full h-full object-cover"/>
            ) : chat.chat.type === "group" ? <Users size={16} className="text-primary-glow"/> : (
              <span className="text-[11px] font-display text-primary-glow">{title[0]?.toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-sm truncate">{title}</div>
            <div className="text-[10px] font-mono text-muted-foreground truncate">
              {chat.chat.type === "group" ? `${chat.members.filter(m => m.status === "active").length} miembros` : `@${chat.other?.username ?? ""}`}
            </div>
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen(o => !o)} className="w-9 h-9 rounded-xl border border-border grid place-items-center"><MoreVertical size={14}/></button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-10 panel border border-border rounded-xl p-1 min-w-[180px] text-xs shadow-lg">
                {chat.chat.type === "group" && (
                  <button onClick={() => { setInviteOpen(true); setMenuOpen(false); }} className="flex items-center gap-2 w-full text-left px-2 py-2 hover:bg-muted/40 rounded"><UserPlus size={13}/> Invitar usuarios</button>
                )}
                {chat.chat.type === "group" && !isCreator && (
                  <button onClick={leave} className="flex items-center gap-2 w-full text-left px-2 py-2 hover:bg-muted/40 rounded"><LogOut size={13}/> Salir del grupo</button>
                )}
                <button onClick={remove} className="flex items-center gap-2 w-full text-left px-2 py-2 text-destructive hover:bg-muted/40 rounded">
                  <Trash2 size={13}/> {chat.chat.type === "direct" ? "Borrar conversación" : "Eliminar grupo"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main ref={scrollRef} className="flex-1 max-w-2xl mx-auto w-full px-3 py-3 space-y-2 overflow-y-auto">
        {messages.length === 0 && <div className="text-center text-xs text-muted-foreground py-10">Sin mensajes aún.</div>}
        {messages.map(m => {
          const mine = m.author_id === myId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} gap-2`}>
              {!mine && (
                <Link to="/profile/$userId" params={{ userId: m.author_id }}
                  className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center overflow-hidden shrink-0">
                  {m.author?.avatar_url ? <img src={m.author.avatar_url} alt="" className="w-full h-full object-cover"/> : (
                    <span className="text-[10px] font-display text-primary-glow">{(m.author?.username ?? "?")[0]?.toUpperCase()}</span>
                  )}
                </Link>
              )}
              <div className={`max-w-[75%] rounded-2xl ${m.sticker_url ? "p-1 bg-transparent" : `px-3 py-2 ${mine ? "bg-gradient-to-br from-primary to-accent text-primary-foreground" : "bg-muted/40"}`}`}>
                {chat.chat.type === "group" && !mine && !m.sticker_url && (
                  <div className="text-[9px] font-mono text-primary-glow mb-0.5">@{m.author?.username ?? "?"}</div>
                )}
                {m.sticker_url ? (
                  <img src={m.sticker_url} alt="sticker" className="w-24 h-24 object-contain" />
                ) : (
                  <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                )}
              </div>
            </div>
          );
        })}
      </main>

      <div className="max-w-2xl mx-auto w-full px-2 py-2 border-t panel pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <div className="flex items-end gap-1">
          <button onClick={() => setPickerOpen(true)} className="w-10 h-10 grid place-items-center rounded-xl border border-border active:scale-95"><Smile size={16}/></button>
          <textarea value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1} placeholder="Mensaje…"
            className="flex-1 bg-input/50 rounded-2xl px-3 py-2.5 text-sm outline-none resize-none max-h-32" />
          <button onClick={send} disabled={!text.trim()}
            className="w-10 h-10 grid place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground active:scale-95 disabled:opacity-40"><Send size={16}/></button>
        </div>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-[80] bg-black/70 grid place-items-end" onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-2xl mx-auto panel border-t border-border rounded-t-2xl p-3 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center">
              <div className="font-display text-sm text-primary-glow">STICKERS</div>
              <button onClick={() => fileRef.current?.click()}
                className="ml-auto px-3 py-1.5 rounded-xl border border-primary/40 bg-primary/10 text-primary-glow text-[10px] font-display tracking-widest flex items-center gap-1 active:scale-95">
                <Upload size={12}/> SUBIR
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => doUpload(e.target.files?.[0] ?? null)} />
              <button onClick={() => setPickerOpen(false)} className="ml-2 w-8 h-8 grid place-items-center rounded-lg border border-border"><X size={14}/></button>
            </div>
            <div className="grid grid-cols-5 gap-2 max-h-[50vh] overflow-auto">
              {stickers.map(s => (
                <button key={s.id} onClick={() => sendSticker(s.url)} className="aspect-square rounded-xl bg-muted/40 hover:bg-muted p-1 active:scale-95">
                  <img src={s.url} alt={s.name ?? "sticker"} className="w-full h-full object-contain"/>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {inviteOpen && <InviteDialog chatId={chatId} existing={chat.members.map(m => m.user_id)} onClose={() => { setInviteOpen(false); load(); }} />}
    </div>
  );
}

function InviteDialog({ chatId, existing, onClose }: { chatId: string; existing: string[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      const r = await searchUsers(q);
      setResults(r.filter(u => !existing.includes(u.id)));
    }, 250);
    return () => clearTimeout(t);
  }, [q, existing]);

  const send = async () => {
    setBusy(true);
    try { await inviteToChat(chatId, selected.map(s => s.id)); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[85] bg-black/70 grid place-items-end sm:place-items-center p-3" onClick={onClose}>
      <div className="w-full max-w-md panel border border-border rounded-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="font-display text-sm text-primary-glow">INVITAR</div>
          <button onClick={onClose} className="ml-auto w-8 h-8 grid place-items-center rounded-lg border border-border"><X size={14}/></button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar usuarios…"
          className="w-full bg-input/50 rounded-xl px-3 py-2 text-sm outline-none" />
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map(s => (
              <button key={s.id} onClick={() => setSelected(sel => sel.filter(x => x.id !== s.id))}
                className="text-[10px] font-mono px-2 py-1 rounded-full bg-primary/20 text-primary-glow border border-primary/40 flex items-center gap-1">
                @{s.username} <X size={10}/>
              </button>
            ))}
          </div>
        )}
        <div className="max-h-[40vh] overflow-auto space-y-1">
          {results.map(u => (
            <button key={u.id} onClick={() => setSelected(sel => sel.find(x => x.id === u.id) ? sel : [...sel, u])}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-xl border border-border/50 active:scale-[0.99]">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-accent/30 grid place-items-center overflow-hidden">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover"/> : (
                  <span className="text-[11px] font-display text-primary-glow">{(u.username ?? "?")[0]?.toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-display truncate">{u.display_name || u.username}</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">@{u.username}</div>
              </div>
            </button>
          ))}
        </div>
        <button onClick={send} disabled={busy || !selected.length}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-display tracking-widest text-xs disabled:opacity-50 active:scale-95">
          {busy ? "..." : `INVITAR (${selected.length})`}
        </button>
      </div>
    </div>
  );
}
