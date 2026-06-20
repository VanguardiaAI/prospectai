/**
 * Workana targeting policy: which kinds of projects we actually want to bid on.
 *
 * The general Workana feed is a firehose (writing, design, data-entry, no-code,
 * automations…). The agency profile alone biases the evaluator toward whatever
 * the profile emphasizes (often AI/automation), so on Workana we want a separate,
 * explicit preference: real software products built on web + Python, not generic
 * automation/no-code gigs, bug-fixes or deploy-only jobs.
 *
 * This is the DEFAULT. The user can override it with the `workana_targeting`
 * setting (edited from the Workana page or via the chatbot). Kept import-free so it
 * is safe to import from both the server (evaluator) and the client (settings UI).
 */
export const WORKANA_TARGETING_DEFAULT = `PERFIL DE PROYECTOS QUE BUSCAMOS EN WORKANA (aplica este criterio para decidir shouldBid y fitScore):

PRIORIDAD ALTA (lo que más nos interesa; reserva los fitScore altos, 80-100, para esto):
- SaaS y productos web a medida.
- Aplicaciones web (portales, plataformas, herramientas internas).
- Dashboards, paneles de administración y CRMs.
- Sitios y páginas web, landing pages, rediseños y desarrollo web a medida.
- Integrar IA DENTRO de una app o producto web real (features con IA, asistentes embebidos, búsqueda semántica, etc.).
- Stack principalmente web (JavaScript/TypeScript, React/Next.js, Node) y Python.

PRIORIDAD SECUNDARIA (encajan y los tomamos, pero su fitScore NO debe superar al de un proyecto de prioridad alta de encaje similar; mantenlos en torno a 55-70 aunque encajen perfecto):
- Aplicaciones móviles (iOS/Android) y MVPs móviles.
- Chatbots y asistentes conversacionales construidos a medida CON código (Python/JS), no con herramientas no-code.

Plus (no requisito, suma un poco): sector salud/médico y clientes de España o México.

NO ENCAJAN (shouldBid=false y fitScore bajo, 0-20, aunque el presupuesto o el cliente sean atractivos):
- No-code / low-code (Bubble, Webflow como no-code, etc.) y automatizaciones con n8n, Make o Zapier.
- Shopify, WordPress / WooCommerce, plantillas o temas.
- Stacks que no hacemos: PHP, Rust, C++, C# / .NET, Java.
- Solo arreglar bugs, mantenimiento puntual, o solo desplegar / poner en producción algo ya hecho.
- Automatizaciones genéricas o "bots" que solo conectan herramientas sin desarrollo real de producto.

Reglas de puntuación:
- Un proyecto de PRIORIDAD ALTA con buen encaje puede llegar a fitScore alto (80-100).
- Un proyecto SECUNDARIO (app móvil o chatbot), aunque encaje perfecto, NO debe puntuar por encima de un web/SaaS/CRM comparable: mantenlo en torno a 55-70.
- Si cae en "NO ENCAJAN", shouldBid=false y fitScore 0-20, aunque parezca rentable.
- El sector salud y España/México suman, pero no descartes un buen proyecto solo por el país.`;
