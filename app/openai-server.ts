type OpenAIContent = {
  type?: string;
  text?: string;
  refusal?: string;
};

type OpenAIOutput = {
  type?: string;
  content?: OpenAIContent[];
};

type OpenAIResponse = {
  id?: string;
  model?: string;
  status?: string;
  output_text?: string;
  output?: OpenAIOutput[];
  incomplete_details?: { reason?: string } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
  error?: {
    type?: string;
    code?: string;
    param?: string;
    message?: string;
  };
};

function responseDiagnostics(payload: OpenAIResponse, httpStatus: number) {
  return {
    response_id: payload.id,
    model: payload.model,
    http_status: httpStatus,
    response_status: payload.status,
    incomplete_reason: payload.incomplete_details?.reason,
    output_types: payload.output?.map((item) => item.type ?? "unknown"),
    content_types: payload.output?.flatMap((item) =>
      (item.content ?? []).map((content) => content.type ?? "unknown"),
    ),
    usage: payload.usage
      ? {
          input_tokens: payload.usage.input_tokens,
          output_tokens: payload.usage.output_tokens,
          reasoning_tokens: payload.usage.output_tokens_details?.reasoning_tokens,
          total_tokens: payload.usage.total_tokens,
        }
      : undefined,
    error: payload.error
      ? {
          type: payload.error.type,
          code: payload.error.code,
          param: payload.error.param,
        }
      : undefined,
  };
}

export async function structuredResponse(
  name: string,
  instructions: string,
  input: unknown,
  schema: Record<string, unknown>,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.LUCY_AI_MODEL;
  if (!apiKey || !model) throw new Error("La IA de Lucy no está configurada.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input: JSON.stringify(input),
      reasoning: { effort: "low" },
      max_output_tokens: 4000,
      text: {
        format: {
          type: "json_schema",
          name,
          strict: true,
          schema,
        },
      },
    }),
  });

  let payload: OpenAIResponse;
  try {
    payload = (await response.json()) as OpenAIResponse;
  } catch {
    console.error("OpenAI returned a non-JSON response.", {
      http_status: response.status,
    });
    throw new Error("El proveedor de IA no respondió correctamente.");
  }

  const diagnostics = responseDiagnostics(payload, response.status);

  if (!response.ok) {
    console.error("OpenAI request failed.", diagnostics);
    throw new Error("El proveedor de IA no respondió correctamente.");
  }

  if (payload.status === "incomplete") {
    console.error("OpenAI response was incomplete.", diagnostics);
    throw new Error(
      payload.incomplete_details?.reason === "max_output_tokens"
        ? "La respuesta de IA quedó incompleta. Intenta nuevamente."
        : "La respuesta de IA fue interrumpida. Intenta nuevamente.",
    );
  }

  const content = payload.output?.flatMap((item) => item.content ?? []) ?? [];
  const refusal = content.find((item) => item.type === "refusal");

  if (refusal) {
    console.warn("OpenAI refused the structured response.", diagnostics);
    throw new Error("Lucy no puede responder ese contenido de esa manera.");
  }

  const text =
    payload.output_text?.trim() ||
    content
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("")
      .trim();

  if (!text) {
    console.error("OpenAI response contained no output text.", diagnostics);
    throw new Error("La IA no devolvió una respuesta utilizable.");
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    console.error("OpenAI structured output was not valid JSON.", diagnostics);
    throw new Error("La IA devolvió una respuesta inválida. Intenta nuevamente.");
  }
}
