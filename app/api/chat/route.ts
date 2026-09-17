import { authenticatedClient, authError } from "../../server-supabase";
import { structuredResponse } from "../../openai-server";

export const runtime = "nodejs";

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    reply: { type: "string" },
    summary: { type: "string" },
    is_dream: { type: "boolean" },
    actions: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      type: { type: "string", enum: ["income", "expense", "emotion", "task", "memory"] },
      value: { type: "string" }, amount: { type: "number" }, category: { type: "string" }, confidence: { type: "number" },
    }, required: ["type", "value", "amount", "category", "confidence"] } },
  }, required: ["reply", "summary", "is_dream", "actions"],
};

export async function POST(request: Request) {
  try {
    const { client, user } = await authenticatedClient(request);
    const body = await request.json();
    const content = String(body.content || "").trim();
    if (!content || content.length > 8000) return Response.json({ error: "El mensaje está vacío o es demasiado largo." }, { status: 400 });
    const [messages, memories, goals, observations] = await Promise.all([
      client.from("lucy_messages").select("role,content,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(12),
      client.from("lucy_memories").select("content,category").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
      client.from("lucy_goals_tasks").select("kind,title,status,due_date").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
      client.from("lucy_observations").select("type,value,metadata,observed_at").eq("user_id", user.id).order("observed_at", { ascending: false }).limit(10),
    ]);
    for (const result of [messages, memories, goals, observations]) if (result.error) throw result.error;
    const result = await structuredResponse("lucy_conversation", `Eres Lucy, acompañante reflexiva y diario conversacional en español. Responde con calidez y brevedad. No diagnostiques, no sustituyas profesionales y no presentes inferencias como hechos. Usa solo el contexto entregado y reconoce cuando faltan datos. Extrae acciones únicamente cuando el usuario las afirmó claramente. Para montos no financieros usa amount=0; para campos no aplicables usa cadena vacía. Las memorias deben ser hechos estables explícitos, nunca inferencias.`, {
      current_message: content,
      recent_conversation: [...(messages.data ?? [])].reverse(),
      authorized_context: { memories: memories.data, goals: goals.data, recent_observations: observations.data },
    }, schema);
    const userMessage = await client.from("lucy_messages").insert({ user_id: user.id, role: "user", content, source: "text" }).select("id").single();
    if (userMessage.error) throw userMessage.error;
    const actions = Array.isArray(result.actions) ? result.actions as Array<Record<string, unknown>> : [];
    const writes: PromiseLike<unknown>[] = [
      client.from("lucy_messages").insert({ user_id: user.id, role: "assistant", content: String(result.reply), source: "openai" }),
      client.from("lucy_daily_entries").insert({ user_id: user.id, original_content: content, entry_date: new Date().toISOString().slice(0, 10), source_message_id: userMessage.data.id, summary: String(result.summary).slice(0, 180) }),
    ];
    if (result.is_dream === true) writes.push(client.from("lucy_dreams").insert({ user_id: user.id, original_content: content, dream_date: new Date().toISOString().slice(0, 10), title: String(result.summary).slice(0, 100) || "Sueño registrado con Lucy" }));
    const taskRows = actions.filter((a) => a.type === "task" && Number(a.confidence) >= 0.75).map((a) => ({ user_id: user.id, kind: "task", title: String(a.value).slice(0, 180), status: "pending", source_message_id: userMessage.data.id }));
    if (taskRows.length) writes.push(client.from("lucy_goals_tasks").insert(taskRows));
    const memoryRows = actions.filter((a) => a.type === "memory" && Number(a.confidence) >= 0.85).map((a) => ({ user_id: user.id, content: String(a.value).slice(0, 500), category: String(a.category || "context"), confidence: Math.round(Number(a.confidence) * 100), source_message_id: userMessage.data.id }));
    if (memoryRows.length) writes.push(client.from("lucy_memories").insert(memoryRows));
    const observationRows = actions.filter((a) => ["income", "expense", "emotion"].includes(String(a.type)) && Number(a.confidence) >= 0.75).map((a) => ({
      user_id: user.id, type: a.type === "emotion" ? "emotion_reported" : a.type, value: String(a.value).slice(0, 500), source_message_id: userMessage.data.id,
      metadata: a.type === "emotion" ? { extraction: "ai", confidence: a.confidence } : { amount: Number(a.amount), currency: "BOB", category: String(a.category || "Otros"), description: String(a.value), extraction: "ai", confirmed: false, confidence: a.confidence },
    }));
    if (observationRows.length) writes.push(client.from("lucy_observations").insert(observationRows));
    const saved = await Promise.all(writes);
    const failed = saved.find((item) => typeof item === "object" && item && "error" in item && item.error);
    if (failed && typeof failed === "object" && "error" in failed) throw failed.error;
    return Response.json({ ok: true });
  } catch (error) { return authError(error); }
}
