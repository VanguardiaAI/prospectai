import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@/db/connection", async () => {
  const { testDb, testSqlite } = await import("@/test/test-db");
  return { db: testDb, sqlite: testSqlite };
});

import { testSqlite } from "@/test/test-db";
import { withSendLock } from "@/lib/cron/send-lock";

function setLock(name: string, value: string) {
  testSqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(`_send_lock_${name}`, value);
}

describe("withSendLock", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM settings");
  });

  it("runs the function and returns its result when the lock is free", async () => {
    const r = await withSendLock("email", { ran: false }, async () => ({ ran: true }));
    expect(r).toEqual({ ran: true });
  });

  it("blocks a second pass with the same name while the first holds the lock", async () => {
    let innerRan = false;
    const outer = await withSendLock("email", "OUTER_BUSY", async () => {
      // Still holding the lock here — a concurrent same-name pass must be denied.
      const inner = await withSendLock("email", "BUSY", async () => {
        innerRan = true;
        return "INNER_RAN";
      });
      return inner;
    });
    expect(outer).toBe("BUSY"); // the nested pass was refused...
    expect(innerRan).toBe(false); // ...and its body never executed
  });

  it("does not block passes that use a different lock name", async () => {
    const outer = await withSendLock("email", "x", async () => {
      return withSendLock("wa", "WA_BUSY", async () => "WA_RAN");
    });
    expect(outer).toBe("WA_RAN");
  });

  it("releases the lock after completion so the next pass can acquire it", async () => {
    await withSendLock("email", "busy", async () => "first");
    const second = await withSendLock("email", "busy", async () => "second");
    expect(second).toBe("second");
  });

  it("releases the lock even when the function throws", async () => {
    await expect(
      withSendLock("email", "busy", async () => { throw new Error("boom"); }),
    ).rejects.toThrow("boom");
    // Lock must be free again afterwards.
    const after = await withSendLock("email", "busy", async () => "ok");
    expect(after).toBe("ok");
  });

  it("refuses to run when a fresh lock is held by someone else", async () => {
    setLock("email", String(Date.now())); // a live holder
    let ran = false;
    const r = await withSendLock("email", "BUSY", async () => { ran = true; return "RAN"; });
    expect(r).toBe("BUSY");
    expect(ran).toBe(false);
  });

  it("takes over a stale lock (holder crashed without releasing)", async () => {
    setLock("email", String(Date.now() - 31 * 60 * 1000)); // older than the 30-min TTL
    let ran = false;
    const r = await withSendLock("email", "BUSY", async () => { ran = true; return "RAN"; });
    expect(r).toBe("RAN");
    expect(ran).toBe(true);
  });
});
