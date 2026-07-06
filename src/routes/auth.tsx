import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Acceder · Asternal" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin + "/",
            data: { username: username || email.split("@")[0] },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  const google = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (res.error) { setErr(String(res.error)); return; }
      if (res.redirected) return;
      navigate({ to: "/" });
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col bg-background">
      <div className="flex items-center justify-between p-3 border-b panel">
        <Link to="/" className="text-[10px] font-display tracking-widest text-muted-foreground">← MOTOR</Link>
        <div className="font-display text-sm text-primary-glow glow-text">ASTERNAL · FEED</div>
        <span className="w-10" />
      </div>
      <div className="flex-1 grid place-items-center p-4">
        <form onSubmit={onSubmit} className="w-full max-w-sm panel rounded-2xl p-4 space-y-3 glow-border">
          <div className="grid grid-cols-2 gap-1 mb-2">
            <button type="button" onClick={() => setMode("signin")}
              className={`py-2 rounded text-xs font-display tracking-widest ${mode === "signin" ? "bg-primary/20 text-primary-glow" : "text-muted-foreground"}`}>ENTRAR</button>
            <button type="button" onClick={() => setMode("signup")}
              className={`py-2 rounded text-xs font-display tracking-widest ${mode === "signup" ? "bg-primary/20 text-primary-glow" : "text-muted-foreground"}`}>CREAR CUENTA</button>
          </div>
          {mode === "signup" && (
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="usuario" maxLength={32}
              className="w-full bg-input/60 border border-border rounded px-3 py-2 text-sm" />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email" required
            className="w-full bg-input/60 border border-border rounded px-3 py-2 text-sm" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="contraseña" required minLength={6}
            className="w-full bg-input/60 border border-border rounded px-3 py-2 text-sm" />
          {err && <div className="text-xs text-destructive">{err}</div>}
          <button disabled={busy} className="w-full py-3 rounded-lg bg-gradient-to-r from-primary to-accent text-primary-foreground font-display tracking-widest text-sm glow-border disabled:opacity-50">
            {busy ? "..." : mode === "signin" ? "ENTRAR" : "REGISTRARME"}
          </button>
          {mode === "signin" && (
            <button type="button" onClick={async () => {
              if (!email) { setErr("Escribe tu email arriba primero"); return; }
              setBusy(true); setErr(null);
              try {
                const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
                if (error) throw error;
                setErr("✉️ Te enviamos un enlace para restablecer la contraseña");
              } catch (e) { setErr((e as Error).message); }
              finally { setBusy(false); }
            }} className="w-full text-[10px] text-muted-foreground hover:text-primary-glow underline">
              ¿Olvidaste tu contraseña?
            </button>
          )}
          <div className="text-center text-[10px] text-muted-foreground">o</div>
          <button type="button" onClick={google} className="w-full py-2.5 rounded-lg border border-border text-sm font-display tracking-widest">
            CONTINUAR CON GOOGLE
          </button>
        </form>
      </div>
    </div>
  );
}
