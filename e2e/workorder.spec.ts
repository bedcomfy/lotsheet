import { expect, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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
