import { generateStructured } from "@/lib/ai/provider";
import { withRetry } from "@/lib/ai/retry";
import { logger } from "@/lib/logger";
import { getSetting } from "@/db";
import { getAgencyContext, formatAgencyContextBlock } from "@/lib/ai/config";
import { fenced } from "@/lib/ai/fence";
import { ANTI_AI_RULES } from "@/lib/ai/examples";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import { WORKANA_TARGETING_DEFAULT } from "./targeting";
import type { ScrapedProject } from "./types";

/** Effective targeting policy: the user's `workana_targeting` override, or the default. */
function getWorkanaTargeting(): string {
  const override = (getSetting("workana_targeting") || "").trim();
  return override || WORKANA_TARGETING_DEFAULT;
}

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
  "así que solo recomiendas postular cuando el proyecto encaja de verdad con los servicios del perfil, " +
  "entra en el perfil de proyectos que se busca, y hay una probabilidad razonable de ganarlo. " +
  "Priorizas productos de software a medida (SaaS, web, apps, dashboards, CRMs) y descartas no-code, " +
  "automatizaciones sueltas, arreglos de bugs y stacks que no se manejan. Respondes únicamente con el objeto solicitado.";

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
    getWorkanaTargeting(),
    "",
    fenced("PROYECTO PUBLICADO EN WORKANA", projectBlock(project)),
    "",
    "Evalúa si conviene postular. Considera, en este orden:",
    "- Que el proyecto entre en el PERFIL DE PROYECTOS QUE BUSCAMOS de arriba (es el filtro más importante: si cae en 'NO ENCAJAN', shouldBid=false y fitScore 0-20).",
    "- Encaje real entre lo que pide el proyecto y los servicios del perfil (no fuerces encajes).",
    "- Competencia (muchas propuestas ya enviadas reduce las probabilidades).",
    "- Viabilidad económica para el perfil.",
    "Devuelve: shouldBid (true solo si encaja de verdad Y entra en el perfil buscado), fitScore 0-100, reason (breve, en español neutro),",
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
  "Eres un freelancer real escribiendo una propuesta para postular a un proyecto en Workana. " +
  "Escribes de forma ESTÁNDAR, clara y directa, como la mayoría de buenos freelancers: saludas, te presentas en una frase, " +
  "dices que puedes hacerlo y por qué (experiencia real), y propones el siguiente paso. " +
  "NO eres creativo ni ingenioso: nada de frases-gancho, metáforas, juegos de palabras ni aperturas llamativas. " +
  "Esto NO es una landing, un anuncio ni un pitch de ventas; es un mensaje normal de persona a persona. " +
  "Escribes como alguien real, no como una IA ni con plantillas. No inventas casos, datos ni resultados. " +
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
    "PROPUESTAS TUYAS QUE YA APROBASTE Y ENVIASTE (esta es tu MEJOR referencia, IMÍTALAS):",
    "Son tu estándar real de cómo escribes. Copia su tono, su nivel de formalidad, cómo saludas, cómo te presentas, cómo citas tu experiencia y cómo cierras. Si su estilo difiere de las pautas de más abajo, MANDA el estilo de estos ejemplos. NUNCA copies frases ni el contenido concreto: cada propuesta es única para su proyecto.",
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
    "CÓMO ESCRIBIR LA PROPUESTA (estructura estándar de una postulación normal):",
    ...(exBlock
      ? ["Si arriba hay propuestas tuyas de ejemplo, sigue SU estilo y estructura por encima de esta guía; úsala solo como apoyo."]
      : []),
    "Es un mensaje directo para postular, no un texto creativo ni de marketing. Sigue este orden:",
    "1. Saludo simple y preséntate en una frase: quién eres y tu agencia (ej: \"Hola, soy [nombre] y dirijo [agencia]\"). Natural, sin rebuscarlo.",
    "2. Di que puedes hacerlo. Cita un proyecto de tu portafolio SOLO si tiene un paralelismo claro y evidente con lo que pide (mismo tipo de producto o problema). Si lo citas: preséntalo como algo que el cliente NO conoce, descríbelo en pocas palabras (ej: \"en X, un SaaS/sistema que tenemos en producción, hicimos algo muy parecido: ...\") y destaca la feature o el resultado que LO DEFINE y conecta con SU necesidad, no un detalle técnico interno (nada de \"pusimos un middleware\", \"una integración\" o piezas que no impresionan ni te diferencian). Si NINGÚN proyecto encaja de verdad, NO menciones ninguno: habla de tu experiencia en términos generales. Mejor sin ejemplo que con uno forzado o que confunda.",
    "3. Explica en una o dos frases CÓMO lo abordarías para ESTE proyecto (enfoque concreto, no genérico), demostrando que leíste el brief.",
    "4. Cierra breve y en AFIRMATIVO: muestra disponibilidad o un siguiente paso concreto (ej: \"quedo disponible para arrancar cuando quieras\" o \"si te encaja, te paso una propuesta por fases\"). NO cierres con una pregunta para \"afinar detalles\": en Workana el cliente pide tu propuesta directamente, no abrir conversación. Incluye una pregunta SOLO si es un dato OBJETIVAMENTE necesario que condiciona el desarrollo y que no puedes asumir de forma razonable (en ese caso, una sola y concreta).",
    "",
    "NATURALIDAD (que se lea como un mensaje normal, no rebuscado):",
    "- Primera persona, cercano y directo, como hablarías de verdad. Frases de largo variado, alguna corta.",
    "- Estándar y sencillo: NO empieces con una frase ingeniosa, una metáfora ni un gancho. Un saludo normal y al grano.",
    "- Sin guion largo (—). Sin listas ni viñetas dentro de la carta. Sin clichés de venta ni relleno.",
    "- Evita el vocabulario que delata IA (potenciar, robusto, holístico, sinergias, optimizar en exceso). Pero prioriza que suene natural por encima de cualquier prohibición.",
    "- No suene a plantilla, a folleto ni a anuncio. Si una frase no aporta, bórrala.",
    "- Nunca nombres un proyecto del portafolio como si el cliente ya lo conociera ni des por hecho que es famoso. Si lo citas, deja claro que es algo tuyo en producción y enfócate en QUÉ lograste que le sirva a él, no en piezas técnicas internas.",
    "- El cierre con pregunta (\"¿agendamos una llamada?\", \"¿me cuentas más?\") delata IA y sobra en Workana. Por defecto cierra afirmando (disponibilidad o siguiente paso); solo pregunta si es un dato crítico que objetivamente condiciona el trabajo.",
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
