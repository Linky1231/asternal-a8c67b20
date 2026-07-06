import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfilePanel } from "@/components/social/ProfilePanel";
import { isMod as checkMod, createDirectChat } from "@/lib/social/api";

export const Route = createFileRoute("/profile/$userId")({
  head: () => ({ meta: [{ title: "Perfil · Asternal" }] }),
  component: ProfileByIdPage,
});

function ProfileByIdPage() {
  const navigate = useNavigate();
  const { userId } = useParams({ from: "/profile/$userId" });
  const [myId, setMyId] = useState<string | null>(null);
  const [mod, setMod] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      setMyId(session.user.id);
      setMod(await checkMod());
    })();
  }, [navigate]);

  const openDM = async () => {
    setBusy(true);
    try {
      const chatId = await createDirectChat(userId);
      navigate({ to: "/chats/$chatId", params: { chatId } });
    } finally { setBusy(false); }
  };

  if (!myId) return null;
  const viewingOwn = myId === userId;
  return (
    <div className="min-h-screen w-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 panel border-b backdrop-blur-xl">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-3 py-2.5">
          <Link to="/" className="w-9 h-9 rounded-xl border border-border grid place-items-center active:scale-95 transition">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex-1 font-display text-sm text-primary-glow glow-text">{viewingOwn ? "MI PERFIL" : "PERFIL"}</div>
          {!viewingOwn && (
            <button onClick={openDM} disabled={busy}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-[10px] font-display tracking-widest flex items-center gap-1 active:scale-95 disabled:opacity-60">
              <MessageCircle size={12} /> MENSAJE
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-2xl mx-auto w-full px-3 py-3 pb-24">
        <ProfilePanel userId={userId} myId={myId} isMod={mod} viewingOwn={viewingOwn} />
      </main>
    </div>
  );
}
