import nodemailer, { type Transporter } from "nodemailer";
import { getSetting, getApiKey } from "@/db";
import type { SendEmailParams, SendEmailResult } from "./resend-client";

// Send email through a real mailbox via SMTP (e.g. Google Workspace).
// Lets the app send 1:1 cold outreach from a genuine inbox with great
// deliverability, and pairs with IMAP reply capture on the same mailbox —
// no ESP, no public URL, no VPS required.

let transporter: Transporter | null = null;
let sig = "";

function getTransport(): Transporter {
  const host = getSetting("smtp_host") || "";
  const port = parseInt(getSetting("smtp_port") || "587", 10);
  const user = getSetting("smtp_user") || "";
  const pass = getApiKey("smtp_password", "SMTP_PASSWORD");
  const key = `${host}:${port}:${user}:${pass}`;
  if (!transporter || key !== sig) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user, pass },
    });
    sig = key;
  }
  return transporter;
}

export async function sendViaSmtp(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    const info = await getTransport().sendMail({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      headers: params.headers,
    });
    return { success: true, id: info.messageId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "SMTP error" };
  }
}

export async function testSmtp(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!getSetting("smtp_host")) return { success: false, error: "SMTP no configurado" };
    await getTransport().verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "SMTP error" };
  }
}
