import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { fetchNotifications, markNotificationsRead } from "@/lib/social/api";

type Notif = {
  id: string; type: string; created_at: string; read: boolean;
  actor?: { username: string; display_name: string | null } | null;
  post_id?: string | null;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);

  const reload = async () => setItems((await fetchNotifications()) as Notif[]);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 30000);
    return () => clearInterval(t);
  }, []);

  const unread = items.filter(i => !i.read).length;

  const toggle = async () => {
    setOpen(o => !o);
    if (!open && unread) {
      await markNotificationsRead();
      setTimeout(reload, 200);
    }
  };

  const label = (n: Notif) => {
    const who = n.actor?.display_name ?? n.actor?.username ?? "alguien";
    switch (n.type) {
      case "comment": return `${who} comentó tu post`;
      case "reply": return `${who} respondió tu comentario`;
      case "reaction": return `${who} reaccionó a tu contenido`;
      case "repost": return `${who} reposteó tu post`;
      case "mention": return `${who} te mencionó`;
      default: return `${who}`;
    }
  };

  return (
    <div className="relative">
      <button onClick={toggle} title="Notificaciones"
        className="relative w-9 h-9 rounded-xl border border-border grid place-items-center active:scale-95 transition text-muted-foreground hover:text-primary-glow">
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[9px] font-mono rounded-full w-4 h-4 grid place-items-center animate-in zoom-in">{unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 panel border border-border rounded-md w-72 max-h-80 overflow-auto">
          {items.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">Sin notificaciones</div>
          ) : items.map(n => (
            <div key={n.id} className={`p-2 text-xs border-b border-border/40 ${!n.read ? "bg-primary/5" : ""}`}>
              {label(n)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
