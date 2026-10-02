import { expect, test as setup } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

// Matches playwright.config.ts. Runs before every other project and saves the
// unlocked cookie jar they start from.
const PASSPHRASE = "e2e typing gate";
const STATE = "tmp/playwright/gate.json";

setup("the decoy typing test hides the site until the passphrase is typed", async ({ page, request }) => {
  // Locked: any page is the typing test, with nothing that names the real site.
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Typing Speed Test" })).toBeVisible();
  // The "sponsored" popup shows a moment after load and must get out of the way.
  const ad = page.getByRole("dialog", { name: "Sponsored" });
  await expect(ad).toBeVisible({ timeout: 10000 });
  await ad.getByRole("button", { name: "Close" }).click();
  await expect(ad).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Type the text here" })).toBeFocused();
  const html = await page.content();
  expect(html).not.toMatch(/\bpace\b|garage|fleet|maintenance|lot sheet|work order/i);
  expect(html).not.toContain("/_next/");
  expect((await request.get("/api/pm-mileage")).status()).toBe(404);
  expect((await request.get("/logo.png")).status()).toBe(404);

  // An ordinary run is just a typing test.
  const input = page.getByRole("textbox", { name: "Type the text here" });
  await input.pressSequentially("The quick");
  await input.press("Enter");
  await expect(page.getByText(/WPM/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Typing Speed Test" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();

  // Typing the passphrase instead of the passage unlocks the real site in place.
  await input.fill(PASSPHRASE);
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Available Now" })).toBeVisible({ timeout: 30000 });
  expect(page.url()).toContain("/home");

  // Save the cookie only. The unlocked visit also wrote the app's own
  // localStorage (sidebar rail state and the like), which the other tests
  // must start without, exactly as a fresh browser would.
  const { cookies } = await page.context().storageState();
  mkdirSync("tmp/playwright", { recursive: true });
  writeFileSync(STATE, JSON.stringify({ cookies, origins: [] }));

  // The session is good for 30 minutes, and Log out returns to the decoy.
  const session = await (await page.request.get("/api/typing/results")).json();
  expect(session.session.expiresAt - Date.now()).toBeGreaterThan(29 * 60_000);
  expect(session.session.expiresAt - Date.now()).toBeLessThanOrEqual(30 * 60_000);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Typing Speed Test" })).toBeVisible();
  expect(page.url()).toBe("http://localhost:3000/");
  expect((await page.request.get("/api/pm-mileage")).status()).toBe(404);
});
