import { supabase } from "./supabase";

const today = () => new Date().toISOString().slice(0, 10);

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("No hay una sesión válida.");
  return data.user;
}

function extract(content: string) {
  const lower = content.toLowerCase();
  const items: Array<{ type: string; value: string; metadata: Record<string, unknown> }> = [];
  for (const match of content.matchAll(/(?:bs\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:bs|bolivianos?)/gi)) {
    const amount = Number(match[1].replace(",", "."));
    const around = lower.slice(Math.max(0, (match.index ?? 0) - 42), (match.index ?? 0) + match[0].length + 42);
    const income = /gan[ée]|cobr[ée]|ingres|recib[íi]|vend[íi]/.test(around);
    const category = /gasolina|taxi|transporte/.test(around) ? "transporte" : /super|mercado|víveres|viveres|comida|pan|leche/.test(around) ? "alimentación" : "otros";
    items.push({ type: income ? "income" : "expense", value: `${amount} BOB`, metadata: { amount, currency: "BOB", category } });
  }
  for (const emotion of ["cansada","cansado","feliz","triste","tranquila","tranquilo","preocupada","preocupado","ansiosa","ansioso"]) {
    if (lower.includes(emotion)) items.push({ type: "emotion_reported", value: emotion, metadata: {} });
  }
  return { items, isDream: /\bsoñ[ée]|\bsueño que|anoche soñ/.test(lower), hasTask: /tengo que|debo |mañana .*?(llamar|hacer|ir|pagar)/.test(lower) };
}

function unwrap<T>(result: { data: T; error: Error | null }) {
  if (result.error) throw result.error;
  return result.data;
}

export const lucyData = {
  async load() {
    const user = await requireUser();
    const uid = user.id;
    const results = await Promise.all([
      supabase.from("lucy_messages").select("id,role,content,source,created_at").eq("user_id",uid).order("created_at",{ascending:true}).limit(30),
      supabase.from("lucy_daily_entries").select("id,original_content,entry_date,summary,created_at").eq("user_id",uid).order("entry_date",{ascending:false}).order("created_at",{ascending:false}).limit(30),
      supabase.from("lucy_dreams").select("id,original_content,dream_date,title,emotions,symbols,created_at").eq("user_id",uid).order("dream_date",{ascending:false}).limit(30),
      supabase.from("lucy_memories").select("id,content,category,confidence,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(30),
      supabase.from("lucy_goals_tasks").select("id,kind,title,status,due_date,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(30),
      supabase.from("lucy_observations").select("id,type,value,metadata,observed_at").eq("user_id",uid).order("observed_at",{ascending:false}).limit(80),
    ]);
    const [messages, entries, dreams, memories, goals, observations] = results.map((r) => unwrap(r as never)) as unknown as [any[],any[],any[],any[],any[],any[]];
    return { messages, entries, dreams, memories, goals, observations };
  },
  async post(body: { action?: string; content: string; title?: string; kind?: string }) {
    const user = await requireUser();
    const content = body.content.trim();
    if (!content) throw new Error("Escribe algo para guardar.");
    if (body.action === "goal") {
      unwrap(await supabase.from("lucy_goals_tasks").insert({ user_id:user.id, kind:body.kind === "goal" ? "goal" : "task", title:content, status:"pending" }).select("id").single() as never);
      return;
    }
    if (body.action === "dream") {
      unwrap(await supabase.from("lucy_dreams").insert({ user_id:user.id, original_content:content, dream_date:today(), title:body.title || "Un sueño para recordar" }).select("id").single() as never);
      return;
    }
    const extracted = extract(content);
    let reply = "Gracias por contármelo. Lo guardé en tu historia, con tus palabras.";
    if (extracted.isDream) reply = "Parece que me estás contando un sueño. Lo guardé separado de tu diario para que podamos volver a él cuando quieras.";
    else if (extracted.items.some(x => x.type === "expense")) reply = "Te escucho. Guardé tu relato y registré también el movimiento cotidiano que mencionaste, sin cambiar tus palabras.";
    else if (extracted.hasTask) reply = "Lo guardé. También detecté un pendiente; puedes revisarlo en Objetivos y corregirlo si no quedó como querías.";
    const message = unwrap(await supabase.from("lucy_messages").insert({ user_id:user.id, role:"user", content, source:"text" }).select("id").single() as never) as {id:string};
    const writes: PromiseLike<unknown>[] = [
      supabase.from("lucy_messages").insert({ user_id:user.id, role:"assistant", content:reply, source:"system" }),
      supabase.from("lucy_daily_entries").insert({ user_id:user.id, original_content:content, entry_date:today(), source_message_id:message.id, summary:content.slice(0,110) }),
    ];
    if (extracted.isDream) writes.push(supabase.from("lucy_dreams").insert({ user_id:user.id, original_content:content, dream_date:today(), title:"Sueño registrado con Lucy" }));
    if (extracted.hasTask) writes.push(supabase.from("lucy_goals_tasks").insert({ user_id:user.id, kind:"task", title:content.slice(0,120), status:"pending", source_message_id:message.id }));
    if (extracted.items.length) writes.push(supabase.from("lucy_observations").insert(extracted.items.map(item => ({ ...item, user_id:user.id, source_message_id:message.id }))));
    const saved = await Promise.all(writes);
    const failed = saved.find((r:any) => r.error);
    if (failed) throw (failed as any).error;
  },
  async toggleGoal(id: string, status: string) {
    const user = await requireUser();
    unwrap(await supabase.from("lucy_goals_tasks").update({ status:status === "done" ? "pending" : "done" }).eq("id",id).eq("user_id",user.id) as never);
  },
  async removeDream(id: string) {
    const user = await requireUser();
    unwrap(await supabase.from("lucy_dreams").delete().eq("id",id).eq("user_id",user.id) as never);
  },
};
