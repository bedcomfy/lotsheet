import { expect, test } from "@playwright/test";
import { FUSION_HOME, FUSION_ORIGIN } from "../app/lib/fusion/config";

test("compiled favorite connects, reads privately, replaces rejected access, and disconnects", async ({ context, page }, testInfo) => {
  let issues = 0;
  let rejectNextRead = false;
  const requests: { path: string; method: string; authorization: string; cookie: string }[] = [];
  const errors: string[] = [];
  context.on("page", tab => tab.on("pageerror", error => errors.push(error.message)));
  await context.route(FUSION_ORIGIN + "/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = await request.allHeaders();
    requests.push({ path: url.pathname, method: request.method(), authorization: headers.authorization ?? "", cookie: headers.cookie ?? "" });
    if (url.pathname === "/fscmUI/faces/FuseWelcome") {
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Mock Fusion</title><h1>Mock Fusion</h1><a id='favorite'>Connect Lotsheet</a>" });
    } else if (url.pathname === "/fscmRestApi/anticsrf") {
      await route.fulfill({ json: { xsrftoken: "mock-private-csrf" } });
    } else if (url.pathname === "/fscmRestApi/tokenrelay") {
      expect(headers["x-xsrf-token"]).toBe("mock-private-csrf");
      issues++;
      const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 14400 })).toString("base64url");
      await route.fulfill({ json: { access_token: "e30." + payload + ".mock-private-token-" + issues } });
    } else if (url.pathname === "/fscmRestApi/resources/11.13.18.05/maintenanceWorkOrders") {
      expect(request.method()).toBe("GET");
      expect(headers.authorization).toContain("mock-private-token-" + issues);
      expect(headers.cookie).toBeUndefined();
      expect(url.searchParams.get("limit")).toBe("25");
      expect(url.searchParams.get("q")).toBe("WorkOrderNumber='NWD-1683'");
      if (rejectNextRead) {
        rejectNextRead = false;
        await route.fulfill({ status: 401, json: { error: "mock-private-response" } });
      } else await route.fulfill({ json: { items: [{ WorkOrderNumber: "NWD-1683", WorkOrderDescription: "Inspection",
        WorkOrderStatus: "Released", AssetNumber: "6396", PlannedStartDate: "2026-11-13T08:00:00Z",
        PlannedCompletionDate: null, privateField: "mock-private-business-field" }], hasMore: false } });
    } else if (url.pathname === "/fscmRestApi/resources/11.13.18.05/installedBaseAssets") {
      expect(headers.cookie).toBeUndefined();
      expect(url.searchParams.get("q")).toBe("AssetNumber='6396'");
      await route.fulfill({ json: { items: [{ AssetNumber: "6396", Description: "Test bus", ItemNumber: "BUS",
        SerialNumber: "TEST-ONLY", OperatingOrganizationCode: "NWD", CurrentLocationName: "Garage" }], hasMore: false } });
    } else {
      // The entire origin is mocked, including unexpected paths.
      await route.fulfill({ status: 404, json: {} });
    }
  });
  await context.addCookies([{ name: "mockFusionSession", value: "mock-session", domain: new URL(FUSION_ORIGIN).hostname, path: "/", secure: true }]);
  await page.goto("/fusion");
  await page.getByRole("button", { name: "Show address", exact: true }).click();
  const bookmark = await page.getByRole("textbox", { name: "Favorite address" }).inputValue();
  expect(bookmark).toMatch(/^javascript:/);
  const fusion = await context.newPage();
  await fusion.goto(FUSION_HOME);
  // This is a user-activated javascript URL, like the saved favorite. Testing
  // the actual built URL catches minifier/closure dependencies in toString().
  await fusion.locator("#favorite").evaluate((link, href) => link.setAttribute("href", href), bookmark);
  const popupPromise = fusion.waitForEvent("popup");
  await fusion.getByRole("link", { name: "Connect Lotsheet" }).click();
  const receiver = await popupPromise;
  await expect(receiver.getByText("Browser connected", { exact: true })).toBeVisible();
  await expect(receiver).toHaveURL(/\/fusion$/);
  await receiver.getByRole("textbox", { name: "Work order number (optional)" }).fill("NWD-1683");
  await receiver.getByRole("button", { name: "Read records", exact: true }).click();
  await expect(receiver.getByRole("cell", { name: "NWD-1683", exact: true })).toBeVisible();
  expect(issues).toBe(1);
  expect(requests.filter(r => r.path.endsWith("/tokenrelay"))[0].cookie).toContain("mockFusionSession");
  expect(await receiver.locator("body").innerText()).not.toContain("mock-private");
  const stored = await receiver.evaluate(() => JSON.stringify({ session: { ...sessionStorage }, local: { ...localStorage } }));
  expect(stored).not.toMatch(/mock-private|NWD-1683/);
  await receiver.screenshot({ path: testInfo.outputPath("desktop.png"), fullPage: true });
  await receiver.setViewportSize({ width: 390, height: 844 });
  const overflow = await receiver.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await receiver.screenshot({ path: testInfo.outputPath("phone.png"), fullPage: true });
  await receiver.setViewportSize({ width: 1440, height: 1000 });

  // Receiver reload re-pairs without requiring another favorite click.
  await receiver.reload();
  await expect(receiver.getByText("Browser connected", { exact: true })).toBeVisible();
  await expect(receiver.getByRole("cell", { name: "NWD-1683", exact: true })).toHaveCount(0);
  await receiver.getByRole("textbox", { name: "Work order number (optional)" }).fill("NWD-1683");
  rejectNextRead = true;
  await receiver.getByRole("button", { name: "Read records", exact: true }).click();
  await expect(receiver.getByRole("cell", { name: "NWD-1683", exact: true })).toBeVisible();
  expect(issues).toBe(2);
  await receiver.getByRole("button", { name: "Record type" }).click();
  await receiver.getByRole("option", { name: "Assets", exact: true }).click();
  await receiver.getByRole("textbox", { name: "Asset number (optional)" }).fill("6396");
  await receiver.getByRole("button", { name: "Read records", exact: true }).click();
  await expect(receiver.getByRole("cell", { name: "Test bus", exact: true })).toBeVisible();
  await receiver.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(receiver.getByText("Disconnected", { exact: true })).toBeVisible();
  await expect(receiver.getByRole("cell", { name: "Test bus", exact: true })).toHaveCount(0);
  await expect.poll(() => fusion.evaluate(() => "__lotsheetFusionConnection" in window)).toBe(false);
  expect(requests.every(r => r.method === "GET")).toBe(true);
  expect(errors).toEqual([]);
});
