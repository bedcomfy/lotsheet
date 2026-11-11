import { expect, test, type Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { mkdir, writeFile } from "node:fs/promises";

async function pdfContent(bytes: Buffer) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  expect(pdf.numPages).toBe(1);
  const page = await pdf.getPage(1);
  expect(page.view).toEqual([0, 0, 612, 792]);
  const text = (await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
  await pdf.destroy();
  return text;
}

async function grid(page: Page, id: string) {
  return page.locator(`[data-sheet-id="${id}"]`).evaluate((paper) => {
    const origin = paper.getBoundingClientRect();
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return [rect.x - origin.x, rect.y - origin.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100);
    };
    const rows = [...paper.querySelectorAll("tbody > tr")];
    return {
      paper: [origin.width, origin.height],
      table: box(paper.querySelector("table")!),
      cells: rows.slice(1).flatMap((row) => [...row.children].map(box)),
      buses: [...paper.querySelectorAll("[data-bus], .fuelt__busnum")].map((bus) => bus.getAttribute("data-bus") || bus.textContent),
      bodyText: rows.slice(1).map((row) => row.textContent),
    };
  });
}

async function centeredCustomHeader(page: Page) {
  const bounds = await page.locator('[data-sheet-id="custom-sheet"]').evaluate((paper) => {
    const page = paper.getBoundingClientRect();
    const title = paper.querySelector('[data-sheet-title]')!.getBoundingClientRect();
    const date = paper.querySelector('[data-sheet-date]')!.getBoundingClientRect();
    const table = paper.querySelector('table')!.getBoundingClientRect();
    return {
      centerOffset: Math.abs((title.left + title.right) / 2 - (page.left + page.right) / 2),
      gap: date.left - title.right,
      rightInset: table.right - date.right,
      titleAlign: getComputedStyle(paper.querySelector('[data-sheet-title]')!).textAlign,
    };
  });
  expect(bounds.centerOffset).toBeLessThan(1);
  expect(bounds.titleAlign).toBe("center");
  expect(bounds.gap).toBeGreaterThanOrEqual(8);
  expect(bounds.rightInset).toBeGreaterThanOrEqual(0);
  expect(bounds.rightInset).toBeLessThan(10);
}

test("copies match Fuel geometry and roster on screen and paper without changing Fuel", async ({ page, context }) => {
  test.setTimeout(120_000);
  const api = context.request;
  const savedFuel = { date: "11/10/26", ns: "", start: "", end: "", entries: { "2770": { gals: "44.2", serv: "FX" } } };
  const savedMonthly = { version: 1, month: "2026-11", entries: { "2770": { date: "11/09", serv: "123456" }, "25538": { date: "11/01", serv: "654321" } } };
  expect((await api.put("/api/state/fuel", { data: { value: savedFuel } })).ok()).toBe(true);
  expect((await api.put("/api/state/monthly-cleaning", { data: { value: savedMonthly } })).ok()).toBe(true);

  for (const media of ["screen", "print"] as const) {
    await page.emulateMedia({ media });
    await page.goto("/fuel?print=1&blank=1");
    await page.locator("#print-ready").waitFor({ state: "attached" });
    const original = await grid(page, "fuel");
    for (const id of ["custom-sheet", "monthly-cleaning"]) {
      await page.goto(`/${id}?print=1&blank=1`);
      await page.locator("#print-ready").waitFor({ state: "attached" });
      const copy = await grid(page, id);
      expect(copy.paper, `${media} ${id} page size`).toEqual(original.paper);
      expect(copy.table, `${media} ${id} table bounds`).toEqual(original.table);
      expect(copy.cells, `${media} ${id} cell bounds`).toEqual(original.cells);
      expect(copy.buses, `${media} ${id} bus order`).toEqual(original.buses);
      if (id === "custom-sheet") {
        expect(copy.bodyText).toEqual(original.bodyText);
        await centeredCustomHeader(page);
      }
    }
  }
  await page.emulateMedia({ media: "screen" });
  await page.goto("/other?tab=custom-sheet");
  await expect(page.getByRole("radio", { name: "Custom Sheet", exact: true })).toBeChecked();
  const header = page.getByRole("textbox", { name: "Sheet header", exact: true });
  await header.fill("November Equipment Checks");
  await page.getByRole("textbox", { name: "Bus 2770 gallons" }).fill("12.5");
  await page.getByRole("textbox", { name: "Bus 2770 servicer" }).fill("AB");
  await expect.poll(async () => (await (await api.get("/api/state/custom-sheet")).json()).value).toMatchObject({
    header: "November Equipment Checks", entries: { "2770": { gals: "12.5", serv: "AB" } },
  });
  await page.reload();
  await expect(header).toHaveValue("November Equipment Checks");
  await expect(page.getByRole("textbox", { name: "Bus 2770 gallons" })).toHaveValue("12.5");
  await centeredCustomHeader(page);

  await page.getByRole("radio", { name: "Monthly Bus Cleaning", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Bus 2770 cleaning date" })).toHaveValue("11/09");
  await expect(page.getByRole("textbox", { name: "Bus 2770 servicer" })).toHaveValue("123456");
  await page.getByRole("textbox", { name: "Bus 2770 cleaning date" }).fill("11/10");
  await expect.poll(async () => (await (await api.get("/api/state/monthly-cleaning")).json()).value.entries["2770"].date).toBe("11/10");
  expect((await (await api.get("/api/state/monthly-cleaning")).json()).value.entries["25538"]).toEqual(savedMonthly.entries["25538"]);
  expect((await (await api.get("/api/state/fuel")).json()).value).toEqual(savedFuel);

  await mkdir("test-results/fuel-copies", { recursive: true });
  for (const id of ["fuel", "custom-sheet", "monthly-cleaning"]) {
    for (const blank of [false, true]) {
      const response = await api.get("/api/pdf", { params: { path: `/${id}`, maint: "1", ...(blank ? { blank: "1" } : {}) }, timeout: 90_000 });
      expect(response.ok()).toBe(true);
      const bytes = await response.body();
      const text = await pdfContent(bytes);
      if (id === "custom-sheet") {
        if (blank) {
          expect(text).not.toContain("November Equipment Checks");
          expect(text).not.toContain("PNW FUEL SHEET");
          expect(text).not.toContain("12.5");
        } else {
          expect(text).toContain("November Equipment Checks");
          expect(text).toContain("12.5");
          expect(text).toContain("AB");
        }
      }
      if (id === "monthly-cleaning" && !blank) {
        expect(text).toContain("November 2026");
        expect(text).toContain("11/10");
        expect(text).toContain("123456");
      }
      await writeFile(`test-results/fuel-copies/${id}-${blank ? "blank" : "current"}.pdf`, bytes);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("radio", { name: "Custom Sheet", exact: true }).click();
  await expect(header).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/fuel-copies/custom-phone.png", fullPage: true });
  await page.getByRole("button", { name: "Print options", exact: true }).click();
  const popupPromise = page.waitForEvent("popup");
  const responsePromise = context.waitForEvent("response", {
    predicate: (response) => response.url().includes("/api/pdf?") && response.url().includes("custom-sheet") && response.url().includes("blank=1"),
    timeout: 90_000,
  });
  await page.getByRole("menuitem", { name: "Print blank form", exact: true }).click();
  const popup = await popupPromise;
  expect((await responsePromise).ok()).toBe(true);
  await expect(popup.locator("iframe")).toHaveAttribute("src", /blank=1/);
  await popup.close();
  expect((await (await api.get("/api/state/custom-sheet")).json()).value.header).toBe("November Equipment Checks");
});

test("long custom headings stay complete and readable in a one-page PDF", async ({ page, context }) => {
  const header = "Northwest garage special equipment checks and follow-up work for the November service review";
  await page.goto("/custom-sheet");
  await page.getByRole("textbox", { name: "Sheet header", exact: true }).fill(header);
  await expect.poll(async () => (await (await context.request.get("/api/state/custom-sheet")).json()).value.header).toBe(header);
  await centeredCustomHeader(page);
  const response = await context.request.get("/api/pdf", { params: { path: "/custom-sheet" }, timeout: 90_000 });
  expect(response.ok()).toBe(true);
  const bytes = await response.body();
  expect((await pdfContent(bytes)).replace(/\s+/g, " ")).toContain(header);
  await writeFile("test-results/fuel-copies/custom-long-header.pdf", bytes);
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
  await page.screenshot({ path: "test-results/fuel-copies/custom-dark.png", fullPage: true });
});

