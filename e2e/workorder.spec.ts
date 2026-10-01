import { expect, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import type { WorkOrder } from "../app/sheets/workorder/types";

function printFixture(operationCount = 7, partCount = 5): WorkOrder {
  const descriptions = ["FRONT TIRES MISMATCHED", "EXHAUST HANGER LOOSE/SECURE AND CHECK BRACKETS", "COOLANT RECOVERY TANK", "REPAIR ELECTRICAL", "BIKE RACK LOOSE/", "REPAIR ABS LIGHT"];
  return {
    workOrderNumber: "WO-6512", vehicleNumber: "6512", todaysDate: "10/01/2026",
    workOrderDescription: "FOLLOW-UP", vehicleDescription: "ELDO", vehicleOdometer: "449871",
    workOrderCreationDate: "10/01/2026", createdBy: "BILLY HOLCOMB",
    employees: [{ id: "e1", badge: "123", name: "First Technician" }],
    operations: Array.from({ length: operationCount }, (_, i) => ({
      id: `o${i}`, num: String((i + 1) * 10), objectCode: "2400",
      description: `${descriptions[i % descriptions.length]} OP-END-${i}`,
      date: "10/01/2026", hours: "", activity: "", assignedTo: ["e1"],
    })),
    parts: { e1: Array.from({ length: partCount }, (_, i) => ({
      id: `p${i}`, partNo: `PN-${i}`, description: `Replacement part PART-END-${i}`, qty: "1",
      serial: `SERIAL-${i}`, locator: "STOCK", operationNum: "10", issuedBy: "SR",
    })) },
  };
}

async function inspectPdf(bytes: Buffer, name: string) {
  await mkdir("tmp/pdfs", { recursive: true });
  await writeFile(`tmp/pdfs/${name}.pdf`, bytes);
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const paper = await pdf.getPage(i);
    expect(paper.view).toEqual([0, 0, 612, 792]);
    const items = (await paper.getTextContent()).items.filter((item) => "str" in item);
    const text = items.map((item) => item.str).join(" ").replace(/-\s+/g, "-");
    expect(text).toContain(`Page ${i} of ${pdf.numPages}`);
    expect(text).toContain("Revised 7/7/26");
    // Footer lives in the page margin, outside all form content. Catch the old
    // fixed-height clipping and any wrapping that escapes the page's sides.
    for (const item of items.filter((item) => item.str.trim())) {
      const isFooter = item.str.startsWith("Page ") || item.str.startsWith("Revised ");
      expect(item.transform[4], item.str).toBeGreaterThanOrEqual(35);
      expect(item.transform[4] + item.width, item.str).toBeLessThanOrEqual(577);
      if (!isFooter) {
        expect(item.transform[5], item.str).toBeGreaterThanOrEqual(36);
        expect(item.transform[5] + item.height, item.str).toBeLessThanOrEqual(768);
      }
    }
    texts.push(text);
  }
  await pdf.destroy();
  return texts;
}

test.beforeEach(async ({ request }) => {
  // These tests run against the isolated in-memory dev server.
  expect((await request.put("/api/state/workorder", { data: { value: {} } })).ok()).toBe(true);
});

test("work-order typing retains focus and cursor through edits, autosave, and employee sheets", async ({ page, request }) => {
  await page.goto("/workorder");
  await expect(page.locator("#print-ready")).toBeAttached();
  const sheet = page.locator(".wo-sheet").first();
  const fields = sheet.locator('input.wo-in:not([type="date"])');
  const count = await fields.count();
  expect(count).toBeGreaterThan(15);
  // Real keystrokes catch remounts; fill() alone would conceal this bug.
  for (let i = 0; i < count; i++) {
    const input = fields.nth(i);
    await input.click();
    await input.pressSequentially(i === 0 ? "WO-12345" : `entry-${i}-90`);
    await expect(input).toHaveValue(i === 0 ? "WO-12345" : `entry-${i}-90`);
    await expect(input).toBeFocused();
  }
  const lastInput = fields.last();
  await expect.poll(async () => (await (await request.get("/api/state/workorder")).json()).value.parts?.e1?.[0]?.issuedBy)
    .toBe(`entry-${count - 1}-90`);
  await expect(lastInput).toBeFocused();

  const number = sheet.getByRole("textbox", { name: "Work order number", exact: true });
  await number.focus();
  await number.evaluate((input: HTMLInputElement) => input.setSelectionRange(3, 3));
  await page.keyboard.type("X");
  await expect(number).toHaveValue("WO-X12345");
  await expect(number).toBeFocused();
  expect(await number.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(4);

  await page.getByRole("button", { name: "Add employee (new sheet)" }).click();
  const second = page.locator(".wo-sheet").nth(1);
  const employee = second.getByRole("textbox", { name: "Employee name", exact: true });
  await employee.pressSequentially("Second employee");
  await expect(employee).toHaveValue("Second employee");
  await expect(employee).toBeFocused();
  await expect(second.getByRole("textbox", { name: "Work order number", exact: true })).toHaveValue("WO-X12345");
  await expect.poll(async () => (await (await request.get("/api/state/workorder")).json()).value.employees?.[1]?.name).toBe("Second employee");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Employee name", exact: true }).nth(1)).toHaveValue("Second employee");
  await expect(page.getByRole("textbox", { name: "Work order number", exact: true }).first()).toHaveValue("WO-X12345");
});

test("mobile toolbar exposes blank printing and clear, preserves the draft, and prints Letter sheets", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workorder");
  await expect(page.locator("#print-ready")).toBeAttached();
  const number = page.getByRole("textbox", { name: "Work order number", exact: true }).first();
  await number.pressSequentially("WO-PRINT-123");
  await page.getByRole("button", { name: "Add employee (new sheet)" }).click();
  const printBlank = page.getByRole("button", { name: "Print blank", exact: true });
  const clear = page.getByRole("button", { name: "Clear", exact: true });
  await expect(printBlank).toBeVisible();
  await expect(clear).toBeVisible();
  await expect(page.getByRole("button", { name: "Print options", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await clear.click();
  const dialog = page.getByRole("dialog", { name: "Clear this Work Order?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(number).toHaveValue("WO-PRINT-123");

  const responsePromise = context.waitForEvent("response", { predicate: (r) => r.url().includes("/api/pdf?") && r.url().includes("blank=1"), timeout: 90_000 });
  const popupPromise = page.waitForEvent("popup");
  await printBlank.click();
  const popup = await popupPromise;
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const bytes = await (await context.request.get(response.url())).body();
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  expect(pdf.numPages).toBe(2);
  for (let i = 1; i <= pdf.numPages; i++) {
    const paper = await pdf.getPage(i);
    expect(paper.view).toEqual([0, 0, 612, 792]);
    const text = (await paper.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
    expect(text).toContain("Oracle eAM Work Order");
    expect(text).not.toContain("WO-PRINT-123");
    expect(text).not.toContain("Print blank");
    expect(text).not.toContain("Clear");
  }
  await pdf.destroy();
  await popup.close();
  await expect(number).toHaveValue("WO-PRINT-123");
  expect((await (await context.request.get("/api/state/workorder")).json()).value.workOrderNumber).toBe("WO-PRINT-123");

  await clear.click();
  await dialog.getByRole("button", { name: "Clear work order", exact: true }).click();
  await expect(number).toHaveValue("");
  await expect(page.locator(".wo-sheet")).toHaveCount(1);
});

test("seven-operation work order fits with complete parts, wrapped descriptions, and a separate footer", async ({ request, page }) => {
  test.setTimeout(120_000);
  const data = printFixture();
  expect((await request.put("/api/state/workorder", { data: { value: data } })).ok()).toBe(true);
  const response = await request.get("/api/pdf?path=/workorder");
  expect(response.ok()).toBe(true);
  const texts = await inspectPdf(await response.body(), "workorder-seven-operations");
  expect(texts).toHaveLength(1);
  for (let i = 0; i < 7; i++) expect(texts[0]).toContain(`OP-END-${i}`);
  for (let i = 0; i < 5; i++) expect(texts[0]).toContain(`PART-END-${i}`);
  expect(texts[0]).toContain("SECURE AND CHECK BRACKETS");

  await page.goto("/workorder");
  await expect(page.locator("#print-ready")).toBeAttached();
  await expect(page.locator("[data-workorder-paper]")).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".wo-sheet")).toBeHidden();
  const paper = page.locator("[data-workorder-paper]");
  await expect(paper).toBeVisible();
  expect(await paper.locator("[data-operation] td").first().evaluate((cell) => getComputedStyle(cell).fontWeight)).toBe("400");
  const nativeTexts = await inspectPdf(await page.pdf({ preferCSSPageSize: true, printBackground: true }), "workorder-native-print");
  expect(nativeTexts.map((text) => text.replace(/\s+/g, " "))).toEqual(texts.map((text) => text.replace(/\s+/g, " ")));
});

test("long work orders continue onto numbered pages with every assigned operation and part", async ({ request }) => {
  test.setTimeout(120_000);
  const data = printFixture(28, 22);
  data.employees.push({ id: "e2", badge: "456", name: "Second Technician" });
  data.operations.forEach((operation, i) => { if (i < 3) operation.assignedTo.push("e2"); });
  data.parts.e2 = [{ ...data.parts.e1[0], id: "second-part", description: "SECOND EMPLOYEE PART" }];
  expect((await request.put("/api/state/workorder", { data: { value: data } })).ok()).toBe(true);
  const response = await request.get("/api/pdf?path=/workorder");
  expect(response.ok()).toBe(true);
  const texts = await inspectPdf(await response.body(), "workorder-continuations");
  expect(texts.length).toBeGreaterThanOrEqual(4);
  const text = texts.join(" ");
  for (let i = 0; i < 28; i++) {
    expect(text.match(new RegExp(`OP-END-${i}(?![0-9])`, "g"))?.length).toBe(i < 3 ? 2 : 1);
  }
  for (let i = 0; i < 22; i++) expect(text).toContain(`PART-END-${i}`);
  for (const [i, content] of texts.entries()) {
    expect(content).toContain("WO-6512");
    expect(content).toContain(i === texts.length - 1 ? "Second Technician" : "First Technician");
  }
  expect(texts.at(-1)).toContain("SECOND EMPLOYEE PART");
  expect(texts.at(-1)).toContain("Oracle eAM Work Order");
});

test("a description taller than one page is fully preserved", async ({ request }) => {
  test.setTimeout(120_000);
  const data = printFixture(1, 1);
  data.operations[0].description = Array.from({ length: 180 }, (_, i) => `CHECK-${i} inspect wiring and confirm repair.`).join(" ");
  data.parts.e1[0].description = "END OF LONG ORDER";
  expect((await request.put("/api/state/workorder", { data: { value: data } })).ok()).toBe(true);
  const response = await request.get("/api/pdf?path=/workorder");
  expect(response.ok()).toBe(true);
  const texts = await inspectPdf(await response.body(), "workorder-tall-row");
  expect(texts.length).toBeGreaterThan(1);
  const text = texts.join(" ");
  for (let i = 0; i < 180; i++) expect(text).toContain(`CHECK-${i}`);
  expect(text).toContain("END OF LONG ORDER");
});
