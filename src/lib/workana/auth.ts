import { getSetting, setSetting } from "@/db";
import { logger } from "@/lib/logger";
import { WORKANA_LOGIN_URL } from "./config";
import { getContext, closeContext, assertLoggedIn } from "./browser";
import type { ConnectStatus, WorkanaAuthState } from "./types";

// Transient connect status, kept on globalThis so it survives hot-reload and is
// readable by the status endpoint while the headful login runs in background.
const globalForAuth = globalThis as unknown as { __prospectaiWorkanaAuth?: { connect: ConnectStatus } };
const auth =
  globalForAuth.__prospectaiWorkanaAuth ??
  (globalForAuth.__prospectaiWorkanaAuth = { connect: { phase: "idle" } });

export function getConnectStatus(): ConnectStatus {
  return auth.connect;
}

export function getAuthState(): WorkanaAuthState {
  const v = getSetting("workana_auth_state");
  return v === "connected" || v === "needs_reauth" ? v : "disconnected";
}

function setAuthState(state: WorkanaAuthState): void {
  setSetting("workana_auth_state", state);
}

const LOGIN_POLL_MS = 4000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Interactive headful login. NON-BLOCKING: opens a visible browser pointed at the
 * Workana login page for the user to sign in (incl. any 2FA/captcha), then polls
 * in the background until authenticated, persisting the session to the on-disk
 * profile and flipping `workana_auth_state` to "connected".
 *
 * The poll never navigates the user's login tab — it confirms on a throwaway page
 * only once the login tab has left the login URL, so we don't disrupt typing.
 */
export async function startConnect(): Promise<ConnectStatus> {
  if (auth.connect.phase === "awaiting_login") return auth.connect;
  auth.connect = { phase: "awaiting_login", startedAt: Date.now(), message: "Abriendo navegador…" };

  void (async () => {
    try {
      const ctx = await getContext(false); // headful — the user must see it
      const loginPage = ctx.pages()[0] ?? (await ctx.newPage());
      await loginPage.goto(WORKANA_LOGIN_URL, { waitUntil: "domcontentloaded" }).catch(() => {});

      const deadline = Date.now() + LOGIN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, LOGIN_POLL_MS));
        if (loginPage.isClosed()) break;
        const url = loginPage.url();
        // Only once the user has navigated past the login screen do we confirm.
        if (!/\/login|\/signin/i.test(url)) {
          const probe = await ctx.newPage();
          const ok = await assertLoggedIn(probe).catch(() => false);
          await probe.close().catch(() => {});
          if (ok) {
            setAuthState("connected");
            auth.connect = { phase: "connected", message: "Sesión iniciada" };
            await closeContext();
            logger.info("workana: connected (session persisted)");
            return;
          }
        }
      }
      auth.connect = { phase: "timeout", message: "Tiempo de espera agotado sin iniciar sesión" };
      await closeContext();
    } catch (e) {
      auth.connect = { phase: "error", message: (e as Error).message };
      await closeContext().catch(() => {});
      logger.error({ err: (e as Error).message }, "workana: connect failed");
    }
  })();

  return auth.connect;
}

/**
 * Verify the persisted session is still valid (headless) and update the stored
 * auth state. A previously-connected session that no longer authenticates flips
 * to "needs_reauth" so the UI can prompt a re-login.
 */
export async function checkSession(): Promise<WorkanaAuthState> {
  try {
    const headless = getSetting("workana_headless") !== "false";
    const ctx = await getContext(headless);
    const probe = await ctx.newPage();
    const ok = await assertLoggedIn(probe).catch(() => false);
    await probe.close().catch(() => {});
    await closeContext();

    const next: WorkanaAuthState = ok ? "connected" : getAuthState() === "disconnected" ? "disconnected" : "needs_reauth";
    setAuthState(next);
    return next;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "workana: checkSession failed");
    return getAuthState();
  }
}

export async function disconnect(): Promise<void> {
  await closeContext().catch(() => {});
  setAuthState("disconnected");
  auth.connect = { phase: "idle" };
}
