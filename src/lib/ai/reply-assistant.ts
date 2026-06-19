import { generateStructured } from "./provider";
import { withRetry } from "@/lib/ai/retry";
import { logger } from "@/lib/logger";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import { getAgencyContext, formatAgencyContextBlock, getLocaleLabel, getLocaleWritingRules } from "./config";
import { fenced } from "./fence";
import { ANTI_AI_RULES } from "./examples";
import { getLeadConversation, formatConversation } from "@/lib/conversation";

// Replies use Opus 4.8 (subscription via claude_cli) like the Workana drafter.
const REPLY_MODEL = process.env.REPLY_DRAFT_MODEL || "claude-opus-4-8";

const REPLY_SYSTEM =
  "Eres la persona real que hace el trabajo en una agencia y le responde a un prospecto que contestó tu mensaje. " +
  "Escribes natural y directo, como una persona concreta, nunca como una IA ni con plantillas. No inventas casos, " +
  "datos, precios ni resultados. PROHIBIDO usar em-dash o guion largo (el carácter —): usa coma, punto, dos puntos o " +
  "paréntesis. Nunca incluyes contacto fuera del canal. Respondes solo con el objeto solicitado.";

const REPLY_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" } },
  required: ["reply"],
  additionalProperties: false,
} as const;

export interface DraftReplyInput {
  leadId: number;
  channel: "email" | "whatsapp";
  /** The inbound message we're answering (treated strictly as untrusted data). */
  latestInboundText: string;
  agencyProfileId?: number | null;
  leadName?: string | null;
  leadCategory?: string | null;
  leadCountry?: string | null;
  fromName?: string | null;
  /** Optional user steer for a regenerate (e.g. "más corto", "ofrece una llamada"). */
  instructions?: string;
}

/**
 * Draft a suggested reply to a prospect, using the full prior conversation plus the
 * enriched agency knowledge base. Never auto-sent — the user reviews/edits/approves.
 * The inbound message is fenced as untrusted data (prompt-injection guard).
 */
export async function draftConversationReply(input: DraftReplyInput): Promise<string | null> {
  const text = (input.latestInboundText || "").trim();
  if (!text) return null;

  const ctx = getAgencyContext(input.agencyProfileId);
  const country = input.leadCountry || ctx.country;
  const localeLabel = getLocaleLabel(country);
  const writingRules = getLocaleWritingRules(country);
  const fromName = input.fromName || ctx.ownerName || ctx.name;

  const turns = getLeadConversation(input.leadId);
  const thread = formatConversation(turns, fromName || "Nosotros", input.leadName || "Cliente");
  const relevanceHint = [input.leadCategory, text].filter(Boolean).join(" ");

  const channelRules =
    input.channel === "whatsapp"
      ? [
          "Es una respuesta de WhatsApp: máximo 500 caracteres, conversacional, en una sola burbuja.",
          "CERO links, URLs o dominios. Cero o máximo 1 emoji.",
        ]
      : [
          "Es una respuesta de email: saludo breve + cuerpo claro. No escribas asunto (se reutiliza el del hilo).",
          "Concisa (80-160 palabras). Sin firma ni pie legal (se inyectan aparte).",
        ];

  const prompt = [
    "PERFIL (responde como este perfil, en primera persona, como una persona real):",
    formatAgencyContextBlock(ctx, { relevanceHint, maxProjects: input.channel === "whatsapp" ? 2 : 4 }),
    "",
    `Quien escribe se llama ${fromName}${ctx.name ? `, de ${ctx.name}` : ""}.`,
    thread ? `CONVERSACIÓN HASTA AHORA (de más antigua a más reciente):\n${thread}` : "",
    "",
    fenced("ÚLTIMO MENSAJE DEL PROSPECTO (al que respondes)", text.slice(0, 1500)),
    "",
    ANTI_AI_RULES,
    "",
    `Idioma de la respuesta: ${localeLabel}.`,
    ...channelRules,
    "Responde de forma útil y humana: contesta lo que pregunta o plantea y avanza la conversación con un siguiente paso concreto.",
    "Si en el contexto hay un proyecto del portafolio que encaje, úsalo como prueba breve y concreta, sin inventar ni exagerar.",
    "Nunca inventes precios o plazos que no sepas; si no los sabes, propón hablarlos. Nunca incluyas contacto fuera del canal.",
    ...(input.instructions ? ["", `AJUSTE PEDIDO POR EL USUARIO (respétalo sin perder naturalidad): ${input.instructions.trim()}`] : []),
    writingRules,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await withRetry(
      () =>
        generateStructured<{ reply: string }>({
          prompt,
          systemPrompt: REPLY_SYSTEM,
          jsonSchema: REPLY_SCHEMA,
          label: "reply-assistant",
          model: REPLY_MODEL,
          maxTokens: 700,
        }),
      { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "reply-assistant" },
    );
    return res.reply?.trim() || null;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "reply-assistant: draftConversationReply failed");
    return null;
  }
}
