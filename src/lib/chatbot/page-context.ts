// Page awareness for the chat agent. Each dashboard route gets a short, curated
// description — what the window is for, how the user operates it, and which chat
// tools cover those actions — so the assistant can answer page-specific questions
// and proactively offer to do repetitive work by chat instead of by hand.
//
// Kept compact on purpose: `describePage()` injects one block into every /api/chat
// system prompt, so verbosity is a per-request token cost.

export interface PageGuide {
  /** Human label of the window (matches the Spanish UI). */
  title: string;
  /** What the page is for. */
  does: string;
  /** How the user operates it. */
  how: string;
  /** Chat tools / actions that perform the same work without leaving the chat. */
  actions: string;
}

// Keyed by route prefix. Longest-prefix match wins (see describePage), so
// "/campaigns/123" resolves to the "/campaigns" entry.
export const PAGE_GUIDE: Record<string, PageGuide> = {
  "/inicio": {
    title: "Inicio (panel principal)",
    does: "Resumen operativo en vivo: enviados hoy, tasas de apertura/clic/respuesta, rebote, embudo (importados → analizados → redactados → enviados → respuestas), respuestas recientes y actividad semanal.",
    how: "Solo lectura; el selector de campaña arriba filtra todas las métricas. Refresca cada 15s.",
    actions: "get_dashboard, get_campaign_performance, get_sending_quota, get_recent_activity, get_replies.",
  },
  "/review": {
    title: "Revisar (bandeja)",
    does: "Aprobar/rechazar/editar borradores de email y WhatsApp antes de enviar, y responder a respuestas entrantes con sugerencias de la IA. Avisa de contactos duplicados entre campañas.",
    how: "Lista de empresas a la izquierda + detalle a la derecha. Filtros por canal/estado/búsqueda. Modo masivo para aprobar varios.",
    actions: "list_draft_messages, list_whatsapp_drafts, edit_message, approve_messages, reject_messages, get_replies.",
  },
  "/campaigns": {
    title: "Campañas",
    does: "Crear/editar/clonar/eliminar campañas, fijar límite diario, umbral de calidad, tono, perfil y canales (email/WhatsApp), y construir secuencias de seguimiento multi-paso.",
    how: "Tarjeta por campaña con acciones; modal de secuencias para pasos con retardos.",
    actions: "list_campaigns, create_campaign (pregunta siempre los canales), update_campaign, get_campaign_performance.",
  },
  "/profile": {
    title: "Perfil y portafolio",
    does: "Base de conocimiento de la agencia: importar proyectos desde la web propia, añadir/editar casos (problema/solución/métricas/stack/testimonios) y responder la entrevista de enriquecimiento de la IA.",
    how: "Importar por URL, formulario por proyecto, marcar destacados, responder preguntas.",
    actions: "get_profile, update_profile (no fija secretos).",
  },
  "/settings": {
    title: "Configuración",
    does: "Identidad de la agencia, conexiones (email/Resend, WhatsApp, claves Gemini/Anthropic, tracking, webhook CRM), envío (límite, warm-up, ventana horaria), avanzado y sistema (tema, idioma, modos del chat).",
    how: "Pestañas Perfil/Conexiones/Envío/Avanzado/Sistema; botón Guardar. Las claves se prueban en línea.",
    actions: "check_configuration, update_settings (NO acepta claves API ni el QR de WhatsApp). Para conectar WhatsApp usa connect_whatsapp; para Workana, enable_workana_addon + connect_workana.",
  },
  "/leads": {
    title: "Leads",
    does: "Tabla paginada de todos los leads: contacto, ciudad, puntajes (calidad/oportunidad), estado e historial; detalle con análisis web y timeline.",
    how: "Buscar/filtrar por campaña, nombre, categoría, ciudad. Importar/exportar CSV.",
    actions: "search_leads, get_lead_details, update_lead.",
  },
  "/search": {
    title: "Buscar prospectos",
    does: "Buscar negocios en Google Maps por palabra clave, ver resultados (teléfono/web/email/rating) e importarlos como leads de una campaña.",
    how: "Palabra clave + campaña → lanzar; sondea resultados; seleccionar e importar.",
    actions: "start_search (necesita una campaña existente), search_leads.",
  },
  "/templates": {
    title: "Plantillas",
    does: "Plantillas de email y WhatsApp: crear a mano o generarlas con IA por canal/sector/objetivo/tono; ver uso y duplicar.",
    how: "Crear/editar/generar; vista previa y estadísticas de uso.",
    actions: "Gestión vía update_settings/secuencias y el flujo de generación; consulta métricas con get_campaign_performance.",
  },
  "/activity": {
    title: "Actividad (auditoría)",
    does: "Registro paginado de eventos del sistema: importaciones, scraping, generación/envío, cambios y errores.",
    how: "Filtro por tipo; coloreado por evento.",
    actions: "get_recent_activity.",
  },
  "/ab-testing": {
    title: "A/B testing",
    does: "Pruebas A/B por campaña: configurar variantes A/B (tono + instrucciones), seguir resultados y significancia estadística.",
    how: "Crear test, definir variantes, ver ganadora, completar.",
    actions: "get_campaign_performance para métricas; las variantes se gestionan en la campaña.",
  },
  "/blacklist": {
    title: "Lista negra",
    does: "Dominios/emails/teléfonos bloqueados para no contactar (cumplimiento).",
    how: "Añadir/quitar entradas con motivo opcional.",
    actions: "manage_blacklist.",
  },
  "/workana": {
    title: "Workana (add-on)",
    does: "Add-on opt-in: conectar la cuenta de Workana, escanear el feed, evaluar encaje con IA y redactar propuestas (carta + bid + días) para aprobación manual.",
    how: "Conectar (navegador), escanear, revisar/regenerar borradores, aprobar; pestaña de respuestas.",
    actions: "enable_workana_addon, connect_workana, get_workana_status, check_workana_session, run_workana_scan.",
  },
  "/onboarding": {
    title: "Onboarding",
    does: "Asistente inicial de 4 pasos: modo de entrada, extraer agencia desde una URL, editar/enriquecer el perfil y elegir país/idioma/zona horaria.",
    how: "Flujo guiado; necesario antes de usar el panel.",
    actions: "get_profile, update_profile (completeOnboarding=true cuando al menos el nombre esté puesto).",
  },
};

/** Normalize a pathname: drop query/hash and trailing slash. */
function normalize(path: string): string {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "");
  return clean === "" ? "/" : clean;
}

/**
 * Compact, prompt-ready description of the page the user is on, or null when the
 * route is unknown (e.g. /login). Longest-prefix match so nested routes resolve
 * to their section.
 */
export function describePage(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = normalize(path);

  let bestKey: string | null = null;
  for (const key of Object.keys(PAGE_GUIDE)) {
    if ((p === key || p.startsWith(key + "/")) && (!bestKey || key.length > bestKey.length)) {
      bestKey = key;
    }
  }
  if (!bestKey) return null;

  const g = PAGE_GUIDE[bestKey];
  return [
    `CURRENT PAGE: "${g.title}" (${p}).`,
    `What it does: ${g.does}`,
    `How it works: ${g.how}`,
    `You can do this from chat with: ${g.actions}`,
    `Prefer doing it for the user via these tools instead of telling them to click around — especially repetitive work.`,
  ].join("\n");
}
