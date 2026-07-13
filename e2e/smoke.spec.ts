import { test, expect } from "@playwright/test";

// Whole-page smoke tests — each route renders its shell without crashing.
test("home dashboard loads with the Available Now section", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Operations Workspace" })).toBeVisible();
  await expect(page.locator(".homeavail")).toBeVisible();
});

test("staffing seniority + work pick load", async ({ page }) => {
  await page.goto("/staffing/seniority");
  await expect(page.getByRole("heading", { name: "Seniority" })).toBeVisible();
  await page.goto("/staffing/workpick");
  await expect(page.getByRole("heading", { name: "Work Pick" })).toBeVisible();
});

test("lot sheet loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sheet").first()).toBeVisible();
});

test("object codes utility loads", async ({ page }) => {
  await page.goto("/object-codes");
  await expect(page.getByText(/of\s+\d+\s+codes/)).toBeVisible();
});
