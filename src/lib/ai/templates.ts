import { genAI, safeParseJSON, cleanJsonResponse, getAgencyContext, getLocaleLabel, getLocaleWritingRules } from "./config";
import type { TemplateGeneration, WhatsAppTemplateGeneration } from "./types";

export async function generateEmailTemplate(
  industry: string,
  purpose: "initial" | "follow_up" | "breakup",
  tone: string,
  customInstructions?: string
): Promise<TemplateGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const writingRules = getLocaleWritingRules(ctx.country);
  const servicesDesc = ctx.services.map((s) => `- ${s.label}: ${s.description}`).join("\n");

  const purposeMap = {
    initial: "Primer contacto, email inicial de prospección fría",
    follow_up: "Follow-up, segundo o tercer contacto, ángulo diferente, más breve",
    breakup: "Breakup, último mensaje de la secuencia, despedida cordial",
  };

  const wordLimits = {
    initial: "75-125 palabras",
    follow_up: "50-75 palabras",
    breakup: "40-60 palabras",
  };

  const prompt = `Eres un experto en cold email B2B y copywriting para ${ctx.name} (${ctx.url}).
${ctx.description}

GENERA UN TEMPLATE DE EMAIL reutilizable para la industria: "${industry}"
PROPÓSITO: ${purposeMap[purpose]}
TONO: ${tone}
IDIOMA: ${localeLabel}
${customInstructions ? `INSTRUCCIONES ADICIONALES: ${customInstructions}` : ""}

SERVICIOS QUE OFRECEMOS:
${servicesDesc}

PRINCIPIO FUNDAMENTAL - ENFOQUE EN BENEFICIO:
El dueño de negocio NO le importan problemas técnicos. Le importa tener MÁS CLIENTES y MÁS VENTAS. Todo problema debe traducirse a impacto de negocio:
- "Sin SSL" → "Los visitantes ven 'sitio no seguro' y se van a la competencia"
- "No responsive" → "El 70% busca desde el celular y no puede navegar bien por la página"
- "SEO bajo" → "Cuando buscan {{category}} en {{city}}, sale la competencia y ellos no"
- "Sin web" → "Los clientes que buscan en Google no los encuentran"

REGLAS CRÍTICAS DE ANTI-SPAM Y MEJORES PRÁCTICAS (2026):
1. LONGITUD: ${wordLimits[purpose]}. Los emails de más de 150 palabras tienen tasas de respuesta significativamente menores.
2. FORMATO: Texto plano con HTML mínimo (solo <p>, <br>, <b>). SIN imágenes, SIN colores, SIN headers HTML.
3. ASUNTO: 4-7 palabras, sentence case, que genere curiosidad sobre el BENEFICIO, no sobre el problema. Ej: "más clientes para {{business_name}}" NO "problemas en tu web".
4. PALABRAS SPAM PROHIBIDAS: gratis, oferta, garantizado, exclusivo, urgente, actúa ahora, descuento, sin coste, oportunidad única, resultados garantizados, dinero, beneficio, promoción, click aquí, sin compromiso, diagnóstico gratuito.
5. USA ALTERNATIVAS NATURALES: "te preparo un análisis" en vez de "diagnóstico gratuito", "te muestro el potencial" en vez de "oferta exclusiva", "te cuento cómo funciona" en vez de "sin compromiso".
6. PERSONALIZACIÓN: Usa variables {{variable}}. MÍNIMO: {{business_name}} y una referencia específica al negocio.
7. UN SOLO CTA: Pregunta suave orientada al beneficio. Ej: "Te interesaría ver cuánto potencial tiene tu zona?" NO "Agenda una demo ahora".
8. ESTRUCTURA (Framework PAS orientado a beneficio):
   - HOOK: 1-2 frases que demuestren que investigaste el negocio. SIN halagos genéricos.
   - OPORTUNIDAD: 2-3 frases conectando lo detectado con clientes/ventas que podrían captar. NUNCA listes problemas técnicos a secas.
   - CREDIBILIDAD: 1 frase sobre cómo ayudas a negocios similares (sin prometer cifras exactas).
   - CTA: 1 frase, pregunta suave sobre el beneficio.
9. FIRMA: Solo "{{sender_name}}, de ${ctx.name}". NUNCA "Soy ${ctx.name}". NO añadas footer legal ni link de baja (el sistema los inyecta).
10. VARIACIÓN: El template debe sonar natural y humano, NO como un copy publicitario.
11. PARA FOLLOW-UP: Cambia el ángulo. Si el inicial habla de web, el follow-up habla de SEO o IA. Más breve y directo.
12. PARA BREAKUP: Despedida cordial, deja la puerta abierta, sin culpa ni presión.
13. CUMPLIMIENTO LEGAL: El email debe poder identificarse como comunicación comercial. Remitente claramente identificado.
14. NUNCA uses halagos genéricos como "Me encanta lo que hacéis" o "Me encanta lo que hacen".
15. NUNCA prometas resultados exactos, usa lenguaje como "ayudamos a", "conseguimos que".
16. NUNCA uses jerga técnica sin traducirla a impacto: nada de "SSL", "responsive", "SEO" a secas. Siempre explica qué significa para sus clientes/ventas.

ADAPTACIÓN REGIONAL (CRÍTICO):
El template usará la variable {{city}} para personalizar. Adapta el lenguaje al locale: ${localeLabel}. Escribe de forma natural para ese mercado.
${writingRules}

VARIABLES DISPONIBLES para usar en el template:
- {{business_name}}: nombre del negocio
- {{category}}: categoría/industria del negocio
- {{city}}: ciudad del negocio
- {{website}}: sitio web del negocio
- {{issue}}: problema específico detectado en su presencia digital
- {{sender_name}}: nombre del remitente
- {{service}}: servicio recomendado

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "name": "nombre descriptivo corto del template",
  "subject": "asunto del email con {{variables}} si aplica",
  "bodyHtml": "contenido HTML mínimo del email (<p>, <b>, <br>)",
  "bodyText": "versión texto plano del email",
  "variables": ["lista", "de", "variables", "usadas"]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  return safeParseJSON<TemplateGeneration>(jsonStr, "template");
}

export async function generateWhatsAppTemplate(
  industry: string,
  purpose: "initial" | "follow_up" | "breakup",
  tone: string,
  customInstructions?: string
): Promise<WhatsAppTemplateGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const writingRules = getLocaleWritingRules(ctx.country);
  const servicesDesc = ctx.services.map((s) => `- ${s.label}: ${s.description}`).join("\n");

  const purposeMap = {
    initial: "Primer contacto, mensaje inicial de prospección",
    follow_up: "Follow-up, segundo contacto, ángulo diferente, más breve",
    breakup: "Breakup, último mensaje, despedida cordial",
  };

  const prompt = `Eres un experto en ventas B2B por WhatsApp para ${ctx.name} (${ctx.url}).
${ctx.description}

GENERA UN TEMPLATE DE WHATSAPP reutilizable para la industria: "${industry}"
PROPÓSITO: ${purposeMap[purpose]}
TONO: ${tone}
IDIOMA: ${localeLabel}
${customInstructions ? `INSTRUCCIONES ADICIONALES: ${customInstructions}` : ""}

SERVICIOS QUE OFRECEMOS:
${servicesDesc}

PRINCIPIO FUNDAMENTAL - ENFOQUE EN BENEFICIO:
El prospecto tiene que sentir que GANA algo. No le audites ni señales errores: muéstrale cómo puede conseguir MÁS CLIENTES o MÁS VENTAS. Traduce cada problema técnico a impacto de negocio:
- "Sin web" → "los clientes que buscan en Google no te encuentran, se van a la competencia"
- "Web lenta/mal" → "la gente entra, no carga bien y se va"
- "Sin presencia en redes" → "tus competidores están captando a tus clientes potenciales ahí"

REGLAS PARA WHATSAPP B2B (2026):
1. MÁXIMO 500 caracteres. WhatsApp es conversacional, no formal.
2. Saludo breve y natural, como si hablaras con alguien en persona.
3. SIEMPRE traduce problemas a IMPACTO DE NEGOCIO: clientes que pierden, ventas que no llegan, competencia que les gana.
4. NUNCA uses jerga técnica sin explicar qué pierde el negocio: nada de "SSL", "responsive", "SEO" a secas.
5. Si el negocio no tiene web o es de baja calidad, mencionalo como OPORTUNIDAD de crecimiento, no como crítica.
6. Ofrece algo enfocado en resultado: "ver cuántos clientes podrían captar", "análisis del potencial de tu zona". NUNCA "diagnóstico gratuito", "sin compromiso", "gratis".
7. Cierra con pregunta abierta natural para generar respuesta. SIN signo de apertura (¿), solo cierre (?).
8. SIN HTML, SIN formato de email.
9. MÁXIMO 1-2 emojis si el tono lo permite. Preferiblemente 0.
10. Firma: "{{sender_name}}, de ${ctx.name}". NUNCA "Soy ${ctx.name}". Sin links, URLs ni dominios.
11. Debe sonar como un mensaje real de WhatsApp a un conocido profesional, NO como copy publicitario.
12. PROHIBIDO: lenguaje de spam, promesas exageradas, urgencia artificial, "oferta por tiempo limitado", "sin compromiso".
13. USA ALTERNATIVAS NATURALES: "te comento" en vez de "te informo", "vi que" en vez de "he observado", "qué te parece" en vez de "le interesaría".
14. Para FOLLOW-UP: Referencia al mensaje anterior. Más breve. Nuevo ángulo de valor.
15. Para BREAKUP: Cordial, sin presión, deja la puerta abierta.
16. ANTI-BLOQUEO: Los mensajes repetitivos o demasiado comerciales provocan reportes y bloqueo del número. Naturalidad ante todo.
17. PERSONALIZACIÓN: Usa variables {{variable}} para hacer el mensaje específico al prospecto.
18. NO incluyas URLs, links ni dominios en el mensaje. Favorecen detección de spam y bloqueo del número.

ADAPTACIÓN REGIONAL (CRÍTICO):
El template usará la variable {{city}} para personalizar. Adapta el lenguaje al locale: ${localeLabel}. Escribe de forma natural para ese mercado.
${writingRules}

VARIABLES DISPONIBLES:
- {{business_name}}: nombre del negocio
- {{category}}: categoría/industria
- {{city}}: ciudad
- {{issue}}: problema detectado
- {{sender_name}}: nombre del remitente
- {{service}}: servicio recomendado

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "name": "nombre descriptivo corto del template",
  "message": "el mensaje de whatsapp con {{variables}}",
  "variables": ["lista", "de", "variables", "usadas"]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  return safeParseJSON<WhatsAppTemplateGeneration>(jsonStr, "wa-template");
}
