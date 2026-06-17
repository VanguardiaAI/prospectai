import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db, getSetting, setSetting, getApiKey } from "@/db";
import { leads, sequenceEnrollments, replies } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { triggerCrmWebhook } from "@/lib/crm-webhook";
import { prioritizeLeadOnReply } from "@/lib/lead-prioritization";
import { markUnsubscribed } from "@/lib/unsubscribe";
import { classifyReply } from "@/lib/reply-classification";
import { logger } from "@/lib/logger";

interface EmailRepliesResult {
  processed: number;
  matched: number;
  reason?: string;
}

/**
 * Poll the configured IMAP mailbox for new replies and record them.
 *
 * Resend has no outbound "reply" webhook, so cold-email replies are captured by
 * reading a real mailbox (the address used as `reply_to`) over IMAP. Works from
 * localhost — no public URL required. Tracks the last processed UID so each
 * message is ingested once; on first run it skips the existing backlog.
 */
export async function processEmailReplies(): Promise<EmailRepliesResult> {
  if (getSetting("imap_enabled") !== "true") {
    return { processed: 0, matched: 0, reason: "IMAP disabled" };
  }

  const host = getSetting("imap_host") || "";
  const user = getSetting("imap_user") || "";
  const pass = getSetting("imap_password") || process.env.IMAP_PASSWORD || "";
  const port = parseInt(getSetting("imap_port") || "993", 10);

  if (!host || !user || !pass) {
    return { processed: 0, matched: 0, reason: "IMAP not configured" };
  }

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass },
    logger: false,
  });

  let processed = 0;
  let matched = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uidNext = client.mailbox && typeof client.mailbox === "object" ? client.mailbox.uidNext : undefined;
      const stored = getSetting("imap_last_uid");

      // First run: don't ingest the existing backlog — start watching from now.
      if (stored === null || stored === "" || stored === "0") {
        const baseline = uidNext ? uidNext - 1 : 0;
        setSetting("imap_last_uid", String(baseline));
        return { processed: 0, matched: 0, reason: "Initialized baseline" };
      }

      const lastUid = parseInt(stored, 10);
      let maxUid = lastUid;

      for await (const msg of client.fetch({ uid: `${lastUid + 1}:*` }, { uid: true, source: true })) {
        if (!msg.uid || msg.uid <= lastUid) continue;
        maxUid = Math.max(maxUid, msg.uid);
        processed++;

        try {
          const parsed = await simpleParser(msg.source as Buffer);
          const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase().trim();
          if (!fromAddr) continue;

          const body = (parsed.text || parsed.html || "").toString().slice(0, 5000);

          // Match a lead by any of its email fields (case-insensitive)
          const lead = db.select().from(leads)
            .where(sql`lower(${leads.email}) = ${fromAddr} OR lower(${leads.contactEmail}) = ${fromAddr} OR lower(${leads.extractedEmail}) = ${fromAddr}`)
            .get();

          if (!lead) continue;
          matched++;

          // An explicit opt-out short-circuits the AI classifier.
          const subject = (parsed.subject || "").toLowerCase();
          const isUnsub = /unsubscribe/.test(subject) || /\b(baja|darme de baja|no quiero recibir|remove me|unsubscribe)\b/i.test(body);
          const intent = isUnsub ? "unsubscribe" : await classifyReply(body, "email");

          db.insert(replies).values({
            leadId: lead.id,
            campaignId: lead.campaignId,
            channel: "email",
            fromAddress: fromAddr,
            body,
            intent: intent ?? undefined,
          }).run();

          // Stop active sequences for this lead
          db.update(sequenceEnrollments)
            .set({ status: "replied", completedAt: new Date().toISOString() })
            .where(and(
              eq(sequenceEnrollments.leadId, lead.id),
              eq(sequenceEnrollments.status, "active"),
            ))
            .run();

          prioritizeLeadOnReply(lead.id);

          // Honor opt-out requests (mailto unsubscribe / "baja" replies)
          if (isUnsub) {
            markUnsubscribed(fromAddr, lead.id);
            logActivity("blacklist", `Baja solicitada por email: ${fromAddr}`, {
              leadId: lead.id,
              messageKey: "activityLog.leadUnsubscribed",
              messageVars: { name: fromAddr },
            });
          }

          logActivity("email_sent", `Respuesta de email recibida de ${fromAddr}`, {
            leadId: lead.id,
            campaignId: lead.campaignId ?? undefined,
            metadata: { event: "reply" },
            messageKey: "activityLog.emailSentTo",
            messageVars: { email: fromAddr },
          });

          await triggerCrmWebhook(lead, "replied");
        } catch (err) {
          logger.warn({ err, uid: msg.uid }, "Failed to process inbound email");
        }
      }

      if (maxUid > lastUid) setSetting("imap_last_uid", String(maxUid));
    } finally {
      lock.release();
    }
  } catch (err) {
    logger.error({ err }, "IMAP poll failed");
    return { processed, matched, reason: err instanceof Error ? err.message : "IMAP error" };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }

  return { processed, matched };
}

/** Verify the IMAP credentials by connecting and opening INBOX. */
export async function testImap(): Promise<{ success: boolean; error?: string }> {
  const host = getSetting("imap_host") || "";
  const user = getSetting("imap_user") || "";
  const pass = getApiKey("imap_password", "IMAP_PASSWORD");
  const port = parseInt(getSetting("imap_port") || "993", 10);
  if (!host || !user || !pass) return { success: false, error: "IMAP no configurado" };

  const client = new ImapFlow({ host, port, secure: port === 993, auth: { user, pass }, logger: false });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "IMAP error" };
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}
