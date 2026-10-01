import { test, expect } from "@playwright/test";

// Uses the isolated in-memory dev server configured by playwright.config.ts.
test("crew status, direct next-PM correction, completion, and admin logout", async ({ page, context }) => {
  const api = context.request;
  const password = process.env.ADMIN_PASSWORD || "ride";
  expect((await api.post("/api/admin/session", { data: { password } })).ok()).toBe(true);
  expect((await api.put("/api/pm-mileage", { data: {
    bus: "6404", odometer: 100_000, lastInspType: null, lastInspMiles: null, lastInspDate: null,
    lastTransMiles: null, lastTransDate: null, disposition: "", nextInspType: "A-3", nextInspMiles: 100_025, nextTransMiles: 100_250,
  } })).ok()).toBe(true);
  await api.delete("/api/admin/session");

  await page.goto("/pm-mileage");
  await page.getByRole("searchbox", { name: "Search buses", exact: true }).fill("6404");
  const inspection = page.getByRole("row", { name: "Bus 6404 A-3", exact: true });
  const trans = page.getByRole("row", { name: "Bus 6404 Trans PM", exact: true });
  await expect(inspection.getByText("25", { exact: true })).toBeVisible();
  await expect(trans.getByText("250", { exact: true })).toBeVisible();
  await inspection.getByRole("button", { name: /status/ }).click();
  await page.getByRole("option", { name: "Hold", exact: true }).click();
  await expect(trans.getByRole("button", { name: /status/ })).toContainText("Hold");
  await page.reload();
  await page.getByRole("searchbox", { name: "Search buses", exact: true }).fill("6404");
  await expect(inspection.getByRole("button", { name: /status/ })).toContainText("Hold");
  expect((await api.put("/api/pm-mileage", { data: { bus: "6404", odometer: 1 } })).status()).toBe(401);

  await page.getByRole("button", { name: "Unlock to edit" }).click();
  const unlock = page.getByRole("dialog", { name: "Unlock editing" });
  await unlock.getByLabel("Password").fill(password);
  await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
  await inspection.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: /Edit next inspection/ }).click();
  const edit = page.getByRole("dialog", { name: "Next inspection · Bus 6404" });
  await edit.getByRole("button", { name: /Next inspection/ }).click();
  await page.getByRole("option", { name: "A-9", exact: true }).click();
  await edit.getByLabel("Due at (miles)").fill("100100");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  const corrected = page.getByRole("row", { name: "Bus 6404 A-9", exact: true });
  await expect(corrected.getByText("at 100,100")).toBeVisible();
  let record = (await (await api.get("/api/pm-mileage")).json()).records["6404"];
  expect(record.lastInspType).toBeNull();
  expect(record.lastInspMiles).toBeNull();
  expect(record.nextTransMiles).toBe(100_250);
  await corrected.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Complete A-9", exact: false }).click();
  await page.getByRole("dialog", { name: "Complete inspection · Bus 6404" }).getByRole("button", { name: "Mark complete" }).click();
  const next = page.getByRole("row", { name: "Bus 6404 B-12", exact: true });
  await expect(next.getByText("at 103,100")).toBeVisible();
  await expect(trans.getByText("at 100,250")).toBeVisible();

  const secondTab = await context.newPage();
  await secondTab.goto("/pm-mileage");
  await secondTab.getByRole("button", { name: "Unlock to edit" }).click();
  await secondTab.getByRole("dialog").getByLabel("Password").fill(password);
  await secondTab.getByRole("dialog").getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(secondTab.getByRole("button", { name: "Import PDF", exact: true })).toBeVisible();

  // Phone layout keeps the logout control, rows, and status field reachable.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "PM Mileage", exact: true }).click();
  const pages = page.getByRole("dialog", { name: "Pages", exact: true });
  await expect(pages.getByRole("button", { name: "Log out of admin" })).toBeVisible();
  await pages.getByRole("button", { name: "Close Pages", exact: true }).click();
  await expect(page.getByRole("button", { name: "Log out of admin" }).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/pm-mileage-phone.png", fullPage: true });
  await page.getByRole("button", { name: "Log out of admin" }).last().click();
  await expect(page.getByRole("button", { name: "Unlock to edit" })).toBeVisible();
  await expect(secondTab.getByRole("button", { name: "Unlock to edit" })).toBeVisible();
  expect((await (await api.get("/api/admin/session")).json()).unlocked).toBe(false);
  expect((await api.put("/api/pm-mileage", { data: { bus: "6404", nextInspType: "A-3", nextInspMiles: 1 } })).status()).toBe(401);
  await next.getByRole("button", { name: /status/ }).click();
  await page.getByRole("option", { name: "Shop", exact: true }).click();
  await expect(trans.getByRole("button", { name: /status/ })).toContainText("Shop");
  await page.reload();
  await expect(next.getByRole("button", { name: /status/ })).toContainText("Shop");
  record = (await (await api.get("/api/pm-mileage")).json()).records["6404"];
  expect(record.lastInspMiles).toBe(100_100);
  await secondTab.close();
});

test("Admin Tools exposes logout and clears the password after locking", async ({ page }) => {
  await page.goto("/admin/flags");
  await page.getByLabel("Password", { exact: true }).fill(process.env.ADMIN_PASSWORD || "ride");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sheet Configuration" })).toBeVisible();
  await page.getByRole("button", { name: "Log out of admin" }).last().click();
  await expect(page.getByRole("heading", { name: "Protected Settings" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});
