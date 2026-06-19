import { generateStructured } from "@/lib/ai/provider";
import { withRetry } from "@/lib/ai/retry";
import { logger } from "@/lib/logger";
import { getAgencyContext, formatAgencyContextBlock } from "@/lib/ai/config";
import { fenced } from "@/lib/ai/fence";
import { ANTI_AI_RULES } from "@/lib/ai/examples";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import type { ScrapedProject } from "./types";

// Drafting uses Opus 4.8 (subscription via the claude_cli provider). Overridable
// for users whose CLI/plan exposes a different alias.
const DRAFT_MODEL = process.env.WORKANA_DRAFT_MODEL || "claude-opus-4-8";

export interface ProjectEvaluation {
  shouldBid: boolean;
  fitScore: number; // 0-100
  reason: string;
  language: string; // es | pt | en | other
}

export interface ProposalDraft {
  coverLetter: string;
  bidAmount: number | null;
  deliveryDays: number | null;
  screeningAnswers: Array<{ question: string; answer: string }>;
  confidence: number; // 0-100
}

const EVAL_SCHEMA = {
  type: "object",
  properties: {
    shouldBid: { type: "boolean" },
    fitScore: { type: "integer", minimum: 0, maximum: 100 },
    reason: { type: "string" },
    language: { type: "string", enum: ["es", "pt", "en", "other"] },
  },
  required: ["shouldBid", "fitScore", "reason", "language"],
  additionalProperties: false,
} as const;

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    coverLetter: { type: "string" },
    bidAmount: { type: ["number", "null"] },
    deliveryDays: { type: ["integer", "null"] },
    screeningAnswers: {
      type: "array",
      items: {
        type: "object",
        properties: { question: { type: "string" }, answer: { type: "string" } },
        required: ["question", "answer"],
        additionalProperties: false,
      },
    },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
  },
  required: ["coverLetter", "bidAmount", "deliveryDays", "screeningAnswers", "confidence"],
  additionalProperties: false,
} as const;

function projectBlock(p: ScrapedProject): string {
  const lines = [`Título: ${p.title}`];
  if (p.budgetText) lines.push(`Presupuesto indicado: ${p.budgetText}`);
  if (p.skills.length) lines.push(`Habilidades: ${p.skills.join(", ")}`);
  if (p.bidsCount != null) lines.push(`Propuestas ya enviadas: ${p.bidsCount}`);
  lines.push(`Descripción / detalle:\n${p.description || p.rawText}`);
  return lines.join("\n");
}

const EVAL_SYSTEM =
  "Eres un freelancer experto evaluando proyectos en plataformas de trabajo. " +
  "Decides con criterio estricto si vale la pena postular: cada postulación cuesta un recurso escaso, " +
  "así que solo recomiendas postular cuando el proyecto encaja de verdad con los servicios del perfil " +
  "y hay una probabilidad razonable de ganarlo. Respondes únicamente con el objeto solicitado.";

/**
 * Cheap first-stage filter: does this project fit the profile, and how well?
 * Uses the provider's default model (not the costly drafting model).
 */
export async function evaluateProject(
  project: ScrapedProject,
  agencyProfileId?: number | null
): Promise<ProjectEvaluation> {
  const ctx = getAgencyContext(agencyProfileId);
  const prompt = [
    "PERFIL DEL FREELANCER / AGENCIA:",
    // Cheap first-stage filter: skip the portfolio projects, only fit matters here.
    formatAgencyContextBlock(ctx, { maxProjects: 0 }),
    "",
    fenced("PROYECTO PUBLICADO EN WORKANA", projectBlock(project)),
    "",
    "Evalúa si conviene postular. Considera:",
    "- Encaje real entre lo que pide el proyecto y los servicios del perfil (no fuerces encajes).",
    "- Competencia (muchas propuestas ya enviadas reduce las probabilidades).",
    "- Viabilidad económica para el perfil.",
    "Devuelve: shouldBid (true solo si encaja de verdad), fitScore 0-100, reason (breve, en español neutro),",
    "y language: el idioma del proyecto (es, pt, en u other).",
  ].join("\n");

  return withRetry(
    () =>
      generateStructured<ProjectEvaluation>({
        prompt,
        systemPrompt: EVAL_SYSTEM,
        jsonSchema: EVAL_SCHEMA,
        label: "workana-eval",
      }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS }
  );
}

const DRAFT_SYSTEM =
  "Eres un freelancer real que sabe resolver el proyecto y se lo propone directo al cliente para ganarlo en Workana. " +
  "Escribes como una persona concreta, no como una IA ni con plantillas. No es un anuncio: es alguien ofreciendo cómo " +
  "resolver lo que el cliente pide. No inventas casos, datos ni resultados. " +
  "PROHIBIDO usar em-dash o guion largo (el carácter —): usa coma, punto, dos puntos o paréntesis. " +
  "Nunca incluyes contacto fuera de la plataforma (email, teléfono, WhatsApp). Respondes solo con el objeto solicitado.";

/**
 * Predefined tone presets for the "Regenerate" control. Each value is appended to
 * the draft prompt as a requested adjustment. `balanced` is the no-op default.
 * Keep keys in sync with the UI tone selector and the API validation.
 */
export const PROPOSAL_TONE_DIRECTIVES: Record<string, string> = {
  balanced: "",
  direct:
    "Más directo y al grano: menos rodeos, frases más cortas, ve directo a cómo resuelves el problema y recorta cualquier relleno.",
  technical:
    "Más técnico: explica brevemente tu enfoque concreto para este proyecto (cómo lo abordarías, pasos o stack), para un cliente que valora el cómo, sin perder naturalidad.",
  results:
    "Centrado en resultados: conecta lo que harías con un impacto de negocio concreto (más ventas, mejor visibilidad, ahorro de tiempo) y, si encaja de verdad, apóyate en un caso con resultado real.",
};

export interface DraftOptions {
  /** Tone preset directive + custom instructions, already composed. Steers the rewrite. */
  directive?: string;
  /** Past approved/sent cover letters, used as style references (imitate, never copy). */
  examples?: string[];
}

function examplesBlock(examples?: string[]): string {
  const picked = (examples || []).map((e) => (e || "").trim()).filter(Boolean);
  if (!picked.length) return "";
  return [
    "PROPUESTAS TUYAS QUE YA APROBASTE Y ENVIASTE (referencia de TU estilo, ritmo y forma de proponer):",
    "Imita el tono y la estructura, NUNCA copies frases ni el contenido. Cada propuesta es única para su proyecto.",
    picked.map((e, i) => `--- Ejemplo ${i + 1} ---\n${e}`).join("\n\n"),
  ].join("\n");
}

/**
 * Second-stage drafting with Opus 4.8: a tailored cover letter + proposed bid +
 * delivery estimate, written in the project's language. Answers any screening
 * questions found in the brief. `opts.directive` lets the user steer a rewrite
 * (tone preset + free instructions); `opts.examples` seeds the writing with past
 * approved proposals so the style stays consistent and improves over time.
 */
export async function draftProposal(
  project: ScrapedProject,
  evaluation: ProjectEvaluation,
  agencyProfileId?: number | null,
  opts: DraftOptions = {}
): Promise<ProposalDraft> {
  const ctx = getAgencyContext(agencyProfileId);
  const langLabel =
    evaluation.language === "pt" ? "portugués" : evaluation.language === "en" ? "inglés" : "español neutro";
  const directive = (opts.directive || "").trim();
  const exBlock = examplesBlock(opts.examples);
  // Surface the portfolio project that best matches this brief so the draft cites it.
  const relevanceHint = [project.title, project.skills.join(" "), (project.description || project.rawText || "").slice(0, 300)]
    .filter(Boolean)
    .join(" ");
  const prompt = [
    "PERFIL DEL FREELANCER / AGENCIA (escribe como este perfil, en primera persona):",
    formatAgencyContextBlock(ctx, { relevanceHint }),
    "",
    fenced("PROYECTO AL QUE POSTULAS", projectBlock(project)),
    "",
    ...(exBlock ? [exBlock, ""] : []),
    `Redacta la propuesta en ${langLabel} (el idioma del proyecto).`,
    "",
    "CÓMO ESCRIBIR LA PROPUESTA (lo más importante):",
    "Habla como alguien que de verdad puede resolver esto y se lo propone al cliente. No vendas, propón.",
    "1. Abre conectando con SU problema o necesidad concreta (algo del brief que demuestre que lo entendiste). No empieces hablando de ti.",
    "2. Di en una o dos frases CÓMO lo resolverías: tu enfoque concreto para este proyecto, no genérico.",
    "3. Respalda con UN proyecto real parecido de tu portafolio (la sección 'Proyectos del portafolio' o 'Casos de éxito' del perfil): nómbralo, qué resolviste y el resultado concreto. Es tu mayor diferencial frente a otros candidatos. Menciónalo natural, sin presumir. Si ninguno encaja de verdad, no lo fuerces ni inventes.",
    "4. Cierra con una pregunta concreta o un siguiente paso claro que invite a responder.",
    "",
    "NATURALIDAD (que se lea humano, no rebuscado):",
    "- Primera persona, cercano y directo. Frases de largo variado, alguna corta.",
    "- Sin guion largo (—). Sin listas ni viñetas dentro de la carta. Sin clichés de venta ni relleno.",
    "- Evita el vocabulario que delata IA (potenciar, robusto, holístico, sinergias, optimizar en exceso). Pero no te retuerzas por evitar palabras: prioriza que suene natural por encima de cualquier prohibición.",
    "- No suene a plantilla ni a folleto. Si una frase no aporta, bórrala.",
    ...(directive ? ["", `AJUSTE PEDIDO POR EL USUARIO (respétalo sin perder naturalidad): ${directive}`] : []),
    "",
    "Instrucciones de salida:",
    "- coverLetter: carta breve y específica (110-170 palabras), en primera persona y en el idioma del proyecto. Sin datos de contacto externos.",
    "- bidAmount: monto propuesto, coherente con el presupuesto indicado y la moneda del proyecto (número, o null si no hay base).",
    "- deliveryDays: plazo realista en días (entero, o null).",
    "- screeningAnswers: si el proyecto incluye preguntas para el postulante, respóndelas una a una; si no hay, devuelve lista vacía.",
    "- confidence: 0-100, qué tan fuerte es esta propuesta para ganar el proyecto.",
  ].join("\n");

  return withRetry(
    () =>
      generateStructured<ProposalDraft>({
        prompt,
        systemPrompt: DRAFT_SYSTEM,
        jsonSchema: DRAFT_SCHEMA,
        label: "workana-draft",
        model: DRAFT_MODEL,
        maxTokens: 1500,
      }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS }
  );
}

const REPLY_RESPONSE_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" } },
  required: ["reply"],
  additionalProperties: false,
} as const;

/**
 * Suggest a reply to an inbound client message (shown to the user, never auto-sent).
 * The client message is treated strictly as untrusted data, not as instructions.
 */
export async function draftReplyResponse(
  clientMessage: string,
  projectTitle: string | null,
  agencyProfileId?: number | null
): Promise<string | null> {
  const text = (clientMessage || "").trim();
  if (!text) return null;
  const ctx = getAgencyContext(agencyProfileId);
  const prompt = [
    "PERFIL (responde como este perfil, en primera persona):",
    formatAgencyContextBlock(ctx),
    "",
    projectTitle ? `PROYECTO: ${projectTitle.replace(/[\r\n"]+/g, " ").slice(0, 120)}` : "",
    fenced("MENSAJE DEL CLIENTE", text.slice(0, 1500)),
    "",
    ANTI_AI_RULES,
    "",
    "Redacta una respuesta breve (60-120 palabras) en el mismo idioma del cliente, natural y humana.",
    "PROHIBIDO el em-dash o guion largo (—). Responde sus dudas, propón un siguiente paso concreto,",
    "sin incluir contacto fuera de la plataforma.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await withRetry(
      () =>
        generateStructured<{ reply: string }>({
          prompt,
          systemPrompt: DRAFT_SYSTEM,
          jsonSchema: REPLY_RESPONSE_SCHEMA,
          label: "workana-reply",
          model: DRAFT_MODEL,
          maxTokens: 600,
        }),
      { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS }
    );
    return res.reply?.trim() || null;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "workana: draftReplyResponse failed");
    return null;
  }
}
