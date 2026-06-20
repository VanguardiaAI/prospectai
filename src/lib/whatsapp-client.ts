import { Client, LocalAuth } from "whatsapp-web.js";
import QRCode from "qrcode";
import { getSetting } from "@/db";

type WAStatus = "disconnected" | "qr_pending" | "authenticating" | "ready" | "error";

interface WAState {
  status: WAStatus;
  qrDataUrl: string | null;
  error: string | null;
  phone: string | null;
}

interface WAGlobal {
  client: Client | null;
  state: WAState;
  initPromise: Promise<void> | null;
}

/**
 * Persist the client / state across Next.js dev hot-reloads.
 *
 * Without this, every module re-evaluation drops the JS references while the
 * underlying Chromium browser spawned by whatsapp-web.js keeps running. The next
 * `initialize()` then launches a SECOND browser against the same LocalAuth
 * session, which collides on the page binding ("onQRChangedEvent already exists")
 * and wedges the QR. Stashing the singleton on globalThis keeps exactly one
 * client/browser per process, so the destroy-before-create below actually tears
 * down the previous browser instead of leaking it.
 */
const globalForWA = globalThis as unknown as { __prospectaiWhatsApp?: WAGlobal };

const wa: WAGlobal =
  globalForWA.__prospectaiWhatsApp ??
  (globalForWA.__prospectaiWhatsApp = {
    client: null,
    state: { status: "disconnected", qrDataUrl: null, error: null, phone: null },
    initPromise: null,
  });

function createClient(): Client {
  return new Client({
    authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });
}

export async function initializeWhatsApp(): Promise<void> {
  if (wa.state.status === "ready" && wa.client) return;
  // Coalesce concurrent calls — only one initialization runs at a time
  if (wa.initPromise) return wa.initPromise;
  wa.initPromise = doInitialize().finally(() => { wa.initPromise = null; });
  return wa.initPromise;
}

async function doInitialize(): Promise<void> {
  wa.state = { status: "authenticating", qrDataUrl: null, error: null, phone: null };

  try {
    // Tear down any previous browser (incl. one leaked by a prior hot-reload)
    // before spawning a new one, so we never run two clients on one session.
    if (wa.client) {
      try { await wa.client.destroy(); } catch { /* ignore */ }
      wa.client = null;
    }

    const client = createClient();
    wa.client = client;

    client.on("qr", async (qr: string) => {
      const dataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
      wa.state = { ...wa.state, status: "qr_pending", qrDataUrl: dataUrl };
    });

    client.on("authenticated", () => {
      wa.state = { ...wa.state, status: "authenticating", qrDataUrl: null };
    });

    client.on("ready", async () => {
      const info = client.info;
      wa.state = {
        status: "ready",
        qrDataUrl: null,
        error: null,
        phone: info?.wid?.user || null,
      };
    });

    client.on("auth_failure", (msg: string) => {
      wa.state = { status: "error", qrDataUrl: null, error: `Auth failed: ${msg}`, phone: null };
    });

    client.on("disconnected", (reason: string) => {
      wa.state = { status: "disconnected", qrDataUrl: null, error: reason, phone: null };
      wa.client = null;
    });

    await client.initialize();
  } catch (err) {
    wa.state = {
      status: "error",
      qrDataUrl: null,
      error: err instanceof Error ? err.message : "Failed to initialize",
      phone: null,
    };
  }
}

export function getWhatsAppStatus(): WAState {
  return { ...wa.state };
}

export function isWhatsAppReady(): boolean {
  return wa.state.status === "ready" && wa.client !== null;
}

export function getClient(): Client | null {
  return wa.client;
}

export async function disconnectWhatsApp(): Promise<void> {
  if (wa.client) {
    try { await wa.client.destroy(); } catch { /* ignore */ }
    wa.client = null;
  }
  wa.state = { status: "disconnected", qrDataUrl: null, error: null, phone: null };
}

// Format phone number for WhatsApp based on configured country
function formatPhoneForWA(phone: string): string {
  const countryCode = getSetting("phone_country_code") || "34";
  const expectedDigits = parseInt(getSetting("phone_digits") || "9", 10);

  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Remove leading +
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // If it already starts with the country code and has the right length, keep it
  if (cleaned.startsWith(countryCode) && cleaned.length === countryCode.length + expectedDigits) {
    return cleaned;
  }

  // If it's just the local number, add country code
  if (cleaned.length === expectedDigits) {
    cleaned = countryCode + cleaned;
  }

  return cleaned;
}

// Machine-readable failure cause so callers can distinguish a permanent failure
// (number not on WhatsApp) from a transient one (client offline / network) and
// decide whether to fail the message or re-hold it for the next window.
export type SendWAFailureReason = "not_connected" | "not_registered" | "send_error";

export interface SendWAResult {
  success: boolean;
  messageId?: string;
  error?: string;
  reason?: SendWAFailureReason;
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<SendWAResult> {
  const client = wa.client;
  if (!client || wa.state.status !== "ready") {
    return { success: false, error: "WhatsApp not connected", reason: "not_connected" };
  }

  try {
    const formattedPhone = formatPhoneForWA(phone);

    // Resolve the canonical WhatsApp chat id from the number. getNumberId queries
    // WhatsApp and returns the real id (handling country quirks like Mexico's
    // mobile "1" prefix: 52 -> 521), or null if the number isn't on WhatsApp.
    // This is more reliable than building `${number}@c.us` by hand. This IS the
    // authoritative "is this number on WhatsApp?" check, run right before sending.
    const numberId = await client.getNumberId(formattedPhone);
    if (!numberId) {
      return {
        success: false,
        error: `El número ${phone} no está registrado en WhatsApp`,
        reason: "not_registered",
      };
    }

    const sentMsg = await client.sendMessage(numberId._serialized, message);
    return { success: true, messageId: sentMsg.id._serialized };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error sending message",
      reason: "send_error",
    };
  }
}
