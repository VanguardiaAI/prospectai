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

let client: Client | null = null;
let state: WAState = {
  status: "disconnected",
  qrDataUrl: null,
  error: null,
  phone: null,
};
let initPromise: Promise<void> | null = null;

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
  if (state.status === "ready") return;
  // Coalesce concurrent calls — only one initialization runs at a time
  if (initPromise) return initPromise;
  initPromise = doInitialize().finally(() => { initPromise = null; });
  return initPromise;
}

async function doInitialize(): Promise<void> {
  state = { status: "authenticating", qrDataUrl: null, error: null, phone: null };

  try {
    if (client) {
      try { await client.destroy(); } catch { /* ignore */ }
    }

    client = createClient();

    client.on("qr", async (qr: string) => {
      const dataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
      state = { ...state, status: "qr_pending", qrDataUrl: dataUrl };
    });

    client.on("authenticated", () => {
      state = { ...state, status: "authenticating", qrDataUrl: null };
    });

    client.on("ready", async () => {
      const info = client?.info;
      state = {
        status: "ready",
        qrDataUrl: null,
        error: null,
        phone: info?.wid?.user || null,
      };
    });

    client.on("auth_failure", (msg: string) => {
      state = { status: "error", qrDataUrl: null, error: `Auth failed: ${msg}`, phone: null };
    });

    client.on("disconnected", (reason: string) => {
      state = { status: "disconnected", qrDataUrl: null, error: reason, phone: null };
      client = null;
    });

    await client.initialize();
  } catch (err) {
    state = {
      status: "error",
      qrDataUrl: null,
      error: err instanceof Error ? err.message : "Failed to initialize",
      phone: null,
    };
  }
}

export function getWhatsAppStatus(): WAState {
  return { ...state };
}

export function isWhatsAppReady(): boolean {
  return state.status === "ready" && client !== null;
}

export function getClient(): Client | null {
  return client;
}

export async function disconnectWhatsApp(): Promise<void> {
  if (client) {
    try { await client.destroy(); } catch { /* ignore */ }
    client = null;
  }
  state = { status: "disconnected", qrDataUrl: null, error: null, phone: null };
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

export interface SendWAResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<SendWAResult> {
  if (!client || state.status !== "ready") {
    return { success: false, error: "WhatsApp not connected" };
  }

  try {
    const formattedPhone = formatPhoneForWA(phone);
    const chatId = `${formattedPhone}@c.us`;

    // Check if the number is registered on WhatsApp
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      return { success: false, error: `El número ${phone} no está registrado en WhatsApp` };
    }

    const sentMsg = await client.sendMessage(chatId, message);
    return { success: true, messageId: sentMsg.id._serialized };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error sending message" };
  }
}
