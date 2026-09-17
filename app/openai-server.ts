type OpenAIResponse = { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };

export async function structuredResponse(name: string, instructions: string, input: unknown, schema: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.LUCY_AI_MODEL;
  if (!apiKey || !model) throw new Error("La IA de Lucy no está configurada.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: 900,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  const payload = await response.json() as OpenAIResponse & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "El proveedor de IA no respondió correctamente.");
  const text = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("La IA no devolvió una respuesta utilizable.");
  return JSON.parse(text) as Record<string, unknown>;
}
