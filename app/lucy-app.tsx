"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Brain, Check, ChevronRight, CircleUserRound, CloudMoon, Ellipsis, Feather, Heart, Lightbulb, LockKeyhole, Menu, MessageCircle, Mic, Moon, Plus, Search, Send, Settings, Sparkles, Target, Trash2, TrendingUp, WalletCards, X } from "lucide-react";
import { lucyData } from "./lucy-data";

type Tab = "lucy" | "diario" | "suenos" | "memoria" | "objetivos" | "vida" | "perfil" | "mas";
type Data = { messages: any[]; entries: any[]; dreams: any[]; memories: any[]; goals: any[]; observations: any[] };
const EMPTY: Data = { messages: [], entries: [], dreams: [], memories: [], goals: [], observations: [] };

const tabs = [
  { id: "lucy" as Tab, label: "Lucy", icon: MessageCircle },
  { id: "diario" as Tab, label: "Diario", icon: BookOpen },
  { id: "suenos" as Tab, label: "Sueños", icon: Moon },
  { id: "vida" as Tab, label: "Mi vida", icon: Sparkles },
  { id: "mas" as Tab, label: "Más", icon: Ellipsis },
];
const titles: Record<Tab, [string, string]> = {
  lucy: ["Lucy", "Aquí para escucharte"],
  diario: ["Diario", "Tu historia, día a día"],
  suenos: ["Sueños", "Explora tu mundo interior"],
  memoria: ["Memoria de Lucy", "Lo importante, siempre contigo"],
  objetivos: ["Objetivos", "Pequeños pasos, grandes cambios"],
  vida: ["Mi vida", "Conoce tus patrones"],
  perfil: ["Mi perfil", "Tu espacio, a tu manera"],
  mas: ["Más", "Todo en un solo lugar"],
};

function prettyDate(value?: string) {
  if (!value) return "Hoy";
  return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value + (value.length === 10 ? "T12:00:00" : "")));
}

export default function LucyApp({ user, onSignOut }: { user: { name: string; email: string }; onSignOut: () => Promise<unknown> }) {
  const [tab, setTab] = useState<Tab>("lucy");
  const [data, setData] = useState<Data>(EMPTY);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [modal, setModal] = useState<"dream" | "goal" | null>(null);
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await lucyData.load());
    } catch { setNotice("No pude cargar tus registros. Intenta nuevamente."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
  useEffect(() => { if (tab === "lucy") endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data.messages, tab]);

  async function post(payload: any) {
    await lucyData.post(payload);
    await load();
  }
  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setText(""); setSending(true);
    setData(d => ({ ...d, messages: [...d.messages, { id: "temp", role: "user", content }] }));
    try { await post({ content }); } catch { setNotice("No pude guardar el mensaje. Tu texto sigue aquí."); setText(content); }
    finally { setSending(false); }
  }
  function voice() {
    const w = window as any;
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) { setNotice("El dictado no está disponible en este navegador."); return; }
    const recognition = new Recognition();
    recognition.lang = "es-BO"; recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event: any) => setText((v) => `${v} ${event.results[0][0].transcript}`.trim());
    recognition.start();
  }
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const register = (name: string, description: string, action?: string) => context.registerTool({
      name, title: description, description,
      inputSchema: { type: "object", properties: { content: { type: "string", description: "Texto original expresado por la persona" } }, required: ["content"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async ({ content }: { content: string }) => { await post(action ? { action, content } : { content }); return { saved: true }; }
    }, { signal: controller.signal });
    Promise.all([register("record_life_note", "Guardar un relato en Lucy"), register("register_dream", "Registrar un sueño", "dream")]).catch(() => {});
    return () => controller.abort();
  }, [load]);

  const totalExpense = useMemo(() => data.observations.filter(o => o.type === "expense").reduce((sum, o) => {
    const metadata = typeof o.metadata === "string" ? JSON.parse(o.metadata || "{}") : (o.metadata || {});
    return sum + (metadata.amount || 0);
  }, 0), [data.observations]);
  const changeTab = (next: Tab) => setTab(next === "mas" ? "mas" : next);
  const firstName = (user.name || "Mauro").split(" ")[0];

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <section className="phone">
        <Header tab={tab} onMenu={() => setTab("mas")} />
        <div className="content">
          {loading ? <Loading /> : <>
            {tab === "lucy" && <Chat messages={data.messages} name={firstName} text={text} setText={setText} send={send} voice={voice} listening={listening} sending={sending} endRef={endRef} go={setTab} />}
            {tab === "diario" && <Journal entries={data.entries} />}
            {tab === "suenos" && <Dreams dreams={data.dreams} open={() => setModal("dream")} remove={async (id: string) => { await lucyData.removeDream(id); await load(); }} />}
            {tab === "memoria" && <Memory memories={data.memories} observations={data.observations} />}
            {tab === "objetivos" && <Goals goals={data.goals} open={() => setModal("goal")} toggle={async (g: { id: string; status: string }) => { await lucyData.toggleGoal(g.id,g.status); await load(); }} />}
            {tab === "vida" && <Life data={data} totalExpense={totalExpense} />}
            {tab === "perfil" && <Profile user={user} signOut={onSignOut} />}
            {tab === "mas" && <More go={setTab} />}
          </>}
        </div>
        <nav className="bottom-nav" aria-label="Navegación principal">
          {tabs.map(item => <button key={item.id} onClick={() => changeTab(item.id)} className={(tab === item.id || (item.id === "mas" && ["memoria","objetivos","perfil"].includes(tab))) ? "active" : ""}><item.icon /><span>{item.label}</span></button>)}
        </nav>
      </section>
      {modal && <QuickModal kind={modal} close={() => setModal(null)} save={async (content: string) => { await post({ action: modal, content, kind: modal === "goal" ? "goal" : undefined }); setModal(null); }} />}
      {notice && <div className="toast">{notice}<button onClick={() => setNotice("")}><X /></button></div>}
    </main>
  );
}

function Header({ tab, onMenu }: { tab: Tab; onMenu: () => void }) {
  const [title, subtitle] = titles[tab];
  const Icon = tab === "suenos" ? Moon : tab === "diario" ? BookOpen : tab === "memoria" ? Brain : tab === "objetivos" ? Target : tab === "vida" ? TrendingUp : tab === "perfil" ? CircleUserRound : tab === "mas" ? Menu : Feather;
  return <header className="topbar"><div className="brand-icon"><Icon /></div><div><h1>{title}{tab === "lucy" && <i />}</h1><p>{subtitle}</p></div><button className="icon-button" onClick={onMenu} aria-label="Abrir menú"><Ellipsis /></button></header>;
}
function Loading() { return <div className="loading"><span /><span /><span /><p>Lucy está preparando tu espacio…</p></div>; }
function Empty({ icon: Icon, title, text }: any) { return <div className="empty"><span><Icon /></span><h3>{title}</h3><p>{text}</p></div>; }

function Chat({ messages, name, text, setText, send, voice, listening, sending, endRef, go }: any) {
  return <div className="chat">
    <div className="day-label">HOY</div>
    {messages.length === 0 && <div className="lucy-message"><div className="avatar">L</div><div className="bubble assistant"><b>Hola, {name} ✦</b><br/>¿Cómo estuvo tu día? Puedes contarme algo grande o algo pequeño. Estoy aquí para escucharte.</div></div>}
    {messages.map((m: any) => m.role === "user" ? <div className="bubble user" key={m.id}>{m.content}</div> : <div className="lucy-message" key={m.id}><div className="avatar">L</div><div className="bubble assistant">{m.content}</div></div>)}
    {sending && <div className="lucy-message"><div className="avatar">L</div><div className="bubble assistant typing"><i/><i/><i/></div></div>}
    <div ref={endRef} />
    <div className="quick-links"><button onClick={() => go("diario")}><BookOpen/> Diario</button><button onClick={() => go("objetivos")}><Target/> Objetivos</button><button onClick={() => go("vida")}><WalletCards/> Finanzas</button></div>
    <div className="composer"><textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}} placeholder="Cuéntame cómo estuvo tu día…" rows={1}/><button className={listening ? "mic listening" : "mic"} onClick={voice} aria-label="Dictar mensaje"><Mic /></button><button className="send" onClick={send} disabled={!text.trim() || sending}><Send /></button></div>
    <p className="privacy-line"><LockKeyhole/> Privado. Solo tú puedes ver este espacio.</p>
  </div>;
}

function Journal({ entries }: { entries: any[] }) {
  return <div className="stack"><div className="date-strip">{["Lun","Mar","Mié","Jue","Vie"].map((d,i)=><div className={i===1?"selected":""} key={d}><span>{d}</span><b>{14+i}</b></div>)}</div>
    {entries.length === 0 ? <Empty icon={BookOpen} title="Tu historia empieza aquí" text="Lo que le cuentes a Lucy aparecerá en orden cronológico, conservando tus palabras."/> : entries.map((e,i)=><article className="story-card" key={e.id}><div className={"story-cover cover-"+(i%3)}><span>{prettyDate(e.entry_date)}</span></div><div><h3>{e.summary || "Un momento de tu día"}</h3><p>{e.original_content}</p><div className="tags"><span><Heart/> Registro original</span><span><Sparkles/> {e.entry_date}</span></div></div></article>)}
  </div>;
}

function Dreams({ dreams, open, remove }: any) {
  return <div className="stack"><section className="dream-hero"><div className="moon-art"><CloudMoon/></div><p>Cada sueño también cuenta una historia.</p><button onClick={open}>Registrar un sueño <Plus/></button></section>
    <div className="section-head"><h2>Últimos sueños</h2><Search/></div>
    {dreams.length === 0 ? <Empty icon={Moon} title="Aún no hay sueños" text="Registra lo que recuerdes, aunque sean fragmentos. La interpretación siempre quedará separada."/> : dreams.map((d:any)=><article className="dream-row" key={d.id}><span className="dream-thumb"><Moon/></span><div><h3>{d.title || "Sueño sin título"}</h3><p>{prettyDate(d.dream_date)} · Registro original</p><small>{d.original_content}</small></div><button onClick={()=>remove(d.id)} aria-label="Eliminar sueño"><Trash2/></button></article>)}
    <div className="info-note"><Lightbulb/><p><b>Interpretación responsable</b><br/>Lucy podrá ayudarte a explorar símbolos como posibilidades, nunca como predicciones o diagnósticos.</p></div>
  </div>;
}

function Memory({ memories, observations }: any) {
  const items = [...memories.map((m:any)=>({ title:m.category, text:m.content, icon:Brain })), ...observations.slice(0,8).map((o:any)=>({ title:o.type.replace("_"," "), text:o.value, icon:o.type.includes("emotion")?Heart:o.type.includes("expense")?WalletCards:Sparkles }))];
  return <div className="stack"><div className="segmented"><button className="on">Sobre ti</button><button>Personas</button><button>Contexto</button></div>
    {items.length === 0 ? <Empty icon={Brain} title="Lucy aprenderá contigo" text="Aquí podrás revisar, corregir y eliminar aquello que Lucy conserve a largo plazo."/> : items.map((m:any,i:number)=><article className="memory-card" key={i}><span><m.icon/></span><div><h3>{m.title}</h3><p>{m.text}</p></div><ChevronRight/></article>)}
    <blockquote>“Tu historia te pertenece. Lucy solo conserva lo que puedes revisar.”</blockquote>
  </div>;
}

function Goals({ goals, open, toggle }: any) {
  return <div className="stack"><div className="segmented"><button className="on">Todos</button><button>Objetivos</button><button>Pendientes</button></div>
    {goals.length === 0 ? <Empty icon={Target} title="Convierte intención en avance" text="Agrega un objetivo o cuéntale a Lucy algo que debes recordar."/> : goals.map((g:any)=><button className={"goal-row "+(g.status==="done"?"done":"")} onClick={()=>toggle(g)} key={g.id}><span className="check">{g.status==="done"?<Check/>:null}</span><div><h3>{g.title}</h3><p>{g.kind === "goal" ? "Objetivo" : "Pendiente"} · {prettyDate(g.created_at)}</p></div></button>)}
    <button className="primary-wide" onClick={open}><Plus/> Nuevo objetivo</button>
  </div>;
}

function Life({ data, totalExpense }: { data: Data; totalExpense: number }) {
  const emotions = data.observations.filter(o=>o.type==="emotion_reported");
  const completed = data.goals.filter(g=>g.status==="done").length;
  return <div className="stack"><div className="segmented"><button>Semana</button><button className="on">Mes</button><button>Año</button></div><p className="eyebrow">TU MES EN RESUMEN</p>
    <div className="metric-grid"><Metric icon={BookOpen} value={data.entries.length} label="Días registrados"/><Metric icon={Heart} value={emotions.length} label="Estados expresados"/><Metric icon={Target} value={completed} label="Tareas completadas"/><Metric icon={WalletCards} value={`Bs ${totalExpense.toFixed(0)}`} label="Gastos registrados"/></div>
    <article className="insight-card"><Sparkles/><div><h3>Una lectura cuidadosa</h3><p>{data.entries.length ? `Ya tienes ${data.entries.length} momentos guardados. Con más tiempo, Lucy podrá comparar semanas sin confundir coincidencias con causas.` : "Empieza contando tu día. Los patrones aparecerán solo cuando exista suficiente historia real."}</p></div></article>
    <h2 className="subheading">Temas registrados</h2>{["Diario","Objetivos","Sueños","Finanzas"].map((x,i)=><div className="bar-row" key={x}><span>{x}</span><i><b style={{width:`${[72,46,34,58][i]}%`}}/></i><em>{[data.entries.length,data.goals.length,data.dreams.length,data.observations.filter(o=>o.type==="expense").length][i]}</em></div>)}
  </div>;
}
function Metric({ icon:Icon, value, label }: any) { return <article className="metric"><Icon/><b>{value}</b><span>{label}</span></article>; }

function Profile({ user, signOut }: any) {
  return <div className="stack profile"><div className="profile-avatar">{(user.name||"U").slice(0,1).toUpperCase()}<i/></div><h2>{user.name || "Tu perfil"}</h2><p>{user.email}</p>{[[CircleUserRound,"Mi información"],[Settings,"Preferencias"],[LockKeyhole,"Privacidad y seguridad"],[Sparkles,"Notificaciones"]].map(([Icon,label]:any)=><button className="settings-row" key={label}><Icon/><span>{label}</span><ChevronRight/></button>)}<button className="signout" onClick={signOut}>Cerrar sesión</button></div>;
}
function More({ go }: { go: (t:Tab)=>void }) {
  return <div className="stack menu-list">{[[Sparkles,"Mi vida","Tu historia en contexto","vida"],[Target,"Objetivos","Rutinas y seguimiento","objetivos"],[Brain,"Memoria","Lo que Lucy recuerda","memoria"],[Moon,"Interpretación de sueños","Próximamente","suenos"],[CircleUserRound,"Perfil y privacidad","Tu cuenta y preferencias","perfil"]].map(([Icon,title,sub,id]:any)=><button key={title} onClick={()=>go(id)}><span><Icon/></span><div><h3>{title}</h3><p>{sub}</p></div><ChevronRight/></button>)}<div className="orionix">Creado por <b>Orionix-AI</b><small>www.orionix-ai.com</small></div></div>;
}
function QuickModal({ kind, close, save }: any) {
  const [value,setValue]=useState("");
  return <div className="modal-backdrop" onMouseDown={close}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={close}><X/></button><span className="modal-icon">{kind==="dream"?<Moon/>:<Target/>}</span><h2>{kind==="dream"?"Registrar un sueño":"Nuevo objetivo"}</h2><p>{kind==="dream"?"Escribe lo que recuerdes. Guardaremos el relato original sin interpretarlo.":"¿Qué quieres lograr o recordar?"}</p><textarea autoFocus value={value} onChange={e=>setValue(e.target.value)} placeholder={kind==="dream"?"Anoche soñé que…":"Quiero…"} rows={6}/><button className="primary-wide" disabled={!value.trim()} onClick={()=>save(value)}>{kind==="dream"?"Guardar sueño":"Guardar objetivo"}</button></div></div>;
}
