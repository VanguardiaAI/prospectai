/**
 * Few-shot bank de ejemplos validados con el usuario.
 *
 * Estos ejemplos son la palanca #1 para que el LLM genere copy con tono humano
 * en lugar de "AI smell". Mejor mostrar 3 ejemplos reales del estilo deseado
 * que escribir 30 líneas de instrucciones describiéndolo.
 *
 * Estilos validados:
 * - email: A (ultra directo) / B (cercano profesional) / D (casual)
 * - whatsapp: A (ultra-corto) / B (permission-based) / C (observación + propuesta)
 *
 * Para añadir más ejemplos: mantén el mismo tono. Sin em-dashes. Sin
 * "espero que estés bien". Sin vocabulario AI. Mezcla longitudes de frase.
 */

export type EmailExample = {
  style: "directo" | "cercano" | "casual";
  context: string;
  subject: string;
  body: string;
};

export type WhatsAppExample = {
  style: "directo" | "permission" | "observacion" | "cercano";
  context: string;
  message: string;
};

export type CopyPurpose = "initial" | "follow_up" | "breakup";

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL — INITIAL
// ─────────────────────────────────────────────────────────────────────────────

export const EMAIL_EXAMPLES_INITIAL: EmailExample[] = [
  {
    style: "directo",
    context: "Restaurante España, web no responsive",
    subject: "web de El Rincón de Lola",
    body: `Hola [nombre],

Vi El Rincón de Lola en Sevilla. La carta tiene buenísima pinta, pero la web os está jugando en contra: no carga bien desde el móvil y eso es por donde busca el 70% de la gente que reserva sitio para cenar.

Ayudamos a restaurantes a tener una web que de verdad les traiga reservas, no solo que esté ahí.

¿Te paso un caso de uno parecido al vuestro y vemos si tiene sentido?

Un saludo,
Pablo`,
  },
  {
    style: "cercano",
    context: "Restaurante España, web no responsive",
    subject: "una idea para vuestra web",
    body: `Hola [nombre],

Estaba mirando restaurantes por Sevilla y vi El Rincón de Lola. Las reseñas están muy bien y la propuesta se nota cuidada.

Lo que pasa es que cuando entré a vuestra web desde el móvil, casi me voy. Tarda en cargar y se descuadra. Mucha gente que busca dónde cenar en Sevilla os está encontrando ahí mismo y no se queda.

Trabajamos con restaurantes haciendo que la web haga lo que tiene que hacer: que la persona reserve antes de cerrar la pestaña.

Si quieres te enseño cómo lo planteamos, sin más.

Un saludo,
Pablo`,
  },
  {
    style: "casual",
    context: "Restaurante España, web no responsive",
    subject: "cosa rápida sobre vuestra web",
    body: `Hola [nombre],

Te escribo en plan rápido. El otro día buscaba dónde comer en Triana, vi El Rincón de Lola y entré a la web desde el móvil. Entendí poco y me fui.

No es por daros caña, al revés: la carta y las reseñas valen mucho. Pero la web no acompaña, y ahí se está cayendo gente que ya os tenía elegidos.

Ayudamos a restaurantes con esto. Si quieres te lo cuento en dos líneas.

Pablo`,
  },
  {
    style: "directo",
    context: "Dermatólogo individual España, web vieja",
    subject: "pacientes que buscan dermatólogo en Madrid",
    body: `Hola Carlos,

Vi tu consulta y entré desde el móvil porque quería ver horarios. Casi me voy: la web no carga bien y cuesta encontrar lo básico. La gente que busca dermatólogo en Madrid te está llegando ahí mismo y se está yendo.

Ayudamos a consultas médicas a tener una web que transmita confianza y vaya rellenando la agenda sola, sin depender solo de seguros.

¿Te paso un caso de un dermatólogo parecido y vemos si tiene sentido?

Un saludo,
Pablo`,
  },
  {
    style: "cercano",
    context: "Clínica dental España, mal SEO local",
    subject: "una idea para Clínica Sonríe",
    body: `Hola María,

Estaba mirando dentistas en Valencia y di con Clínica Dental Sonríe. Las reseñas están muy bien y se nota que cuidáis mucho la atención.

Lo que pasa es que cuando busqué "dentista Valencia" en Google, no aparecisteis hasta la página dos. La gente nueva que busca dentista en la ciudad casi nunca pasa de los primeros tres o cuatro resultados, y ahí está la competencia.

Trabajamos con clínicas dentales para que aparezcan justo cuando la gente las necesita, sin que dependa solo de los pacientes de toda la vida.

Si quieres te enseño cómo lo planteamos, sin más.

Un saludo,
Pablo`,
  },
  {
    style: "casual",
    context: "Centro de fisioterapia España, sin reserva online",
    subject: "cosa rápida sobre vuestra web",
    body: `Hola Iker,

Te escribo en plan rápido. El otro día me dolía la espalda, busqué fisio por Indautxu y me topé con Activa. Las reseñas pintaban bien, así que entré a la web. Quería pedir cita pero no podía: solo había un teléfono, eran las once de la noche.

No es por deciros nada malo, al revés: el equipo se ve sólido y el sitio está cuidado. Pero ahí pasa esto: gente que ya os tenía elegidos se cae porque no puede reservar en el momento.

Ayudamos a centros como el vuestro con esto. Si quieres te lo cuento en dos líneas.

Pablo`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL — FOLLOW-UP
// ─────────────────────────────────────────────────────────────────────────────

export const EMAIL_EXAMPLES_FOLLOWUP: EmailExample[] = [
  {
    style: "directo",
    context: "Restaurante España, follow-up tras initial",
    subject: "¿lo viste?",
    body: `Hola [nombre],

La semana pasada te escribí sobre la web de El Rincón de Lola. Igual se te pasó.

Lo resumo: estáis perdiendo gente que ya os tenía elegidos porque la web no carga bien desde el móvil. Es arreglable rápido.

Si te interesa que te enseñe cómo, dime.

Un saludo,
Pablo`,
  },
  {
    style: "cercano",
    context: "Clínica dental España, follow-up cambiando de ángulo a SEO",
    subject: "continuando con lo de Sonríe",
    body: `Hola María,

Te escribí hace unos días sobre Clínica Sonríe, no sé si lo viste en medio del lío del día a día.

Solo te dejo otra forma de verlo: mientras esto no se mueve, los pacientes que buscan dentista en Valencia están aterrizando en otras clínicas. Cada día.

Si quieres que te lo explique en cinco minutos, dime cuándo te va bien.

Un saludo,
Pablo`,
  },
  {
    style: "casual",
    context: "Centro fisio España, follow-up suave",
    subject: "rápido sobre Activa",
    body: `Hola Iker,

Sé que andas a tope, no te robo más de un minuto.

Lo de poder reservar cita desde la web sigue ahí. Mientras tanto, gente que ya os tenía elegidos se está cayendo por no poder cerrar a las once de la noche.

Si te encaja, te lo cuento. Si no, te dejo en paz.

Pablo`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL — BREAKUP
// ─────────────────────────────────────────────────────────────────────────────

export const EMAIL_EXAMPLES_BREAKUP: EmailExample[] = [
  {
    style: "directo",
    context: "Restaurante España, breakup",
    subject: "cierro con esto",
    body: `Hola [nombre],

Es la última vez que os escribo, prometido.

Si más adelante te pica la curiosidad de ver cómo está vuestra web frente a otros restaurantes de Sevilla, escríbeme y te lo paso. Sin más.

Un saludo,
Pablo`,
  },
  {
    style: "cercano",
    context: "Clínica dental España, breakup respetuoso",
    subject: "te dejo descansar",
    body: `Hola María,

Entiendo que no es el momento o que simplemente no encajamos. Sin problema.

Si en algún momento queréis ver cómo otras clínicas dentales de Valencia están captando pacientes desde Google, ya sabes dónde encontrarme.

Un saludo,
Pablo`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP — INITIAL
// ─────────────────────────────────────────────────────────────────────────────

export const WHATSAPP_EXAMPLES_INITIAL: WhatsAppExample[] = [
  {
    style: "directo",
    context: "Taller mecánico México, sin web",
    message: `Hola [nombre], soy Pablo de VanguardIA. Busqué AutoExpress en Google y no encontré web. La gente que busca taller mecánico en Guadalajara los está encontrando, pero a la competencia. Te interesa que te cuente cómo lo arreglamos?`,
  },
  {
    style: "permission",
    context: "Taller mecánico México, sin web",
    message: `Hola [nombre], soy Pablo de VanguardIA. Una pregunta rápida: AutoExpress no aparece en Google cuando alguien busca taller en Guadalajara. Te paso 2 líneas de cómo lo solucionamos para otros talleres parecidos?`,
  },
  {
    style: "observacion",
    context: "Taller mecánico México, sin web",
    message: `Hola [nombre], te escribe Pablo de VanguardIA. Vi AutoExpress y se nota que tienen buena reputación, pero busqué taller en Guadalajara en Google y no aparecen. Eso son clientes que se van a la competencia. Te puedo hacer un análisis de cuántos están perdiendo, te interesa?`,
  },
  {
    style: "directo",
    context: "Cardiólogo individual México (usted, médico senior)",
    message: `Hola Doctor Vargas, soy Pablo de VanguardIA. Busqué cardiólogo en Monterrey en Google y no apareció su consulta. Los pacientes que están buscando ahorita lo están encontrando, pero a la competencia. Le interesa que le cuente cómo lo solucionamos para otros médicos parecidos?`,
  },
  {
    style: "permission",
    context: "Clínica estética España, mal SEO local",
    message: `Hola María, soy Pablo de VanguardIA. Una pregunta rápida: Clínica Bella no aparece en Google cuando alguien busca depilación láser en Sevilla. Te paso 2 líneas de cómo lo solucionamos para otras clínicas estéticas?`,
  },
  {
    style: "observacion",
    context: "Centro médico Colombia, sin reserva online",
    message: `Hola Andrea, te escribe Pablo de VanguardIA. Vi Centro Salud Total y se nota que es una clínica seria, pero la web no permite pedir cita en línea. Eso son pacientes que se cansan de llamar y van a otra. Te puedo armar un análisis de cuánta agenda están perdiendo, te interesa?`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP — FOLLOW-UP
// ─────────────────────────────────────────────────────────────────────────────

export const WHATSAPP_EXAMPLES_FOLLOWUP: WhatsAppExample[] = [
  {
    style: "directo",
    context: "Taller mecánico México, follow-up",
    message: `Hola [nombre], soy Pablo de VanguardIA otra vez. Te escribí hace unos días sobre AutoExpress y no aparecer en Google. Igual se perdió. Te interesa que te lo cuente?`,
  },
  {
    style: "permission",
    context: "Clínica estética España, follow-up",
    message: `Hola María, te escribo otra vez sobre Clínica Bella y la búsqueda de depilación láser en Sevilla. Sé que andas liada. Te paso 2 líneas y ya tú decides si tiene sentido?`,
  },
  {
    style: "observacion",
    context: "Centro médico Colombia, follow-up sobre tema de citas",
    message: `Hola Andrea, te escribí hace unos días sobre el tema de pedir cita en línea en Centro Salud Total. Sigue ahí esa cantidad de pacientes que llaman, no contesta nadie a la primera, y se van. Te animas a verlo?`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP — BREAKUP
// ─────────────────────────────────────────────────────────────────────────────

export const WHATSAPP_EXAMPLES_BREAKUP: WhatsAppExample[] = [
  {
    style: "directo",
    context: "Taller mecánico México, breakup",
    message: `Hola [nombre], última vez, prometido. Si más adelante te interesa que AutoExpress salga en Google cuando alguien busca taller en Guadalajara, escríbeme y lo vemos. Saludos, Pablo.`,
  },
  {
    style: "cercano",
    context: "Clínica estética España, breakup respetuoso",
    message: `Hola María, no quiero seguir ocupando espacio. Si en algún momento queréis ver cómo otras clínicas de Sevilla están captando pacientes desde Google, ya sabes dónde escribirme. Un saludo.`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Formatters para inyectar en el prompt del LLM
// ─────────────────────────────────────────────────────────────────────────────

function pickEmailBank(purpose: CopyPurpose): EmailExample[] {
  if (purpose === "follow_up") return EMAIL_EXAMPLES_FOLLOWUP;
  if (purpose === "breakup") return EMAIL_EXAMPLES_BREAKUP;
  return EMAIL_EXAMPLES_INITIAL;
}

function pickWhatsAppBank(purpose: CopyPurpose): WhatsAppExample[] {
  if (purpose === "follow_up") return WHATSAPP_EXAMPLES_FOLLOWUP;
  if (purpose === "breakup") return WHATSAPP_EXAMPLES_BREAKUP;
  return WHATSAPP_EXAMPLES_INITIAL;
}

/**
 * Devuelve los primeros `maxExamples` ejemplos del bank para `purpose`,
 * ya formateados como bloque de texto listo para concatenar al prompt.
 */
export function formatEmailExamples(purpose: CopyPurpose, maxExamples = 3): string {
  const bank = pickEmailBank(purpose);
  const picked = bank.slice(0, maxExamples);
  if (picked.length === 0) return "";
  return picked
    .map(
      (ex, i) => `EJEMPLO ${i + 1} — estilo "${ex.style}" — ${ex.context}
Asunto: ${ex.subject}
Cuerpo:
${ex.body}`,
    )
    .join("\n\n---\n\n");
}

export function formatWhatsAppExamples(purpose: CopyPurpose, maxExamples = 3): string {
  const bank = pickWhatsAppBank(purpose);
  const picked = bank.slice(0, maxExamples);
  if (picked.length === 0) return "";
  return picked
    .map(
      (ex, i) => `EJEMPLO ${i + 1} — estilo "${ex.style}" — ${ex.context}
${ex.message}`,
    )
    .join("\n\n---\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Banlists y reglas anti-AI-smell (compartidas entre email/whatsapp/templates)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bloque de texto que se inyecta en cada prompt para reducir el "AI smell".
 * Está en español porque las prohibiciones léxicas son específicas del idioma.
 */
export const ANTI_AI_RULES = `REGLAS ANTI-"COPY DE IA" (CRÍTICAS):

VOCABULARIO PROHIBIDO (delata copy generado por IA, NO uses):
aprovechar, profundizar, robusto, fluido, holístico, sinergias, integral, panorama, desbloquear, potenciar, fomentar, navegar (en sentido figurado), revolucionar, transformar, optimizar (en exceso), maximizar, capitalizar.

CONECTORES PROHIBIDOS (suenan a redacción académica, NO uses):
asimismo, en este sentido, cabe destacar, vale la pena mencionar, por otro lado (como conector), en definitiva, en resumen, no obstante (en mensajes informales), es importante destacar que.

APERTURAS PROHIBIDAS (matan el reply rate, NUNCA empieces así):
- "Espero que estés bien" / "Espero que este email te encuentre bien"
- "Mi nombre es X y trabajo en Y"
- "Te escribo porque..."
- "Quería ponerme en contacto..."
- "Estimado/a..." / "A quien corresponda"
- "Reciba un cordial saludo"

CIERRES PROHIBIDOS:
"Atentamente", "Cordiales saludos", "Reciba un cordial saludo".
USA: "Un saludo," (España) o "Quedo atento/a," (LatAm).

VARIACIÓN DE LONGITUD DE FRASE (obligatoria):
Mezcla frases cortas (3-7 palabras) con frases medias o largas (15-25). NUNCA tres frases seguidas del mismo largo. Permite alguna frase incompleta natural ("Sin más.", "Si te encaja.", "Si tiene sentido.").

PALABRAS SPAM (matan deliverability):
gratis, sin compromiso, garantizado, oferta exclusiva, urgente, descuento, sin coste, click aquí, auditoría gratis. USA alternativas naturales: "te paso un análisis", "te enseño cómo", "te lo cuento en dos líneas".`;

export const PERSONA_BLOCK = (fromName: string, agencyName: string) =>
  `PERSONA DEL REMITENTE:
Eres ${fromName}, escribiendo desde ${agencyName}. Es lunes por la mañana, tienes café en la mano y mandas este mensaje entre reuniones, en un par de minutos. NO eres un departamento de marketing escribiendo copy. Eres una persona concreta que ha visto algo de este negocio y tiene una idea para él. Tu objetivo no es vender en este mensaje, es abrir conversación.

Escribes como hablarías a un colega de otro sector que no conoces todavía: con respeto pero sin formalismo, con criterio pero sin venderte, breve porque sabes que el otro está ocupado.`;

export const SELF_CHECK_EMAIL = (maxWords: number) =>
  `ANTES DE RESPONDER, REVISA tu redacción contra estos puntos. Si alguno falla, REESCRIBE antes de devolver el JSON:

1. ¿Hay algún em-dash o guion largo (—)? Reemplaza por coma, punto, dos puntos o paréntesis.
2. ¿Empieza con "Espero que", "Mi nombre es", "Te escribo porque", "Estimado/a", "A quien corresponda"? Reescribe la apertura.
3. ¿Aparece alguna palabra de la VOCABULARIO PROHIBIDO o CONECTORES PROHIBIDOS? Reemplaza.
4. ¿Más de ${maxWords} palabras en el cuerpo? Acorta.
5. ¿Hay tres frases seguidas con la misma longitud? Mezcla cortas y largas.
6. ¿El CTA pide reunión directa, calendario, o suena a vendedor? Suaviza a "interest check" suave.
7. ¿El cierre es "Atentamente" o similar? Cambia a "Un saludo," o "Quedo atento/a,".
8. ¿Suena a plantilla o a folleto en algún punto? Si sí, dale un giro más humano.

Devuelve ÚNICAMENTE la versión final en JSON, ya pasada por estos checks.`;

export const SELF_CHECK_WHATSAPP = `ANTES DE RESPONDER, asegúrate de que el mensaje cumple TODOS estos puntos. Si alguno falla, REESCRIBE:

1. El mensaje es texto plano que el destinatario lee tal cual en su teléfono. Nada más, nada de formato especial.
2. ¿Hay algún em-dash o guion largo (—)? Reemplaza.
3. ¿Algún signo de apertura "¿" o "¡"? Quita (en WhatsApp nadie los usa).
4. ¿Aparece "Espero que estés bien", "Mi nombre es", o palabra de la banlist? Reescribe.
5. ¿Más de 300 caracteres? Acorta.
6. ¿Más de 1 emoji? Quita los extras (mejor 0).
7. ¿Hay algún URL, link o dominio? Quita (genera bloqueo).
8. ¿Pide reunión/llamada/calendario directo? Suaviza a pregunta abierta tipo "te interesa?".
9. ¿Suena a plantilla? Si sí, dale un giro más humano.`;
