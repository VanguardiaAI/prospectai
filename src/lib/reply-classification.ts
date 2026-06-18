import { generateStructured } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";
import { REPLY_INTENTS, isReplyIntent, type ReplyIntent } from "@/lib/reply-intent";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent"],
  properties: {
    intent: { type: "string", enum: REPLY_INTENTS as unknown as string[] },
  },
};

// Classify an inbound reply's intent using the active AI provider. Best-effort:
// returns null on any failure so reply ingestion is never blocked by the AI.
// NOTE: prompt intentionally avoids the word "JSON" — the claude_cli path passes
// --json-schema which already forces the shape (see ai/provider.ts).
export async function classifyReply(
  body: string | null | undefined,
  channel: "email" | "whatsapp" | "workana"
): Promise<ReplyIntent | null> {
  const text = (body || "").trim();
  if (!text) return null;

  try {
    const res = await generateStructured<{ intent: string }>({
      label: "classify_reply",
      maxTokens: 64,
      systemPrompt:
        "Eres un clasificador de intención de respuestas a prospección B2B en frío. Devuelve únicamente la etiqueta solicitada.",
      jsonSchema: SCHEMA,
      prompt: `Clasifica la intención de esta respuesta (canal: ${channel}). Elige una etiqueta:
- interested: muestra interés, pide información/precio/reunión, responde de forma positiva
- question: hace una pregunta sin comprometerse aún
- not_interested: rechaza o dice que no le interesa
- unsubscribe: pide darse de baja o no recibir más mensajes
- auto_reply: respuesta automática (fuera de oficina, vacaciones, autoresponder)
- other: cualquier otro caso

Respuesta recibida:
"""
${text.slice(0, 1500)}
"""`,
    });
    return isReplyIntent(res?.intent) ? res.intent : "other";
  } catch (err) {
    logger.warn({ err }, "reply classification failed");
    return null;
  }
}
