import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSystemTools } from "./tools/system.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerLeadTools } from "./tools/leads.js";
import { registerMessageTools } from "./tools/messages.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerOrchestrationTools } from "./tools/orchestration.js";
import { registerManagementTools } from "./tools/management.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "ProspectAI",
    version: "1.1.0",
  });

  registerSystemTools(server);
  registerCampaignTools(server);
  registerLeadTools(server);
  registerMessageTools(server);
  registerAnalyticsTools(server);
  registerJobTools(server);
  registerOrchestrationTools(server);
  registerManagementTools(server);

  return server;
}
