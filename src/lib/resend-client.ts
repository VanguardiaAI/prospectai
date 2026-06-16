import { Resend } from "resend";
import { getApiKey } from "@/db";

let resendInstance: Resend | null = null;
let resendKey = "";

function getResend(): Resend {
  const key = getApiKey("resend_api_key", "RESEND_API_KEY");
  if (!resendInstance || key !== resendKey) {
    resendInstance = new Resend(key || "");
    resendKey = key;
  }
  return resendInstance;
}

export interface SendEmailParams {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(params.headers && { headers: params.headers }),
      ...(params.replyTo && { reply_to: params.replyTo }),
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, id: result.data?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();
    await resend.domains.list();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
