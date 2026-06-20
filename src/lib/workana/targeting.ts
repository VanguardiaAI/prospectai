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

ENCAJAN (sube el fitScore; shouldBid=true si además hay un encaje real con el perfil):
- Productos de software a medida: SaaS, aplicaciones web, apps móviles (iOS/Android), MVPs.
- Sitios y páginas web, landing pages, rediseños y desarrollo web a medida.
- Dashboards, paneles de administración, CRMs y herramientas internas.
- Integrar IA DENTRO de una app o producto real (features con IA, asistentes embebidos, búsqueda semántica, etc.).
- Stack principalmente web (JavaScript/TypeScript, React/Next.js, Node) y Python.
- Plus (no requisito): proyectos del sector salud/médico, y clientes de España o México.

NO ENCAJAN (shouldBid=false y fitScore bajo, 0-20, aunque el presupuesto o el cliente sean atractivos):
- No-code / low-code (Bubble, Webflow como no-code, etc.) y automatizaciones con n8n, Make o Zapier.
- Shopify, WordPress / WooCommerce, plantillas o temas.
- Stacks que no hacemos: PHP, Rust, C++, C# / .NET, Java.
- Solo arreglar bugs, mantenimiento puntual, o solo desplegar / poner en producción algo ya hecho.
- Automatizaciones genéricas o "bots con IA" sueltos que no son un producto ni una app real.

Regla: si el proyecto cae en "NO ENCAJAN", marca shouldBid=false aunque parezca rentable. El sector salud y los clientes de España/México suman, pero no descartes un buen proyecto solo por el país.`;
