"use client";

import { useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import LucyApp from "./lucy-app";
import { restoreStoredSession, supabase } from "./supabase";

export default function LucyRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const ready = useRef(false);
  useEffect(() => {
    let active = true;
    let restored: Session | null | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      restored = next;
      if (active && ready.current) setSession(next);
    });
    restoreStoredSession().then(({ data, error }) => {
      if (!active) return;
      ready.current = true;
      setSession(error ? null : (restored ?? data.session ?? null));
    }).catch(() => {
      if (!active) return;
      ready.current = true;
      setSession(null);
    });
    return () => { active = false; ready.current = false; subscription.unsubscribe(); };
  }, []);
  if (session === undefined) return <AuthLoading />;
  if (!session) return <Login />;
  const displayName = session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Mauro";
  return <LucyApp user={{ name: displayName, email: session.user.email || "" }} onSignOut={() => supabase.auth.signOut()} />;
}

function AuthLoading() {
  return <main className="app-shell"><section className="phone"><div className="auth-wait"><span/><span/><span/><p>Comprobando tu acceso…</p></div></section></main>;
}

function Login() {
  const [mode,setMode] = useState<"login"|"signup"|"reset">("login");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email,{ redirectTo:window.location.origin });
        if (error) throw error; setMessage("Revisa tu correo para restablecer la contraseña.");
      } else if (mode === "signup") {
        const { data,error } = await supabase.auth.signUp({ email,password,options:{ emailRedirectTo:window.location.origin } });
        if (error) throw error; if (!data.session) setMessage("Revisa tu correo para confirmar el acceso.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email,password });
        if (error) throw error;
      }
    } catch (error:any) { setMessage(error.message || "No se pudo completar el acceso."); }
    finally { setBusy(false); }
  }
  return <main className="app-shell"><section className="phone"><div className="auth-view"><div className="auth-logo">Lucy<i>✦</i><small>by Orionix-AI</small></div><p>Tu vida, más clara. Un día a la vez.</p><form onSubmit={submit}><label>Correo<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>{mode !== "reset" && <label>Contraseña<input type="password" autoComplete={mode==="signup"?"new-password":"current-password"} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label>}<button className="primary-wide" disabled={busy}>{busy?"Procesando…":mode==="signup"?"Crear acceso":mode==="reset"?"Enviar enlace":"Entrar"}</button></form>{message&&<p className="auth-message">{message}</p>}<div className="auth-actions">{mode!=="login"&&<button onClick={()=>setMode("login")}>Ya tengo acceso</button>}{mode==="login"&&<><button onClick={()=>setMode("signup")}>Crear acceso</button><button onClick={()=>setMode("reset")}>Olvidé mi contraseña</button></>}</div><small className="auth-security"><LockKeyhole/> Tu sesión se conserva de forma segura en este dispositivo.</small></div></section></main>;
}
