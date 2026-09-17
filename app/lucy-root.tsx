"use client";

import { useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import LucyApp from "./lucy-app";
import { restoreStoredSession, supabase } from "./supabase";
import { unlockWithPasskey } from "./device-security";

export default function LucyRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [privacy, setPrivacy] = useState<{checking:boolean;locked:boolean;enabled:boolean}>({checking:true,locked:false,enabled:false});
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
  useEffect(()=>{
    let active=true;
    if(!session){setPrivacy({checking:false,locked:false,enabled:false});return;}
    setPrivacy(p=>({...p,checking:true}));
    supabase.from("lucy_profiles").select("preferences").eq("user_id",session.user.id).maybeSingle().then(({data})=>{
      if(!active)return;const preferences=(data?.preferences??{}) as Record<string,unknown>;const enabled=Boolean(preferences.face_id_enabled&&preferences.lock_on_exit);
      const delay=Number(preferences.auto_lock_minutes??0);const lastHidden=Number(localStorage.getItem(`lucy-last-hidden:${session.user.id}`)||0);const expired=delay===0||!lastHidden||Date.now()-lastHidden>=delay*60_000;
      setPrivacy({checking:false,locked:enabled&&expired,enabled});
    });
    const onVisibility=()=>{if(document.visibilityState==="hidden")localStorage.setItem(`lucy-last-hidden:${session.user.id}`,String(Date.now()));};
    document.addEventListener("visibilitychange",onVisibility);return()=>{active=false;document.removeEventListener("visibilitychange",onVisibility)};
  },[session]);
  if (session === undefined) return <AuthLoading />;
  if (!session) return <Login />;
  if(privacy.checking)return <AuthLoading/>;
  if(privacy.locked)return <PrivacyLock unlock={async()=>{await unlockWithPasskey();localStorage.removeItem(`lucy-last-hidden:${session.user.id}`);setPrivacy(p=>({...p,locked:false}))}} fallback={()=>supabase.auth.signOut()}/>;
  const displayName = session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Mauro";
  return <LucyApp user={{ id:session.user.id,name: displayName, email: session.user.email || "" }} onSignOut={async()=>{localStorage.removeItem(`lucy-last-hidden:${session.user.id}`);await supabase.auth.signOut()}} onSecurityChanged={(enabled)=>setPrivacy(p=>({...p,enabled}))}/>;
}

function PrivacyLock({unlock,fallback}:{unlock:()=>Promise<void>;fallback:()=>void}){const[busy,setBusy]=useState(false),[message,setMessage]=useState("");return <main className="app-shell"><section className="phone"><div className="auth-view"><div className="auth-logo">Lucy<i>✦</i><small>Privacidad local</small></div><p>Lucy está bloqueada para proteger tu información.</p><button className="primary-wide" disabled={busy} onClick={async()=>{setBusy(true);setMessage("");try{await unlock()}catch(e:any){setMessage(e?.message||"No se pudo desbloquear.")}finally{setBusy(false)}}}>{busy?"Verificando…":"Desbloquear con Face ID / passkey"}</button>{message&&<p className="auth-message">{message}</p>}<div className="auth-actions"><button onClick={fallback}>Usar login nuevamente</button></div><small className="auth-security"><LockKeyhole/> La biometría permanece en tu dispositivo.</small></div></section></main>}

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
