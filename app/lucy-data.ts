import { supabase } from "./supabase";

export type Period = "week" | "month" | "year";
export type LucyDataSet = { messages:any[]; entries:any[]; dreams:any[]; interpretations:any[]; memories:any[]; goals:any[]; observations:any[]; profile:any|null };
const today=()=>new Date().toISOString().slice(0,10);

async function requireUser(){const {data,error}=await supabase.auth.getUser();if(error||!data.user)throw error??new Error("No hay una sesión válida.");return data.user;}
function unwrap<T>(result:{data:T;error:Error|null}){if(result.error)throw result.error;return result.data;}
async function ownedUpdate(table:string,id:string,values:Record<string,unknown>){const user=await requireUser();unwrap(await supabase.from(table).update(values).eq("id",id).eq("user_id",user.id) as never);}
async function ownedDelete(table:string,id:string){const user=await requireUser();unwrap(await supabase.from(table).delete().eq("id",id).eq("user_id",user.id) as never);}

function extract(content:string){
 const lower=content.toLowerCase();const items:Array<{type:string;value:string;metadata:Record<string,unknown>}>=[];
 for(const match of content.matchAll(/(?:bs\.?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:bs|bolivianos?)/gi)){
  const amount=Number(match[1].replace(",","."));const around=lower.slice(Math.max(0,(match.index??0)-55),(match.index??0)+match[0].length+55);
  const income=/gan[ée]|cobr[ée]|ingres|recib[íi]|vend[íi]|pagaron/.test(around);
  const category=/gasolina|taxi|transporte/.test(around)?"Transporte":/super|mercado|víveres|viveres|comida|pan|leche/.test(around)?"Alimentación":"Otros";
  items.push({type:income?"income":"expense",value:content.slice(0,140),metadata:{amount,currency:"BOB",category,description:content.slice(0,140),extraction:"rule",confirmed:false}});
 }
 for(const emotion of ["cansada","cansado","feliz","triste","tranquila","tranquilo","preocupada","preocupado","ansiosa","ansioso"])if(lower.includes(emotion))items.push({type:"emotion_reported",value:emotion,metadata:{extraction:"reported"}});
 return {items,isDream:/\bsoñ[ée]|\bsueño que|anoche soñ/.test(lower),hasTask:/tengo que|debo |mañana .*?(llamar|hacer|ir|pagar)/.test(lower)};
}

export function periodStart(period:Period,now=new Date()){const start=new Date(now);if(period==="week"){const day=(start.getDay()+6)%7;start.setDate(start.getDate()-day);}else if(period==="month")start.setDate(1);else start.setMonth(0,1);start.setHours(0,0,0,0);return start;}
export function inPeriod(value:string|undefined,period:Period){return Boolean(value&&new Date(value).getTime()>=periodStart(period).getTime());}

export const lucyData={
 async load():Promise<LucyDataSet>{
  const user=await requireUser(),uid=user.id;
  const results=await Promise.all([
   supabase.from("lucy_messages").select("id,role,content,source,created_at").eq("user_id",uid).order("created_at",{ascending:true}).limit(100),
   supabase.from("lucy_daily_entries").select("id,original_content,entry_date,summary,created_at").eq("user_id",uid).order("entry_date",{ascending:false}).order("created_at",{ascending:false}).limit(200),
   supabase.from("lucy_dreams").select("id,original_content,dream_date,title,emotions,symbols,notes,created_at").eq("user_id",uid).order("dream_date",{ascending:false}).limit(100),
   supabase.from("lucy_dream_interpretations").select("id,dream_id,mode,content,sources,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(100),
   supabase.from("lucy_memories").select("id,content,category,confidence,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(200),
   supabase.from("lucy_goals_tasks").select("id,kind,title,status,due_date,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(200),
   supabase.from("lucy_observations").select("id,type,value,metadata,observed_at,created_at").eq("user_id",uid).order("observed_at",{ascending:false}).limit(400),
   supabase.from("lucy_profiles").select("user_id,display_name,preferences,created_at,updated_at").eq("user_id",uid).maybeSingle(),
  ]);
  const [messages,entries,dreams,interpretations,memories,goals,observations,profile]=results.map(r=>unwrap(r as never)) as unknown as [any[],any[],any[],any[],any[],any[],any[],any];
  return {messages,entries,dreams,interpretations,memories,goals,observations,profile};
 },
 async post(body:{action?:string;content:string;title?:string;kind?:string}){
  const user=await requireUser(),content=body.content.trim();if(!content)throw new Error("Escribe algo para guardar.");
  if(body.action==="goal"){unwrap(await supabase.from("lucy_goals_tasks").insert({user_id:user.id,kind:body.kind==="task"?"task":"goal",title:content,status:"pending"}).select("id").single() as never);return;}
  if(body.action==="dream"){unwrap(await supabase.from("lucy_dreams").insert({user_id:user.id,original_content:content,dream_date:today(),title:body.title||"Un sueño para recordar"}).select("id").single() as never);return;}
  const extracted=extract(content);let reply="Gracias por contármelo. Lo guardé en tu historia, con tus palabras.";
  if(extracted.isDream)reply="Parece que me estás contando un sueño. Lo guardé separado de tu diario para que puedas revisarlo.";else if(extracted.items.some(x=>x.type==="expense"||x.type==="income"))reply="Guardé tu relato y registré el movimiento que mencionaste. Puedes corregirlo en Finanzas.";else if(extracted.hasTask)reply="Lo guardé y detecté un pendiente. Puedes revisarlo o corregirlo en Objetivos.";
  const message=unwrap(await supabase.from("lucy_messages").insert({user_id:user.id,role:"user",content,source:"text"}).select("id").single() as never) as {id:string};
  const writes:PromiseLike<unknown>[]=[supabase.from("lucy_messages").insert({user_id:user.id,role:"assistant",content:reply,source:"system"}),supabase.from("lucy_daily_entries").insert({user_id:user.id,original_content:content,entry_date:today(),source_message_id:message.id,summary:content.slice(0,110)})];
  if(extracted.isDream)writes.push(supabase.from("lucy_dreams").insert({user_id:user.id,original_content:content,dream_date:today(),title:"Sueño registrado con Lucy"}));
  if(extracted.hasTask)writes.push(supabase.from("lucy_goals_tasks").insert({user_id:user.id,kind:"task",title:content.slice(0,120),status:"pending",source_message_id:message.id}));
  if(extracted.items.length)writes.push(supabase.from("lucy_observations").insert(extracted.items.map(item=>({...item,user_id:user.id,source_message_id:message.id}))));
  const saved=await Promise.all(writes),failed=saved.find((r:any)=>r.error);if(failed)throw(failed as any).error;
 },
 async createGoal(values:{title:string;kind:"goal"|"task";due_date?:string|null}){const user=await requireUser();unwrap(await supabase.from("lucy_goals_tasks").insert({user_id:user.id,status:"pending",...values}).select("id").single() as never);},
 updateGoal:(id:string,values:Record<string,unknown>)=>ownedUpdate("lucy_goals_tasks",id,values),deleteGoal:(id:string)=>ownedDelete("lucy_goals_tasks",id),toggleGoal:(id:string,status:string)=>ownedUpdate("lucy_goals_tasks",id,{status:status==="done"?"pending":"done"}),
 async createDream(values:{title:string;original_content:string;dream_date:string}){const user=await requireUser();unwrap(await supabase.from("lucy_dreams").insert({user_id:user.id,...values}).select("id").single() as never);},
 updateDream:(id:string,values:Record<string,unknown>)=>ownedUpdate("lucy_dreams",id,values),deleteDream:(id:string)=>ownedDelete("lucy_dreams",id),
 async createMemory(values:{content:string;category:string}){const user=await requireUser();unwrap(await supabase.from("lucy_memories").insert({user_id:user.id,confidence:100,...values}).select("id").single() as never);},
 updateMemory:(id:string,values:Record<string,unknown>)=>ownedUpdate("lucy_memories",id,values),deleteMemory:(id:string)=>ownedDelete("lucy_memories",id),
 async createTransaction(values:{type:"income"|"expense";amount:number;category:string;description:string;date:string}){const user=await requireUser();unwrap(await supabase.from("lucy_observations").insert({user_id:user.id,type:values.type,value:values.description,observed_at:`${values.date}T12:00:00`,metadata:{amount:values.amount,currency:"BOB",category:values.category,description:values.description,confirmed:true,source:"manual"}}).select("id").single() as never);},
 updateTransaction:(id:string,values:{type:string;amount:number;category:string;description:string;date:string})=>ownedUpdate("lucy_observations",id,{type:values.type,value:values.description,observed_at:`${values.date}T12:00:00`,metadata:{amount:values.amount,currency:"BOB",category:values.category,description:values.description,confirmed:true,source:"manual"}}),deleteTransaction:(id:string)=>ownedDelete("lucy_observations",id),
 async saveProfile(display_name:string,preferences:Record<string,unknown>){const user=await requireUser();unwrap(await supabase.from("lucy_profiles").upsert({user_id:user.id,display_name,preferences,updated_at:new Date().toISOString()},{onConflict:"user_id"}).select("user_id").single() as never);},
};
