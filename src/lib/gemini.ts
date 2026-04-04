// Re-export everything from the new ai/ module for backwards compatibility
export {
  analyzeWebsite,
  generateEmail,
  regenerateEmail,
  generateWhatsApp,
  regenerateWhatsApp,
  generateEmailTemplate,
  generateWhatsAppTemplate,
  detectCountryFromPhone,
  SERVICE_DEFINITIONS,
  getEnabledServices,
  defaultWebAnalysis,
} from "./ai";
export type {
  WebAnalysis,
  EmailGeneration,
  WhatsAppGeneration,
  TemplateGeneration,
  WhatsAppTemplateGeneration,
} from "./ai";
