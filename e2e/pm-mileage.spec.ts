import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

async function pdfText(bytes: Buffer) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    expect(page.view).toEqual([0, 0, 612, 792]);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " "));
  }
  await pdf.destroy();
  return pages;
}

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

test("PM shop grouping, shared Hold/Split flags, and grayscale multi-page printing", async ({ page, context }) => {
  test.setTimeout(120_000);
  const api = context.request;
  await api.post("/api/admin/session", { data: { password: process.env.ADMIN_PASSWORD || "ride" } });
  const fixtures = [
    { bus: "6404", left: 25, disposition: "" },
    { bus: "6417", left: 50, disposition: "hold" },
    { bus: "6435", left: 75, disposition: "split" },
    { bus: "6450", left: 2000, disposition: "shop" },
    { bus: "6451", left: 3000, disposition: "follow-up" },
  ];
  expect((await api.post("/api/flags", { data: { bus: "6404", flags: [], note: "FLAG NOTE ONLY" } })).ok()).toBe(true);
  for (const fixture of fixtures) {
    expect((await api.put("/api/pm-mileage", { data: {
      bus: fixture.bus, disposition: fixture.disposition, odometer: 100_000, odometerDate: "9/30/26",
      nextInspType: "A-3", nextInspMiles: 100_000 + fixture.left, nextTransMiles: 100_225 + fixture.left,
      note: fixture.bus === "6450" ? "Inspect transmission lines and confirm all parts arrived. ".repeat(18) + "END OF SHOP NOTE"
        : fixture.bus === "6404" ? "PM NOTE ONLY" : "",
    } })).ok()).toBe(true);
  }
  await api.delete("/api/admin/session");
  const flags = (await (await api.get("/api/flags")).json()).flags;
  expect(flags["6417"].flags).toContain("hold");
  expect(flags["6435"].flags).toContain("split");
  expect(flags["6404"].note).toBe("FLAG NOTE ONLY");

  await page.goto("/pm-mileage");
  const table = page.getByRole("table", { name: "Upcoming PM work" });
  const shop = table.getByRole("rowgroup", { name: "In shop / Follow up" });
  const queue = table.getByRole("rowgroup", { name: "Upcoming work" });
  await expect(shop.getByRole("row", { name: "Bus 6450 A-3", exact: true })).toBeVisible();
  await expect(shop.getByRole("row", { name: "Bus 6451 Trans PM", exact: true })).toBeVisible();
  const queueNames = await queue.locator('[role="row"][aria-label]').evaluateAll((rows) => rows.slice(0, 6).map((row) => row.getAttribute("aria-label")));
  expect(queueNames).toEqual(["Bus 6404 A-3", "Bus 6417 A-3", "Bus 6435 A-3", "Bus 6404 Trans PM", "Bus 6417 Trans PM", "Bus 6435 Trans PM"]);
  expect(await table.getByRole("rowgroup").evaluateAll((groups) => groups.map((group) => group.getAttribute("aria-label"))))
    .toEqual(["In shop / Follow up", "Upcoming work"]);
  await page.screenshot({ path: "test-results/pm-grouped-desktop.png", fullPage: false });

  // Native browser printing uses the same monochrome paper as Print PDF.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-pm-paper]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print PDF" })).toBeHidden();
  const colors = await page.locator("[data-pm-paper]").evaluate((paper) => [...new Set(
    [paper, ...paper.querySelectorAll("*")].flatMap((element) => {
      const style = getComputedStyle(element);
      return [style.color, style.backgroundColor, style.borderTopColor];
    }),
  )]);
  for (const color of colors) {
    const rgb = color.match(/[\d.]+/g)?.map(Number);
    expect(rgb, color).toBeTruthy();
    expect(rgb![0], color).toBe(rgb![1]);
    expect(rgb![1], color).toBe(rgb![2]);
  }
  await page.emulateMedia({ media: "screen" });

  const full = await api.get("/api/pdf", { params: { path: "/pm-mileage" }, timeout: 90_000 });
  expect(full.ok(), await full.text().then((text) => text.slice(0, 80))).toBe(true);
  const fullBytes = await full.body();
  const pages = await pdfText(fullBytes);
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.every((text) => text.includes("PM Mileage") && text.includes("Miles left"))).toBe(true);
  const text = pages.join(" ");
  expect(text.indexOf("In shop / Follow up")).toBeLessThan(text.indexOf("Upcoming work"));
  expect(text).toContain("END OF SHOP NOTE");
  expect(text).toContain("HOLD");
  expect(text).toContain("SPLIT");
  expect(text).toContain("+25");
  expect(text).toContain("+250");
  expect(text).not.toContain("Unlock to edit");
  expect(text).not.toContain("Dark Mode");
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/pm-mileage-full.pdf", fullBytes);

  // The button carries the active view into the snapshot/cache and printed PDF.
  await page.getByRole("searchbox", { name: "Search buses", exact: true }).fill("6404");
  const responsePromise = context.waitForEvent("response", { predicate: (r) => r.url().includes("/api/pdf?") && r.url().includes("pmQuery=6404"), timeout: 90_000 });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print PDF" }).click();
  const popup = await popupPromise;
  const filtered = await responsePromise;
  expect(filtered.ok()).toBe(true);
  // Chromium hands inline PDFs to its viewer, which doesn't expose a response
  // body over CDP. Read the same URL through the API (also exercises the cache).
  const filteredBytes = await (await api.get(filtered.url())).body();
  const filteredPages = await pdfText(filteredBytes);
  expect(filteredPages).toHaveLength(1);
  expect(filteredPages[0]).toContain("2 PMs");
  expect(filteredPages[0]).toContain("6404");
  expect(filteredPages[0]).toContain("Trans PM");
  expect(filteredPages[0]).toContain("Change front hub fluid.");
  expect(filteredPages[0]).toContain("Change differential fluid.");
  expect(filteredPages[0]).toContain("PM NOTE ONLY");
  expect(filteredPages[0]).not.toContain("FLAG NOTE ONLY");
  expect(filteredPages[0]).not.toContain("6450");
  await writeFile("test-results/pm-mileage-filtered.pdf", filteredBytes);
  await popup.close();

  await page.emulateMedia({ media: "print" });
  const nativeBytes = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const nativePages = await pdfText(nativeBytes);
  expect(nativePages).toHaveLength(1);
  expect(nativePages[0]).toContain("+25");
  expect(nativePages[0]).toContain("+250");
  expect(nativePages[0]).toContain("Change front hub fluid.");
  expect(nativePages[0]).toContain("Change differential fluid.");
  expect(nativePages[0]).not.toContain("Unlock to edit");
  expect(nativePages[0]).not.toContain("Dark Mode");
  await writeFile("test-results/pm-mileage-native.pdf", nativeBytes);
  await page.emulateMedia({ media: "screen" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Print PDF" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/pm-print-phone.png", fullPage: true });
});
