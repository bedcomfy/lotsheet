import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { FUSION_HOME, FUSION_ORIGIN, FUSION_REQUEST_HEADER } from "../app/lib/fusion/config";

const COOKIE = "__Secure-pace-fusion-access";
async function mockFusion(context: BrowserContext, ttl = 14400) {
  let issues = 0;
  const paths: string[] = [];
  await context.route(FUSION_ORIGIN + "/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    paths.push(path);
    expect(request.method()).toBe("GET");
    if (path === "/fscmUI/faces/FuseWelcome") {
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Mock Fusion</title><h1>Mock Fusion</h1><a id='favorite'>Connect Lotsheet</a>" });
    } else if (path === "/fscmRestApi/anticsrf") {
      await route.fulfill({ json: { xsrftoken: "mock-private-csrf" } });
    } else if (path === "/fscmRestApi/tokenrelay") {
      expect((await request.allHeaders())["x-xsrf-token"]).toBe("mock-private-csrf");
      issues++;
      const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttl })).toString("base64url");
      await route.fulfill({ json: { access_token: "e30." + payload + ".mock-token-" + issues } });
    } else {
      // There must be no browser-side data reads after the token handoff.
      await route.fulfill({ status: 404, json: {} });
      throw new Error("Unexpected browser request to Oracle: " + path);
    }
  });
  return { paths, issues: () => issues };
}

async function connect(context: BrowserContext, page: Page) {
  const restored = page.waitForResponse(response => new URL(response.url()).pathname === "/api/fusion/session" && response.request().method() === "GET");
  await page.goto("/fusion");
  const session = await (await restored).json();
  if (session.connected) {
    await expect(page.getByText("Access saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Favorite setup", exact: true }).click();
  }
  await page.getByRole("button", { name: "Show address", exact: true }).click();
  const bookmark = await page.getByRole("textbox", { name: "Favorite address" }).inputValue();
  expect(bookmark).toMatch(/^javascript:/);
  const fusion = await context.newPage();
  await fusion.goto(FUSION_HOME);
  await fusion.locator("#favorite").evaluate((link, href) => link.setAttribute("href", href), bookmark);
  const opened = fusion.waitForEvent("popup");
  await fusion.getByRole("link", { name: "Connect Lotsheet" }).click();
  const receiver = await opened;
  await expect(receiver.getByText("Access saved", { exact: true })).toBeVisible();
  await expect(receiver).toHaveURL(/\/fusion$/);
  await expect.poll(() => fusion.evaluate(() => "__lotsheetFusionConnection" in window)).toBe(false);
  return { fusion, receiver };
}

test("save access, close Fusion, read through the server, refresh, reopen Lotsheet, reauthenticate and disconnect", async ({ context, page, browser }, testInfo) => {
  const oracle = await mockFusion(context);
  const errors: string[] = [];
  context.on("page", tab => tab.on("pageerror", error => errors.push(error.message)));
  const { fusion, receiver } = await connect(context, page);
  await fusion.close();
  const accessCookie = (await context.cookies()).find(cookie => cookie.name === COOKIE);
  expect(accessCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/api/fusion" });
  expect(accessCookie!.expires - Date.now() / 1000).toBeGreaterThan(14300);
  expect(accessCookie!.expires - Date.now() / 1000).toBeLessThanOrEqual(14400);
  const publicBrowserState = await receiver.evaluate(() => JSON.stringify({ cookie: document.cookie,
    session: { ...sessionStorage }, local: { ...localStorage } }));
  expect(publicBrowserState).not.toMatch(/mock-token|accessToken/);
  await receiver.getByRole("textbox", { name: "Work order number (optional)" }).fill("NWD-1683");
  await receiver.getByRole("button", { name: "Read records", exact: true }).click();
  await expect(receiver.getByRole("cell", { name: "NWD-1683", exact: true })).toBeVisible();
  expect(await receiver.locator("body").innerText()).not.toMatch(/mock-token|never-forward/);
  await receiver.screenshot({ path: testInfo.outputPath("desktop.png"), fullPage: true });
  await receiver.setViewportSize({ width: 390, height: 844 });
  expect(await receiver.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await receiver.screenshot({ path: testInfo.outputPath("phone.png"), fullPage: true });
  await receiver.setViewportSize({ width: 1440, height: 1000 });
  await receiver.reload();
  await expect(receiver.getByText("Access saved", { exact: true })).toBeVisible();
  await receiver.goto("/home");
  await receiver.goto("/fusion");
  await expect(receiver.getByText("Access saved", { exact: true })).toBeVisible();
  await receiver.close();
  const reopened = await context.newPage();
  await reopened.goto("/fusion");
  await expect(reopened.getByText("Access saved", { exact: true })).toBeVisible();
  await reopened.getByRole("button", { name: "Record type" }).click();
  await reopened.getByRole("option", { name: "Assets", exact: true }).click();
  await reopened.getByRole("textbox", { name: "Asset number (optional)" }).fill("6396");
  await reopened.getByRole("button", { name: "Read records", exact: true }).click();
  await expect(reopened.getByRole("cell", { name: "Test bus", exact: true })).toBeVisible();
  expect(oracle.issues()).toBe(1);
  expect(oracle.paths).toHaveLength(3);

  const otherBrowser = await browser.newContext();
  const privateStatus = await otherBrowser.request.get("http://localhost:3002/api/fusion/session", { headers: { [FUSION_REQUEST_HEADER]: "1" } });
  expect(await privateStatus.json()).toEqual({ connected: false, expiresAt: null });
  const denied = await otherBrowser.request.get("http://localhost:3002/api/fusion/records?resource=workOrders", { headers: { [FUSION_REQUEST_HEADER]: "1" } });
  expect(denied.status()).toBe(401);
  await otherBrowser.close();

  await reopened.getByRole("button", { name: "Record type" }).click();
  await reopened.getByRole("option", { name: "Work orders", exact: true }).click();
  await reopened.getByRole("textbox", { name: "Work order number (optional)" }).fill("REAUTH");
  await reopened.getByRole("button", { name: "Read records", exact: true }).click();
  await expect(reopened.getByText("Sign in to Fusion", { exact: true })).toBeVisible();
  await expect(reopened.getByRole("button", { name: "Read records", exact: true })).toBeDisabled();
  const next = await connect(context, reopened);
  await next.fusion.close();
  expect(oracle.issues()).toBe(2);
  await next.receiver.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(next.receiver.getByText("Disconnected", { exact: true })).toBeVisible();
  expect((await context.cookies()).some(cookie => cookie.name === COOKIE)).toBe(false);
  await next.receiver.reload();
  await expect(next.receiver.getByText("Not connected", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("expires saved access without keeping Fusion open", async ({ context, page }) => {
  await mockFusion(context, 5);
  const { fusion, receiver } = await connect(context, page);
  await fusion.close();
  await expect(receiver.getByText("Sign in to Fusion", { exact: true })).toBeVisible({ timeout: 12000 });
  await expect(receiver.getByRole("button", { name: "Read records", exact: true })).toBeDisabled();
  expect((await context.cookies()).some(cookie => cookie.name === COOKIE)).toBe(false);
});
