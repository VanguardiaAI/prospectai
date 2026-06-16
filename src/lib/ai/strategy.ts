// Per-campaign copy angle. The returned block is injected into the generation
// prompt through the existing `customInstructions` channel so the model leads
// with the right offer for each campaign profile. Prices never go in the copy.

export type CampaignStrategy = "web_design" | "seo_visibility";

const DIRECTIVES: Record<CampaignStrategy, string> = {
  web_design: `ENFOQUE DE ESTA CAMPAÑA — DISEÑO WEB:
El problema central a vender es su SITIO WEB (malo, anticuado o inexistente) y cómo eso le cuesta clientes. Lidera el mensaje con eso. El servicio que ofreces es crear o renovar su web. Puedes mencionar visibilidad/SEO solo si encaja de forma natural como complemento, sin que sea el centro. NO menciones precios.`,

  seo_visibility: `ENFOQUE DE ESTA CAMPAÑA — VISIBILIDAD EN GOOGLE (SEO):
El servicio a vender es VISIBILIDAD: que aparezcan en Google cuando la gente busca su tipo de negocio en su zona. Ángulo central: hoy, cuando alguien busca "[su categoría] en [su ciudad]", aparece la competencia y ellos no, así que pierden clientes que YA los están buscando. Ofrece posicionarlos (SEO local, optimizar su ficha de Google, aparecer en el mapa y en directorios, reseñas). Es un servicio CONTINUO que les trae clientes mes a mes, no un arreglo puntual. NO propongas rediseñar su web salvo que esté rota o sea un obstáculo real. NO menciones precios.`,
};

/** Returns the campaign angle directive, or "" for unknown/unset strategies. */
export function campaignStrategyDirective(strategy?: string | null): string {
  if (strategy === "web_design" || strategy === "seo_visibility") {
    return DIRECTIVES[strategy];
  }
  return "";
}

/** Merge the campaign angle with any existing custom instructions. */
export function withStrategyDirective(
  strategy: string | null | undefined,
  existing?: string | null,
): string | undefined {
  const merged = [campaignStrategyDirective(strategy), existing]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .join("\n\n");
  return merged || undefined;
}
