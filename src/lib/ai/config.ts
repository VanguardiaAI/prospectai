import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSetting } from "@/db";

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export function safeParseJSON<T>(jsonStr: string, label: string): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch (e) {
    throw new Error(`Failed to parse Gemini ${label} response: ${(e as Error).message}. Raw: ${jsonStr.slice(0, 200)}`);
  }
}

export function cleanJsonResponse(text: string): string {
  return text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

// --- Service definitions ---

export const SERVICE_DEFINITIONS: Record<string, { label: string; description: string }> = {
  web_development: {
    label: "Web Development",
    description: "Professional website design and development, landing pages, e-commerce and web applications",
  },
  seo: {
    label: "SEO",
    description: "Search engine optimization, SEO audits, content strategy and organic ranking",
  },
  ai_agents: {
    label: "AI / Chatbots",
    description: "AI-powered virtual assistants for customer service, bookings, automated FAQs and process automation",
  },
  google_business: {
    label: "Google Business Profile",
    description: "Google listing optimization, review management, photos, posts and local SEO",
  },
  social_media: {
    label: "Social Media",
    description: "Social media management, content strategy, Meta/TikTok advertising and community management",
  },
};

export function getEnabledServices(): { key: string; label: string; description: string }[] {
  const raw = getSetting("agency_services") || "web_development";
  return raw.split(",").map((s) => s.trim()).filter(Boolean).map((key) => ({
    key,
    label: SERVICE_DEFINITIONS[key]?.label || key,
    description: SERVICE_DEFINITIONS[key]?.description || key,
  }));
}

// --- Agency context helper ---

export interface AgencyContext {
  name: string;
  url: string;
  description: string;
  services: { key: string; label: string; description: string }[];
  country: string;
  locale: string;
}

export function getAgencyContext(): AgencyContext {
  return {
    name: getSetting("agency_name") || "ProspectAI",
    url: getSetting("agency_url") || "",
    description: getSetting("agency_description") || "",
    services: getEnabledServices(),
    country: getSetting("target_country") || "US",
    locale: getSetting("locale") || "en-US",
  };
}

// --- Locale helpers ---

export function getLocaleLabel(country: string): string {
  const map: Record<string, string> = {
    ES: "español (España)",
    MX: "español (México)",
    AR: "español (Argentina)",
    CO: "español (Colombia)",
    CL: "español (Chile)",
    PE: "español (Perú)",
    EC: "español (Ecuador)",
    UY: "español (Uruguay)",
    US: "inglés (Estados Unidos)",
    UK: "inglés (Reino Unido)",
    CA: "inglés (Canadá)",
    AU: "inglés (Australia)",
    BR: "portugués (Brasil)",
    PT: "portugués (Portugal)",
    FR: "francés (Francia)",
    DE: "alemán (Alemania)",
    IT: "italiano (Italia)",
    NL: "neerlandés (Países Bajos)",
  };
  return map[country] || "English";
}

export function getLocaleWritingRules(country: string): string {
  const formatting = `- NUNCA uses em dash (—) ni guion largo. Usa comas, puntos o guiones cortos (-) para separar ideas.
- NUNCA uses signo de exclamación de apertura (¡). Solo usa el de cierre (!) cuando sea estrictamente necesario.
- NUNCA uses signo de interrogación de apertura (¿) en mensajes de WhatsApp. En WhatsApp nadie lo usa, queda robótico. Solo usa el de cierre (?). En emails sí puedes usarlo si la región lo requiere.
- Preséntate SIEMPRE como una persona real: "Soy [nombre], de [empresa]". NUNCA digas "Soy [empresa]" ni te presentes como si fueras la empresa misma.
- Escribe de forma natural y humana. Evita construcciones rígidas o que suenen a copy publicitario.
- SIEMPRE conecta cualquier problema detectado con un IMPACTO DE NEGOCIO concreto: pérdida de clientes, menos ventas, peor visibilidad, etc. NUNCA listes problemas técnicos sin explicar qué pierde el negocio por eso.`;

  const regional: Record<string, string> = {
    ES: `- Región: España. Usa "tú" y "vosotros" de forma natural.
- El registro debe sonar como un profesional español hablando a otro profesional.`,
    MX: `- Región: México. Usa "tú" y "ustedes". NUNCA uses "vosotros", "habéis", "tenéis", "hacéis", "podéis" ni NINGUNA forma verbal con -éis/-áis.
- No uses modismos de España: "mola", "tío", "vale" (como afirmación), "quedamos", "currar", "genial" en exceso.
- El registro debe sonar como un profesional mexicano hablando a otro profesional mexicano.`,
    AR: `- Región: Argentina. Usa "vos" y "ustedes". NUNCA uses "vosotros" ni "tú".
- Conjugaciones de voseo: "tenés", "sabés", "podés", "querés".
- El registro debe sonar como un profesional argentino hablando a otro profesional.`,
    CO: `- Región: Colombia. Usa "tú" o "usted" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional colombiano hablando a otro profesional.`,
    CL: `- Región: Chile. Usa "tú" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional chileno hablando a otro profesional.`,
    PE: `- Región: Perú. Usa "tú" o "usted" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional peruano hablando a otro profesional.`,
    EC: `- Región: Ecuador. Usa "tú" o "usted" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional ecuatoriano hablando a otro profesional.`,
    UY: `- Región: Uruguay. Usa "tú" o "vos" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional uruguayo hablando a otro profesional.`,
    US: `- Region: United States. Write in casual professional American English.`,
    UK: `- Region: United Kingdom. Write in professional British English.`,
    CA: `- Region: Canada. Write in professional Canadian English.`,
    AU: `- Region: Australia. Write in professional Australian English.`,
    BR: `- Região: Brasil. Escreva em português brasileiro profissional. NUNCA use português europeu.`,
    PT: `- Região: Portugal. Escreva em português europeu profissional.`,
    FR: `- Région: France. Écrivez en français professionnel.`,
    DE: `- Region: Deutschland. Schreiben Sie in professionellem Deutsch.`,
    IT: `- Regione: Italia. Scrivi in italiano professionale.`,
    NL: `- Regio: Nederland. Schrijf in professioneel Nederlands.`,
  };

  return `${formatting}\n${regional[country] || ""}`;
}
