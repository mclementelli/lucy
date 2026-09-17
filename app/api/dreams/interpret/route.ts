import { authenticatedClient, authError } from "../../../server-supabase";
import { structuredResponse } from "../../../openai-server";

export const runtime = "nodejs";
const schema = { type: "object", additionalProperties: false, properties: { interpretation: { type: "string" } }, required: ["interpretation"] };

export async function POST(request: Request) {
  try {
    const { client, user } = await authenticatedClient(request);
    const { dreamId } = await request.json();
    const dream = await client.from("lucy_dreams").select("id,title,original_content,dream_date,emotions,symbols").eq("id", dreamId).eq("user_id", user.id).single();
    if (dream.error) return Response.json({ error: "Sueño no encontrado." }, { status: 404 });
    const memories = await client.from("lucy_memories").select("content,category").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
    if (memories.error) throw memories.error;
    const result = await structuredResponse("lucy_dream", "Explora el sueño en español como hipótesis simbólicas y preguntas de reflexión. Nunca lo presentes como predicción, diagnóstico, recuerdo reprimido ni hecho. Distingue claramente que el relato original no cambia. Sé respetuosa y concisa.", { dream: dream.data, optional_authorized_context: memories.data }, schema);
    const deleted = await client.from("lucy_dream_interpretations").delete().eq("dream_id", dreamId).eq("user_id", user.id);
    if (deleted.error) throw deleted.error;
    const inserted = await client.from("lucy_dream_interpretations").insert({ user_id: user.id, dream_id: dreamId, mode: "symbolic_hypothesis", content: String(result.interpretation), sources: ["dream_original", "authorized_memories"] });
    if (inserted.error) throw inserted.error;
    return Response.json({ ok: true });
  } catch (error) { return authError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { client, user } = await authenticatedClient(request);
    const dreamId = new URL(request.url).searchParams.get("dreamId");
    if (!dreamId) return Response.json({ error: "Falta el sueño." }, { status: 400 });
    const result = await client.from("lucy_dream_interpretations").delete().eq("dream_id", dreamId).eq("user_id", user.id);
    if (result.error) throw result.error;
    return Response.json({ ok: true });
  } catch (error) { return authError(error); }
}
