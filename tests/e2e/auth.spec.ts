import { test, expect } from "playwright/test";

test.describe("Authentication", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type='text'], input[name='username']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[type='text'], input[name='username']", "wrong");
    await page.fill("input[type='password']", "wrong");
    await page.click("button[type='submit']");
    // Should stay on login page or show error
    await expect(page).toHaveURL(/\/login/);
  });

  test("API returns 401 without session", async ({ request }) => {
    const response = await request.get("/api/campaigns");
    expect(response.status()).toBe(401);
  });

  test("public routes work without auth", async ({ request }) => {
    const trackResponse = await request.get("/api/track/open?id=test");
    // Track route should not return 401
    expect(trackResponse.status()).not.toBe(401);
  });
});
