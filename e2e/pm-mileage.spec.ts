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
  await page.getByRole("option", { name: "Hold · Inspection", exact: true }).click();
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
  const complete = page.getByRole("dialog", { name: "Complete inspection · Bus 6404" });
  await complete.getByLabel("Odometer now").fill("100000");
  await complete.getByRole("button", { name: "Confirm completion" }).click();
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

test("shared Split and Inspection Hold flags appear on both PM rows without changing order", async ({ page, context }) => {
  const api = context.request;
  await api.post("/api/admin/session", { data: { password: process.env.ADMIN_PASSWORD || "ride" } });
  for (const [index, bus] of ["6404", "6417", "6435"].entries()) {
    expect((await api.put("/api/pm-mileage", { data: { bus, odometer: 100000, nextInspType: "A-3",
      nextInspMiles: 100025 + index * 25, nextTransMiles: 100250 + index * 25,
      disposition: bus === "6435" ? "hold" : "", note: "PM note" } })).ok()).toBe(true);
  }
  await api.delete("/api/admin/session");
  for (const data of [
    { bus: "6404", flags: ["split", "hold"], holdReason: "Inspection", note: "Flag note only" },
    { bus: "6417", flags: ["hold"], holdReason: "Parade" },
    { bus: "6435", flags: ["hold"], holdReason: "Movement" },
  ]) expect((await api.post("/api/flags", { data })).ok()).toBe(true);
  await page.goto("/pm-mileage");
  const table = page.getByRole("table", { name: "Upcoming PM work" });
  const regular = table.getByRole("row", { name: "Bus 6404 A-3", exact: true });
  const trans = table.getByRole("row", { name: "Bus 6404 Trans PM", exact: true });
  for (const row of [regular, trans]) {
    const badges = row.getByRole("group", { name: "PM flags for bus 6404" });
    await expect(badges.getByText("Split", { exact: true })).toBeVisible();
    await expect(badges.getByText("Hold · Inspection", { exact: true })).toBeVisible();
    await expect(row).not.toContainText("Flag note only");
  }
  for (const bus of ["6417", "6435"]) for (const kind of ["A-3", "Trans PM"]) {
    const row = table.getByRole("row", { name: `Bus ${bus} ${kind}`, exact: true });
    await expect(row).toBeVisible();
    await expect(row.getByRole("group", { name: `PM flags for bus ${bus}` })).toHaveCount(0);
    await expect(row.getByRole("button", { name: /status/ })).not.toContainText("Hold");
  }
  const order = () => table.getByRole("rowgroup", { name: "Upcoming work", exact: true })
    .locator('[role="row"][aria-label]').evaluateAll(rows => rows.map(row => row.getAttribute("aria-label"))
      .filter(name => /^Bus (6404|6417|6435) /.test(name || "")));
  const expectedOrder = ["Bus 6404 A-3", "Bus 6417 A-3", "Bus 6435 A-3", "Bus 6404 Trans PM", "Bus 6417 Trans PM", "Bus 6435 Trans PM"];
  expect(await order()).toEqual(expectedOrder);
  await regular.getByRole("button", { name: /status/ }).click();
  await page.getByRole("option", { name: "Hold · Inspection", exact: true }).click();
  await expect(trans.getByRole("button", { name: /status/ })).toContainText("Hold · Inspection");
  const flag = (await (await api.get("/api/flags")).json()).flags["6404"];
  expect(flag).toMatchObject({ flags: expect.arrayContaining(["hold", "split"]), holdReason: "Inspection", note: "Flag note only" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("searchbox", { name: "Search buses", exact: true }).fill("6404");
  await expect(regular.getByRole("group", { name: "PM flags for bus 6404" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/pm-shared-flags-phone.png", fullPage: true });
  await api.post("/api/flags", { data: { bus: "6404", flags: ["hold"], holdReason: "Cubs Bus", note: "Flag note only" } });
  await page.reload();
  await expect(regular.getByRole("group", { name: "PM flags for bus 6404" })).toHaveCount(0);
  await expect(trans.getByRole("button", { name: /status/ })).not.toContainText("Hold");
  expect(await order()).toEqual(expectedOrder);
  await expect(regular).toContainText("at 100,025");
  await expect(trans).toContainText("at 100,250");
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

test("crew completes both PMs, sees every bus in history, and undoes through Info without unlocking", async ({ page, context }) => {
  const api = context.request;
  await api.post("/api/admin/session", { data: { password: process.env.ADMIN_PASSWORD || "ride" } });
  expect((await api.put("/api/pm-mileage", { data: {
    bus: "6457", odometer: 100000, lastInspType: null, lastInspMiles: null, lastInspDate: null,
    lastTransMiles: null, lastTransDate: null, nextInspType: "A-3", nextInspMiles: 100025, nextTransMiles: 100250,
  } })).ok()).toBe(true);
  expect((await api.put("/api/pm-mileage", { data: {
    bus: "6460", lastInspType: "B-6", lastInspMiles: 120000, lastInspDate: "10/1/26",
    lastTransMiles: 75000, lastTransDate: "10/1/26",
  } })).ok()).toBe(true);
  await api.delete("/api/admin/session");
  await page.goto("/pm-mileage");
  const headers = page.getByRole("table", { name: "Upcoming PM work" }).getByRole("columnheader");
  await expect(headers.last()).toHaveText("Actions");
  await expect(headers.nth(6)).toHaveText("Note");
  await page.getByRole("searchbox", { name: "Search buses", exact: true }).fill("6457");
  const regular = page.getByRole("row", { name: "Bus 6457 A-3", exact: true });
  await regular.getByRole("button", { name: "Complete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Complete inspection · Bus 6457" });
  await expect(dialog.getByLabel("Date", { exact: true })).not.toHaveValue("");
  await expect(dialog.getByLabel("Time (Chicago)", { exact: true })).not.toHaveValue("");
  await expect(dialog.getByLabel("Odometer now")).toHaveValue("");
  await expect(dialog.getByLabel("Inspection done")).toHaveAttribute("readonly", "");
  await dialog.getByRole("button", { name: "Confirm completion" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Enter the odometer reading");
  await dialog.getByLabel("Odometer now").fill("100050");
  await dialog.getByLabel("Foreman / SR").fill("Jordan Smith");
  await page.screenshot({ path: "test-results/pm-crew-complete-desktop.png", animations: "disabled" });
  await dialog.getByRole("button", { name: "Confirm completion" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: "Bus 6457 B-6", exact: true })).toContainText("at 103,025");
  const trans = page.getByRole("row", { name: "Bus 6457 Trans PM", exact: true });
  await expect(trans).toContainText("at 100,250");
  await page.setViewportSize({ width: 390, height: 844 });
  await trans.getByRole("button", { name: "Complete", exact: true }).click();
  const transDialog = page.getByRole("dialog", { name: "Complete trans PM · Bus 6457" });
  await transDialog.getByLabel("Odometer now").fill("100260");
  await transDialog.getByLabel("Foreman / SR").fill("Alex Rivera");
  await page.screenshot({ path: "test-results/pm-crew-complete-phone.png", animations: "disabled" });
  await transDialog.getByRole("button", { name: "Confirm completion" }).click();
  await expect(transDialog).toBeHidden();
  await page.getByRole("radio", { name: "Completed", exact: true }).click();
  const completed = page.getByRole("table", { name: "Completed inspections" });
  await expect(completed.getByRole("row", { name: /^Completed work for bus/ }).first()).toHaveAttribute("aria-label", "Completed work for bus 6457");
  const buses = (await (await api.get("/api/buses")).json()).master.buses;
  expect(await completed.getByRole("row", { name: /^Completed work for bus/ }).count()).toBe(buses.filter((bus: { num: string; status: string }) => bus.status !== "retired" && bus.num !== "9690").length);
  const completedRow = completed.getByRole("row", { name: "Completed work for bus 6457", exact: true });
  await expect(completedRow).toContainText("Trans PM");
  await expect(completedRow.locator('[data-label="Recorded mileage"]')).toHaveText("100,250");
  await expect(completedRow.locator('[data-label="Foreman / SR"]')).toHaveText("Alex Rivera");
  await expect(completedRow.locator('[data-label="Completed"]')).toHaveText(/\d+\/\d+\/\d{4}, \d+:\d{2}:\d{2} [AP]M/);
  const importedRow = completed.getByRole("row", { name: "Completed work for bus 6460", exact: true });
  await expect(importedRow).toContainText("No completion recorded");
  await expect(importedRow.locator('[data-label="Completed"]')).toHaveText("—");
  await expect(importedRow.locator('[data-label="Recorded mileage"]')).toHaveText("—");
  await expect(completed).not.toContainText("Scheduled mark");
  await page.getByRole("searchbox", { name: "Search completed buses" }).fill("Alex Rivera");
  await expect(completed.getByRole("row", { name: /^Completed work for bus/ })).toHaveCount(1);
  await expect(completedRow).toBeVisible();
  await page.getByRole("searchbox", { name: "Search completed buses" }).fill("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await completed.getByRole("row", { name: /^Completed work for bus/ }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/pm-completed-phone.png", animations: "disabled" });
  await page.getByRole("button", { name: "Completion info for bus 6457" }).click();
  const info = page.getByRole("dialog", { name: "Completion history · Bus 6457" });
  await expect(info.getByText("Recorded mileage: 100,250", { exact: true })).toBeVisible();
  await expect(info.getByText("Foreman / SR: Alex Rivera", { exact: true })).toBeVisible();
  await expect(info.getByText("Foreman / SR: Jordan Smith", { exact: true })).toBeVisible();
  await expect(info).not.toContainText("Scheduled mark");
  await info.getByRole("button", { name: "Undo completion", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Undo Trans PM completion?" }).getByRole("button", { name: "Undo completion" }).click();
  await expect(info.getByText("Trans PM · Undone").first()).toBeVisible();
  await expect(info.getByText("Foreman / SR: Alex Rivera", { exact: true })).toBeVisible();
  await info.getByRole("button", { name: "Undo completion", exact: true }).click();
  await page.getByRole("dialog", { name: "Undo A-3 completion?" }).getByRole("button", { name: "Undo completion" }).click();
  await expect(info.getByText("A-3 · Undone").first()).toBeVisible();
  await info.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("radio", { name: "Upcoming", exact: true }).click();
  await expect(regular).toContainText("at 100,025");
  await expect(regular).toContainText("100,260");
  await expect(trans).toContainText("at 100,250");
  await expect(page.getByRole("button", { name: "Unlock to edit" })).toBeVisible();
});

test("PM shop grouping, shared Hold/Split flags, and grayscale multi-page printing", async ({ page, context }) => {
  test.setTimeout(120_000);
  const api = context.request;
  await api.post("/api/admin/session", { data: { password: process.env.ADMIN_PASSWORD || "ride" } });
  const fixtures = [
    { bus: "6404", left: 25, disposition: "" },
    { bus: "6417", left: 50, disposition: "hold" },
    { bus: "6435", left: 75, disposition: "split" },
    { bus: "6450", left: 500, disposition: "shop" },
    { bus: "6451", left: 600, disposition: "follow-up" },
    { bus: "6466", left: 1000, disposition: "" },
    { bus: "6449", left: 1001, disposition: "" },
  ];
  // Enough qualifying rows to verify repeated headers and page breaks even
  // after the compact print layout excludes work beyond 1,000 miles.
  const fleet = (await (await api.get("/api/buses")).json()).master.buses as Array<{ num: string; status: string }>;
  fixtures.push(...fleet.filter((bus) => bus.status !== "retired" && bus.num !== "9690" && !fixtures.some((item) => item.bus === bus.num))
    .slice(0, 30).map((bus) => ({ bus: bus.num, left: 900, disposition: "" })));
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
  await expect(table.getByRole("row", { name: /^Bus 9690 / })).toHaveCount(0);
  const shop = table.getByRole("rowgroup", { name: "In shop / Follow up" });
  const queue = table.getByRole("rowgroup", { name: "Upcoming work" });
  await expect(shop.getByRole("row", { name: "Bus 6450 A-3", exact: true })).toBeVisible();
  await expect(shop.getByRole("row", { name: "Bus 6451 Trans PM", exact: true })).toBeVisible();
  const queueNames = await queue.locator('[role="row"][aria-label]').evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label")).filter((name) => /^Bus (6404|6417|6435) /.test(name || "")));
  expect(queueNames).toEqual(["Bus 6404 A-3", "Bus 6417 A-3", "Bus 6435 A-3", "Bus 6404 Trans PM", "Bus 6417 Trans PM", "Bus 6435 Trans PM"]);
  expect(await table.getByRole("rowgroup").evaluateAll((groups) => groups.map((group) => group.getAttribute("aria-label"))))
    .toEqual(["In shop / Follow up", "Upcoming work"]);
  await page.screenshot({ path: "test-results/pm-grouped-desktop.png", fullPage: false });

  // Native browser printing uses the same monochrome paper as Print PDF.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-pm-paper]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print PDF" })).toBeHidden();
  await expect(page.locator('[data-pm-paper] [data-pm-id="6466:inspection"]')).toBeVisible();
  await expect(page.locator('[data-pm-paper] [data-pm-id="6466:trans"]')).toHaveCount(0);
  await expect(page.locator('[data-pm-paper] [data-pm-id="6449:inspection"]')).toHaveCount(0);
  expect(await page.locator('[data-pm-paper] [data-pm-id="6404:inspection"]').evaluate((row) => row.getBoundingClientRect().height)).toBeLessThan(45);
  const paperTables = page.locator("[data-pm-paper] table");
  expect(await paperTables.evaluateAll((tables) => tables.map((table) =>
    [...table.querySelectorAll('th[scope="col"]')].map((cell) => cell.textContent),
  ))).toEqual([
    ["Bus", "Odometer", "Last serviced / last odometer reading time", "Next PM / Due at", "Miles left", "Note"],
    ["Bus", "Odometer", "Last serviced / last odometer reading time", "Next PM / Due at", "Miles left", "Note"],
  ]);
  expect(await page.locator("[data-pm-paper]").evaluate((paper) => [...new Set(
    [...paper.querySelectorAll("th, td")].map((cell) => {
      const style = getComputedStyle(cell);
      return `${style.textAlign}:${style.verticalAlign}`;
    }),
  )])).toEqual(["center:middle"]);
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
  expect(text).not.toContain("Status / Flags");
  expect(text).not.toContain("HOLD");
  expect(text).not.toContain("SPLIT");
  expect(text).toContain("+25");
  expect(text).toContain("+250");
  expect(text).toContain("+1,000");
  expect(text).not.toContain("6449");
  expect(text).not.toContain("+1,001");
  expect(text).not.toContain("Unlock to edit");
  expect(text).not.toContain("Dark Mode");
  expect(text).not.toContain("9690");
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

test("unscheduled Trans PM stays out of the queue and printouts until an admin adds its due mileage", async ({ page, context }) => {
  test.setTimeout(120_000);
  const api = context.request;
  const password = process.env.ADMIN_PASSWORD || "ride";
  expect((await api.post("/api/admin/session", { data: { password } })).ok()).toBe(true);
  expect((await api.put("/api/pm-mileage", { data: {
    bus: "6388", odometer: 383796, disposition: "shop", nextInspType: "C-24", nextInspMiles: 384000,
    lastTransMiles: null, lastTransDate: null, nextTransMiles: null,
  } })).ok()).toBe(true);
  await api.delete("/api/admin/session");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pm-mileage");
  await page.getByRole("searchbox", { name: "Search buses", exact: true }).fill("6388");
  const inspection = page.getByRole("row", { name: "Bus 6388 C-24", exact: true });
  const trans = page.getByRole("row", { name: "Bus 6388 Trans PM", exact: true });
  await expect(inspection).toBeVisible();
  await expect(inspection.getByRole("button", { name: /status/ })).toContainText("Shop");
  await expect(trans).toHaveCount(0);
  await expect(page.getByText(/^1 of \d+ PMs/)).toBeVisible();
  await expect(page.locator('[data-pm-paper] [data-pm-id="6388:trans"]')).toHaveCount(0);

  const response = await api.get("/api/pdf", { params: { path: "/pm-mileage", pmQuery: "6388" }, timeout: 90_000 });
  expect(response.ok()).toBe(true);
  const pages = await pdfText(await response.body());
  expect(pages).toHaveLength(1);
  expect(pages[0]).toContain("1 PMs");
  expect(pages[0]).toContain("C-24");
  expect(pages[0]).not.toContain("Trans PM");
  expect(pages[0]).not.toContain("Change front hub fluid.");

  await page.getByRole("button", { name: "Unlock to edit" }).click();
  const unlock = page.getByRole("dialog", { name: "Unlock editing" });
  await unlock.getByLabel("Password").fill(password);
  await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
  await inspection.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: /Set next trans PM/ }).click();
  const edit = page.getByRole("dialog", { name: "Next trans PM · Bus 6388" });
  await edit.getByLabel("Due at (miles)").fill("384500");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(trans).toBeVisible();
  await expect(trans.getByText("at 384,500")).toBeVisible();
  await expect(trans.getByText("704", { exact: true })).toBeVisible();
  await expect(page.getByText(/^2 of \d+ PMs/)).toBeVisible();
  await expect(inspection.getByText("at 384,000")).toBeVisible();
  const record = (await (await api.get("/api/pm-mileage")).json()).records["6388"];
  expect(record.lastTransMiles).toBeNull();
  expect(record.nextTransMiles).toBe(384500);
  expect(record.nextInspMiles).toBe(384000);
});
