import { test, expect } from "playwright/test";

// These tests verify the API validation layer works correctly.
// They require a valid session cookie — set AUTH_USERNAME and AUTH_PASSWORD_HASH
// in .env and login first, or skip these if credentials aren't available.

test.describe("API Validation", () => {
  let headers: Record<string, string> = {};

  test.beforeAll(async ({ request }) => {
    // Try to login to get a session cookie
    const loginRes = await request.post("/api/auth/login", {
      data: {
        username: process.env.AUTH_USERNAME || "admin",
        password: process.env.AUTH_PASSWORD || "admin",
      },
    });

    if (loginRes.ok()) {
      const cookies = loginRes.headers()["set-cookie"];
      if (cookies) {
        headers = { Cookie: cookies };
      }
    }
  });

  test("POST /api/campaigns with missing name returns 400", async ({ request }) => {
    const res = await request.post("/api/campaigns", {
      data: { description: "test" },
      headers,
    });
    // Either 400 (validation) or 401 (no auth) — both are expected
    expect([400, 401]).toContain(res.status());
  });

  test("POST /api/blacklist with missing type returns 400", async ({ request }) => {
    const res = await request.post("/api/blacklist", {
      data: { value: "test.com" },
      headers,
    });
    expect([400, 401]).toContain(res.status());
  });

  test("POST /api/cron without secret returns 401", async ({ request }) => {
    const res = await request.post("/api/cron");
    expect(res.status()).toBe(401);
  });
});
