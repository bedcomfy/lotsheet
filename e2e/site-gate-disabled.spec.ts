import { expect, test } from "@playwright/test";
import { GATE_COOKIE, GATE_UNLOCK_PATH, SITE_LOGOUT_KEY } from "../app/lib/siteSession";

test("a fresh browser opens the site without a typing session or automatic relocking", async ({ page, context }) => {
  const sessionRequests: string[] = [];
  let navigations = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === GATE_UNLOCK_PATH) sessionRequests.push(request.url());
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1;
  });
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Available Now" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Typing Speed Test" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toHaveCount(0);
  expect((await context.cookies()).some((cookie) => cookie.name === GATE_COOKIE)).toBe(false);

  // Old site-session events no longer reload the app or start an expiry check.
  await page.evaluate((key) => {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: "old-tab-logout" }));
    document.dispatchEvent(new Event("visibilitychange"));
  }, SITE_LOGOUT_KEY);
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
  expect(sessionRequests).toEqual([]);
  expect(navigations).toBe(1);

  for (const path of ["/api/flags", "/api/state/custom-sheet", "/logo.png"]) {
    expect((await page.request.get(path)).ok(), path).toBe(true);
  }
  expect(await (await page.request.get(GATE_UNLOCK_PATH)).json()).toEqual({ ok: true, enabled: false, session: null });

  // A stale cookie from before the deployment cannot put a user back in the game.
  await context.addCookies([{ name: GATE_COOKIE, value: "expired", url: "http://localhost:3001" }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Maintenance Logistics", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "Home", exact: true }).click();
  const pages = page.getByRole("dialog", { name: "Pages", exact: true });
  await expect(pages).toBeVisible();
  await expect(pages.getByRole("button", { name: "Log out", exact: true })).toHaveCount(0);
});

test("Admin Tools still need their own password and can be logged out independently", async ({ page }) => {
  expect((await (await page.request.get("/api/admin/session")).json()).unlocked).toBe(false);
  expect((await page.request.put("/api/pm-mileage", { data: { bus: "6471", odometer: 123 } })).status()).toBe(401);
  await page.goto("/admin/flags");
  await expect(page.getByRole("heading", { name: "Protected Settings" })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("site-open-test-admin");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sheet Configuration" })).toBeVisible();
  expect((await (await page.request.get("/api/admin/session")).json()).unlocked).toBe(true);
  await page.getByRole("button", { name: "Log out of admin" }).last().click();
  await expect(page.getByRole("heading", { name: "Protected Settings" })).toBeVisible();
  expect((await (await page.request.get("/api/admin/session")).json()).unlocked).toBe(false);
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Available Now" })).toBeVisible();
});

test("PDF printing works without a typing-game cookie", async ({ request }) => {
  test.setTimeout(120_000);
  const response = await request.get("/api/pdf?path=/custom-sheet&blank=1", { timeout: 90_000 });
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
