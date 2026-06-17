import { getSetting } from "@/db";
import { sendEmail as sendViaResend } from "./resend-client";
import { sendViaSmtp } from "./smtp-client";
import type { SendEmailParams, SendEmailResult } from "./resend-client";

export type { SendEmailParams, SendEmailResult };

/**
 * Provider-agnostic email send. Routes to SMTP (a real mailbox, e.g. Google
 * Workspace) or Resend based on the `email_provider` setting. Default: resend.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (getSetting("email_provider") === "smtp") {
    return sendViaSmtp(params);
  }
  return sendViaResend(params);
}
