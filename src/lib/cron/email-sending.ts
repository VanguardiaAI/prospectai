import { db, getSetting } from "@/db";
import { emails, leads, campaigns, jobQueue, sendingDomains } from "@/db/schema";
import { eq, and, sql, ne } from "drizzle-orm";
import { sendEmail } from "@/lib/email-sender";
import { logActivity } from "@/lib/activity";
import { isUnsubscribed, generateUnsubscribeUrl, injectUnsubscribeLink, appendUnsubscribeText } from "@/lib/unsubscribe";
import { injectTrackingPixel, wrapLinksWithTracking } from "@/lib/tracking";
import { getEffectiveDailyLimit, isWithinSendWindow, incrementWarmupDay } from "./warmup";
import { logger } from "@/lib/logger";

function getBounceRate7d(): number {
  const sentLast7 = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "sent"), sql`${emails.sentAt} >= datetime('now', '-7 days')`))
    .get()?.count ?? 0;
  const bouncedLast7 = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "failed"), sql`${emails.sentAt} >= datetime('now', '-7 days')`))
    .get()?.count ?? 0;
  const total = sentLast7 + bouncedLast7;
  return total > 0 ? (bouncedLast7 / total) * 100 : 0;
}

export async function processEmailSending() {
  if (!isWithinSendWindow()) {
    return { sent: 0, reason: "Outside send window" };
  }

  // Auto-pause if bounce rate exceeds 5% over last 7 days
  const bounceRate = getBounceRate7d();
  if (bounceRate >= 5) {
    logger.warn(`[cron] Bounce rate ${bounceRate.toFixed(1)}% >= 5% — envíos pausados automáticamente`);
    return { sent: 0, reason: `Bounce rate too high (${bounceRate.toFixed(1)}%)` };
  }

  const effectiveLimit = getEffectiveDailyLimit();
  const today = new Date().toISOString().split("T")[0];

  const sentToday = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "sent"), sql`date(${emails.sentAt}) = ${today}`))
    .get()?.count ?? 0;

  if (sentToday >= effectiveLimit) {
    return { sent: 0, reason: `Daily limit reached (${sentToday}/${effectiveLimit})` };
  }

  // Increment warmup day on first send of the day
  if (sentToday === 0) {
    incrementWarmupDay();
  }

  const remaining = effectiveLimit - sentToday;

  const approvedEmails = db.select({
    email: emails,
    campaignDailyLimit: campaigns.dailyLimit,
  })
    .from(emails)
    .leftJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(eq(emails.status, "approved"))
    .limit(remaining)
    .all();

  const campaignSentToday: Record<number, number> = {};

  let sent = 0;
  for (const row of approvedEmails) {
    if (sent >= remaining) break;

    // RGPD: Check if unsubscribed
    if (isUnsubscribed(row.email.toEmail)) {
      db.update(emails).set({ status: "failed" }).where(eq(emails.id, row.email.id)).run();
      logActivity("email_failed", `Email no enviado a ${row.email.toEmail}: se dio de baja`, { leadId: row.email.leadId, messageKey: "activityLog.leadUnsubscribed", messageVars: { name: row.email.toEmail } });
      continue;
    }

    // Check per-campaign limit
    if (row.email.campaignId) {
      if (!(row.email.campaignId in campaignSentToday)) {
        const campSent = db.select({ count: sql<number>`count(*)` }).from(emails)
          .where(and(
            eq(emails.campaignId, row.email.campaignId),
            eq(emails.status, "sent"),
            sql`date(${emails.sentAt}) = ${today}`
          )).get()?.count ?? 0;
        campaignSentToday[row.email.campaignId] = campSent;
      }

      const campLimit = row.campaignDailyLimit ?? effectiveLimit;
      if (campaignSentToday[row.email.campaignId] >= campLimit) {
        continue;
      }
    }

    // Domain rotation: pick domain with fewest sends today
    let fromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";
    let fromEmail = row.email.fromEmail || getSetting("from_email") || "";
    let sendApiKey: string | undefined;

    const activeDomains = db.select().from(sendingDomains)
      .where(ne(sendingDomains.status, "paused"))
      .all();

    let selectedDomain: typeof activeDomains[0] | null = null;
    let selectedDomainPrevSent = 0;

    if (activeDomains.length > 0) {
      let bestCount = Infinity;

      for (const d of activeDomains) {
        const domainWarmupDay = d.warmupDay && d.warmupDay > 0 ? d.warmupDay : 1;
        if (!d.warmupDay || d.warmupDay <= 0) {
          db.update(sendingDomains)
            .set({ warmupDay: 1 })
            .where(eq(sendingDomains.id, d.id))
            .run();
          d.warmupDay = 1;
        }

        const domainSent = db.select({ count: sql<number>`count(*)` }).from(emails)
          .where(and(
            eq(emails.fromEmail, d.fromEmail),
            eq(emails.status, "sent"),
            sql`date(${emails.sentAt}) = ${today}`
          )).get()?.count ?? 0;

        const domainEffectiveLimit = Math.min(
          d.warmupStartLimit + (domainWarmupDay - 1) * d.warmupIncrement,
          d.dailyLimit
        );

        if (domainSent < domainEffectiveLimit && domainSent < bestCount) {
          bestCount = domainSent;
          selectedDomain = d;
          selectedDomainPrevSent = domainSent;
        }
      }

      if (selectedDomain) {
        fromName = selectedDomain.fromName;
        fromEmail = selectedDomain.fromEmail;
        if (selectedDomain.resendApiKey) sendApiKey = selectedDomain.resendApiKey;
      }
    }

    // Generate unsubscribe URL and inject into email
    const unsubUrl = generateUnsubscribeUrl(row.email.toEmail, row.email.leadId);

    // Inject unsubscribe link, then tracking pixel, then wrap links
    let finalHtml = injectUnsubscribeLink(row.email.bodyHtml, unsubUrl);
    finalHtml = injectTrackingPixel(finalHtml, row.email.id);
    finalHtml = wrapLinksWithTracking(finalHtml, row.email.id);
    const finalText = appendUnsubscribeText(row.email.bodyText, unsubUrl);

    const replyToEmail = getSetting("reply_to_email") || undefined;

    const result = await sendEmail({
      to: row.email.toEmail,
      from: `${fromName} <${fromEmail}>`,
      subject: row.email.subject,
      html: finalHtml,
      text: finalText,
      replyTo: replyToEmail,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (result.success) {
      db.update(emails).set({
        status: "sent",
        resendId: result.id,
        fromEmail,
        sentAt: new Date().toISOString(),
      }).where(eq(emails.id, row.email.id)).run();

      db.update(leads).set({
        status: "email_sent",
        emailSentAt: new Date().toISOString(),
      }).where(eq(leads.id, row.email.leadId)).run();

      if (row.email.campaignId) {
        campaignSentToday[row.email.campaignId] = (campaignSentToday[row.email.campaignId] || 0) + 1;
      }

      // Per-domain warmup: increment warmupDay on first send of the day for this domain
      if (selectedDomain && selectedDomainPrevSent === 0) {
        const domainCurrentLimit = selectedDomain.warmupStartLimit + (selectedDomain.warmupDay - 1) * selectedDomain.warmupIncrement;
        if (domainCurrentLimit < selectedDomain.dailyLimit) {
          db.update(sendingDomains)
            .set({ warmupDay: selectedDomain.warmupDay + 1 })
            .where(eq(sendingDomains.id, selectedDomain.id))
            .run();
        }
      }

      logActivity("email_sent", `Email enviado a ${row.email.toEmail} desde ${fromEmail}`, {
        leadId: row.email.leadId,
        campaignId: row.email.campaignId ?? undefined,
        messageKey: "activityLog.emailSentFrom",
        messageVars: { email: row.email.toEmail, from: fromEmail },
      });

      sent++;

      // Stagger sends: random delay 30-120 seconds between emails
      if (sent < remaining) {
        const delay = 30000 + Math.random() * 90000;
        await new Promise((r) => setTimeout(r, delay));
      }
    } else {
      db.update(emails).set({ status: "failed" }).where(eq(emails.id, row.email.id)).run();
      logActivity("email_failed", `Error enviando email a ${row.email.toEmail}: ${result.error}`, {
        leadId: row.email.leadId,
        messageKey: "activityLog.errorSendingEmail",
        messageVars: { email: row.email.toEmail },
      });
    }
  }

  return { sent, limit: effectiveLimit, sentToday: sentToday + sent };
}

export async function processAutopilotSendQueue() {
  const jobs = db.select().from(jobQueue)
    .where(and(eq(jobQueue.type, "send_email"), eq(jobQueue.status, "pending")))
    .limit(10)
    .all();

  for (const job of jobs) {
    if (!job.leadId) continue;
    const email = db.select().from(emails).where(and(eq(emails.leadId, job.leadId), eq(emails.status, "draft"))).get();
    if (email) {
      db.update(emails).set({ status: "approved" }).where(eq(emails.id, email.id)).run();
    }
    db.update(jobQueue).set({ status: "completed", processedAt: new Date().toISOString() }).where(eq(jobQueue.id, job.id)).run();
  }
}
