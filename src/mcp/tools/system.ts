import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, getSetting, setSetting } from "@/db";
import { emails, whatsappMessages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { getEffectiveDailyLimit, isWithinSendWindow } from "@/lib/cron/warmup";
import { checkFullConfig, isSafeSetting, SAFE_SETTINGS_KEYS } from "../helpers/validators.js";

export function registerSystemTools(server: McpServer) {
  server.tool(
    "check_configuration",
    "Check system configuration completeness. Reports missing API keys, settings, and integration status. Run this first before any campaign operations. Never exposes actual API key values.",
    {},
    async () => {
      const checks = checkFullConfig();

      const agencyName = getSetting("agency_name") || "Not set";
      const agencyUrl = getSetting("agency_url") || "Not set";
      const services = getSetting("agency_services") || "None";
      const country = getSetting("target_country") || "Not set";
      const locale = getSetting("locale") || "Not set";

      const lines = [
        "# ProspectAI Configuration Status\n",
        `Agency: ${agencyName} (${agencyUrl})`,
        `Services: ${services}`,
        `Country: ${country} | Locale: ${locale}\n`,
      ];

      let allOk = true;
      for (const [name, check] of Object.entries(checks)) {
        const icon = check.ok ? "OK" : "MISSING";
        lines.push(`## ${name}: ${icon}`);
        if (check.missing.length) {
          allOk = false;
          lines.push(`  Missing: ${check.missing.join(", ")}`);
        }
        if (check.warnings.length) {
          lines.push(`  Warnings: ${check.warnings.join(", ")}`);
        }
      }

      if (!allOk) {
        lines.push("\nAction needed: Configure missing items in the ProspectAI web dashboard or .env file.");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_sending_quota",
    "Get remaining email and WhatsApp sending quota for today. Includes warmup status, daily limits, and send window.",
    {},
    async () => {
      const today = new Date().toISOString().split("T")[0];

      const emailSentToday = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.status, "sent"), sql`date(${emails.sentAt}) = ${today}`))
        .get()?.count ?? 0;

      const effectiveEmailLimit = getEffectiveDailyLimit();

      const waSentToday = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages)
        .where(and(eq(whatsappMessages.status, "sent"), sql`date(${whatsappMessages.sentAt}) = ${today}`))
        .get()?.count ?? 0;

      const waDailyLimit = parseInt(getSetting("wa_daily_limit") || "20");
      const warmupEnabled = getSetting("warmup_enabled") === "true";
      const warmupDay = parseInt(getSetting("warmup_day") || "1");
      const sendWindowOpen = isWithinSendWindow();
      const windowStart = getSetting("send_window_start") || "9";
      const windowEnd = getSetting("send_window_end") || "18";

      const lines = [
        "# Sending Quota\n",
        `## Email`,
        `  Sent today: ${emailSentToday} / ${effectiveEmailLimit}`,
        `  Remaining: ${Math.max(0, effectiveEmailLimit - emailSentToday)}`,
        warmupEnabled ? `  Warmup: Day ${warmupDay} (enabled)` : `  Warmup: disabled`,
        `\n## WhatsApp`,
        `  Sent today: ${waSentToday} / ${waDailyLimit}`,
        `  Remaining: ${Math.max(0, waDailyLimit - waSentToday)}`,
        `\n## Send Window`,
        `  Hours: ${windowStart}:00 - ${windowEnd}:00`,
        `  Currently: ${sendWindowOpen ? "OPEN" : "CLOSED"}`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "check_integrations",
    "Test live connections to Resend and Google Maps scraper. Reports WhatsApp status (managed by web app). Gemini is tested with a minimal call.",
    {},
    async () => {
      const results: Record<string, string> = {};

      // Gemini
      if (process.env.GEMINI_API_KEY) {
        try {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
          await model.generateContent("Reply with OK");
          results.gemini = "Connected";
        } catch (e) {
          results.gemini = `Error: ${e instanceof Error ? e.message : "unknown"}`;
        }
      } else {
        results.gemini = "Not configured (GEMINI_API_KEY missing)";
      }

      // Resend
      if (process.env.RESEND_API_KEY) {
        try {
          const res = await fetch("https://api.resend.com/domains", {
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          });
          results.resend = res.ok ? "Connected" : `Error: HTTP ${res.status}`;
        } catch (e) {
          results.resend = `Error: ${e instanceof Error ? e.message : "unknown"}`;
        }
      } else {
        results.resend = "Not configured (RESEND_API_KEY missing)";
      }

      // Scraper
      const scraperUrl = getSetting("gmaps_scraper_url");
      if (scraperUrl) {
        try {
          const res = await fetch(scraperUrl, { signal: AbortSignal.timeout(5000) });
          results.scraper = res.ok ? "Connected" : `Error: HTTP ${res.status}`;
        } catch (e) {
          results.scraper = `Error: ${e instanceof Error ? e.message : "unreachable"}`;
        }
      } else {
        results.scraper = "Not configured (gmaps_scraper_url missing)";
      }

      // WhatsApp
      results.whatsapp = "Managed by web app process. Check dashboard for connection status.";

      const lines = ["# Integration Status\n"];
      for (const [name, status] of Object.entries(results)) {
        lines.push(`${name}: ${status}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "update_settings",
    `Update operational settings (agency name, tone, daily limits, etc.). Cannot modify API keys, secrets, or auth settings. Allowed keys: ${SAFE_SETTINGS_KEYS.join(", ")}`,
    { settings: z.record(z.string(), z.string()).describe("Key-value pairs to update") },
    async ({ settings: newSettings }) => {
      const updated: string[] = [];
      const blocked: string[] = [];

      for (const [key, value] of Object.entries(newSettings)) {
        if (isSafeSetting(key)) {
          const oldValue = getSetting(key);
          setSetting(key, value);
          if (oldValue !== value) updated.push(key);
        } else {
          blocked.push(key);
        }
      }

      if (updated.length > 0) {
        logActivity("setting_change", `Settings updated via MCP: ${updated.join(", ")}`);
      }

      const lines = [];
      if (updated.length) lines.push(`Updated: ${updated.join(", ")}`);
      if (blocked.length) lines.push(`Blocked (sensitive): ${blocked.join(", ")}`);
      if (!updated.length && !blocked.length) lines.push("No changes made.");

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
