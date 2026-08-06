import { test, expect } from "@playwright/test";

function pdfPageCount(bytes: Buffer): number {
  return (bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

function pdfMediaBoxes(bytes: Buffer): string[] {
  return [...bytes.toString("latin1").matchAll(/\/MediaBox\s*\[\s*([^\]]+)\]/g)]
    .map((match) => match[1].trim().replace(/\s+/g, " "));
}

// Whole-page smoke tests — each route renders its shell without crashing.
test("home dashboard loads with the Available Now section", async ({ page }) => {
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Available Now" }),
  ).toBeVisible();

  const shellGeometry = await page.evaluate(() => {
    const nav = document.querySelector("nav");
    const main = document.querySelector(".appmain");
    const header = document.querySelector("header");
    if (!nav || !main || !header) return null;
    const content = main.querySelector("main");
    return {
      navRight: nav.getBoundingClientRect().right,
      mainLeft: main.getBoundingClientRect().left,
      headerBottom: header.getBoundingClientRect().bottom,
      contentTop: content?.getBoundingClientRect().top || 0,
    };
  });
  expect(shellGeometry).not.toBeNull();
  expect(shellGeometry!.mainLeft).toBeGreaterThanOrEqual(shellGeometry!.navRight);
  expect(shellGeometry!.contentTop).toBeGreaterThanOrEqual(shellGeometry!.headerBottom);
});

test("mobile home keeps navigation and status details reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");

  await expect(
    page.getByRole("heading", { name: "Maintenance Logistics" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Usable" })).toBeVisible();
  const mobileNavigation = page.getByRole("navigation", {
    name: "Mobile navigation",
  });
  await expect(mobileNavigation).toBeVisible();

  const navigationBox = await mobileNavigation.boundingBox();
  expect(navigationBox).not.toBeNull();
  expect(navigationBox!.x).toBeGreaterThanOrEqual(8);
  expect(navigationBox!.x + navigationBox!.width).toBeLessThanOrEqual(382);
  expect(navigationBox!.y + navigationBox!.height).toBeLessThanOrEqual(836);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Usable" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  for (const [buttonName, dialogName] of [
    ["Ready for Use", "Ready for Use"],
    ["In lots", "In the lots"],
    ["In shop", "In the shop"],
    ["Off property", "Off property"],
  ]) {
    await page.getByRole("button", { name: new RegExp(buttonName, "i") }).last().click();
    const placementDialog = page.getByRole("dialog", { name: dialogName });
    await expect(placementDialog).toBeVisible();
    await placementDialog.getByRole("button", { name: "Close" }).click();
  }

  await page.getByRole("button", { name: "Sheets", exact: true }).click();
  const sheetsHub = page.getByRole("dialog", { name: "Sheets" });
  await expect(sheetsHub).toBeVisible();
  await expect(sheetsHub.getByRole("button", { name: /Service Sheets/ })).toBeVisible();
});

test("major routes stay inside modern phone viewports", async ({ page }) => {
  const viewports = [
    { width: 360, height: 800 },
    { width: 375, height: 812 },
    { width: 430, height: 932 },
  ];
  const routes = [
    "/home",
    "/",
    "/turnover",
    "/service?tab=fuel",
    "/shop",
    "/buses",
    "/staffing/seniority",
    "/object-codes",
    "/audit",
    "/workorder",
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("body")).not.toBeEmpty();
      await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);

      const geometry = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(
        geometry.scrollWidth - geometry.clientWidth,
        `${route} at ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(0);

      const navigation = page.getByRole("navigation", {
        name: "Mobile navigation",
      });
      await expect(navigation).toBeVisible();
      const navBox = await navigation.boundingBox();
      expect(navBox).not.toBeNull();
      expect(navBox!.x).toBeGreaterThanOrEqual(8);
      expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(viewport.width - 8);
      expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(viewport.height - 8);
    }
  }
});

test("nested mobile workflows yield one viewport-safe dialog at a time", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await page.getByRole("button", { name: "Shop", exact: true }).click();
  const shop = page.getByRole("dialog", { name: "Shop" });
  await expect(shop).toBeVisible();
  await shop.getByRole("button", { name: "Edit" }).first().click();

  const apron = page.getByRole("dialog", { name: "Apron" });
  await expect(apron).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(apron.getByRole("button", { name: "Done" })).toBeVisible();
  const apronBox = await apron.boundingBox();
  expect(apronBox).not.toBeNull();
  expect(apronBox!.y).toBeGreaterThanOrEqual(0);
  expect(apronBox!.y + apronBox!.height).toBeLessThanOrEqual(812);

  await apron.getByRole("button", { name: "Done" }).click();
  await expect(shop).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await shop.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
});

test("small printable fields prevent focus zoom without disabling pinch zoom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/turnover");

  const viewportMeta = page.locator('meta[name="viewport"]');
  const original = await viewportMeta.getAttribute("content");
  const paperInput = page.locator("[data-paper-page] input").first();
  await expect(paperInput).toBeAttached();
  await paperInput.focus();
  await expect
    .poll(() => viewportMeta.getAttribute("content"))
    .toContain("maximum-scale=1");

  await paperInput.evaluate((input) => input.blur());
  await expect.poll(() => viewportMeta.getAttribute("content")).toBe(original);
});

test("a scoped clear preserves a simultaneous edit in another location", async ({
  page,
  request,
}) => {
  // The E2E server uses an isolated in-memory database, so this exercises the
  // real shared operation API without touching local or production data.
  await request.patch("/api/sheet", {
    data: {
      lots: {
        north: ["6401"],
        east: ["6402"],
        bay: ["X", "6403"],
      },
      actor: "e2e-setup",
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/turnover");
  await page.getByText("6401", { exact: true }).click();

  const editor = page.getByRole("dialog", { name: "North Lot" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Clear North Lot" }).click();

  const confirmation = page.getByRole("dialog", { name: "Clear North Lot?" });
  await expect(confirmation).toBeVisible();
  await request.patch("/api/sheet", {
    data: { lots: { east: ["6499"] }, actor: "e2e-other-device" },
  });
  await confirmation.getByRole("button", { name: "Clear location" }).click();

  await expect.poll(async () => {
    const response = await request.get("/api/sheet");
    return (await response.json()).sheet?.lots;
  }).toMatchObject({ north: [], east: ["6499"], bay: ["X", "6403"] });

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => {
    const response = await request.get("/api/sheet");
    return (await response.json()).sheet?.lots;
  }).toMatchObject({ north: ["6401"], east: ["6499"], bay: ["X", "6403"] });
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

test("mobile lot tools keep every action and the footer reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page
    .getByRole("button", { name: "Tools", exact: true })
    .click();

  const dialog = page.getByRole("dialog", { name: "Lot Sheet tools" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Clear grid" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Clear lots" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});

test("mobile fill rows and lot editor keep fixed actions on screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Fill", exact: true }).click();
  const fillDialog = page.getByRole("dialog", { name: "Fill Rows" });
  await expect(fillDialog).toBeVisible();
  await expect(fillDialog.getByRole("button", { name: "Done" })).toBeVisible();
  const fillBody = fillDialog.locator("[data-dialog-body]");
  const fillScroll = await fillBody.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return {
      max: element.scrollHeight - element.clientHeight,
      top: element.scrollTop,
    };
  });
  expect(fillScroll.max).toBeGreaterThan(0);
  expect(fillScroll.top).toBeGreaterThan(0);
  await expect(
    fillDialog.getByRole("textbox").last(),
  ).toBeInViewport();
  await expect(fillDialog.getByRole("button", { name: "Done" })).toBeVisible();
  await fillDialog.getByRole("button", { name: "Done" }).click();
  await expect(fillDialog).toBeHidden();

  await page
    .getByRole("button", { name: /^EAST LOT \(\d+\)/ })
    .click();
  const lotDialog = page.getByRole("dialog", { name: "East lot" });
  await expect(lotDialog).toBeVisible();
  await expect(lotDialog.getByRole("button", { name: "Done" })).toBeVisible();

  const box = await lotDialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
});

test("print mode excludes application chrome", async ({ page }) => {
  await page.goto("/?print=1");

  await expect(page.locator(".sheet").first()).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await expect(page.locator("header")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toHaveCount(0);
});

test("Work Order print content stays inside its Letter page", async ({
  page,
}) => {
  await page.emulateMedia({ media: "print" });
  await page.goto("/workorder?print=1&blank=1");
  await expect(page.locator("#print-ready")).toBeAttached();
  const geometry = await page.evaluate(() => {
    const sheet = document.querySelector(".wo-sheet");
    const viewport = document.querySelector("[data-paper-viewport]");
    if (!sheet || !viewport) return null;
    const sheetRect = sheet.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    return {
      topDelta: sheetRect.top - viewportRect.top,
      display: getComputedStyle(sheet).display,
    };
  });
  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry!.topDelta)).toBeLessThan(1);
  expect(geometry!.display).toBe("flow-root");
});

test("registered sheet previews retain their physical paper geometry", async ({
  page,
}) => {
  const sheets = [
    { path: "/fuel", width: 816, height: 1056 },
    { path: "/def", width: 816, height: 1056 },
    { path: "/farebox", width: 816, height: 1056 },
    { path: "/turnover", width: 816, height: 1344 },
    { path: "/workorder", width: 816, height: 1056 },
  ];

  for (const sheet of sheets) {
    await page.goto(sheet.path);
    await expect.poll(async () => page.evaluate(() => {
      const paper = document.querySelector("[data-paper-page]");
      if (!paper) return null;
      const box = paper.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    })).toEqual({ width: sheet.width, height: sheet.height });
  }
});

test("production PDF renderer honors every registered paper profile", async ({
  request,
}) => {
  const sheets = [
    { path: "/", mediaBox: "0 0 612 792", min: 1, max: 1 },
    { path: "/fuel", mediaBox: "0 0 612 792", min: 1, max: 2 },
    { path: "/def", mediaBox: "0 0 612 792", min: 1, max: 3 },
    { path: "/farebox", mediaBox: "0 0 612 792", min: 1, max: 10 },
    { path: "/service/print-all", mediaBox: "0 0 612 792", min: 3, max: 16 },
    { path: "/service/print-blank", mediaBox: "0 0 612 792", min: 3, max: 16 },
    { path: "/turnover", mediaBox: "0 0 612 1008", min: 1, max: 1 },
    { path: "/workorder", mediaBox: "0 0 612 792", min: 1, max: 1 },
  ];

  for (const sheet of sheets) {
    const response = await request.get("/api/pdf", {
      params: { path: sheet.path, blank: "1" },
      timeout: 120_000,
    });
    expect(response.ok(), `${sheet.path} PDF response`).toBe(true);
    const bytes = await response.body();
    const pages = pdfPageCount(bytes);
    expect(pages, `${sheet.path} page count`).toBeGreaterThanOrEqual(sheet.min);
    expect(pages, `${sheet.path} page count`).toBeLessThanOrEqual(sheet.max);
    expect(pdfMediaBoxes(bytes), `${sheet.path} MediaBox`).toContain(sheet.mediaBox);
  }
});

test("mobile paper previews pan at 100% and fit clear of navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const fixture of [
    {
      path: "/service?tab=fuel",
      sheetId: "fuel",
      width: 816,
      height: 1056,
      ratio: 8.5 / 11,
    },
    {
      path: "/service?tab=def",
      sheetId: "def",
      width: 816,
      height: 1056,
      ratio: 8.5 / 11,
    },
    {
      path: "/service?tab=summary",
      sheetId: "service-summary",
      width: 816,
      height: 1056,
      ratio: 8.5 / 11,
    },
    {
      path: "/turnover",
      sheetId: "turnover",
      width: 816,
      height: 1344,
      ratio: 8.5 / 14,
    },
  ]) {
    await page.goto(fixture.path);
    const paper = page.locator(
      `[data-sheet-id="${fixture.sheetId}"][data-paper-page]`,
    );
    const viewport = page.locator("[data-paper-viewport]");
    await expect(paper).toBeVisible();

    const actual = await paper.boundingBox();
    expect(actual).not.toBeNull();
    expect(Math.abs(actual!.width - fixture.width)).toBeLessThan(1);
    expect(Math.abs(actual!.height - fixture.height)).toBeLessThan(1);

    const panGeometry = await viewport.evaluate((element) => ({
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
    }));
    expect(panGeometry.scrollWidth).toBeGreaterThan(panGeometry.clientWidth);
    expect(panGeometry.scrollHeight).toBeGreaterThan(panGeometry.clientHeight);

    const navigation = await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .boundingBox();
    const actualViewport = await viewport.boundingBox();
    expect(navigation).not.toBeNull();
    expect(actualViewport).not.toBeNull();
    expect(actualViewport!.y + actualViewport!.height).toBeLessThanOrEqual(
      navigation!.y,
    );

    await page.getByRole("button", { name: "Fit whole sheet" }).click();
    await expect(viewport).toHaveAttribute("data-mobile-view", "fit");
    await expect
      .poll(async () => (await paper.boundingBox())?.width ?? fixture.width)
      .toBeLessThanOrEqual(374);

    const fit = await paper.boundingBox();
    expect(fit).not.toBeNull();
    expect(Math.abs(fit!.width / fit!.height - fixture.ratio)).toBeLessThan(0.02);
    expect(fit!.y + fit!.height).toBeLessThanOrEqual(navigation!.y);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }

  await page.goto("/service?tab=farebox");
  const fareboxPage = page
    .locator('[data-sheet-id="farebox"][data-paper-page]')
    .first();
  const fareboxViewport = page.locator("[data-paper-viewport]");
  await expect(fareboxPage).toBeVisible();

  const fareboxActual = await fareboxPage.boundingBox();
  expect(fareboxActual).not.toBeNull();
  expect(Math.abs(fareboxActual!.width - 816)).toBeLessThan(1);
  expect(Math.abs(fareboxActual!.height - 1056)).toBeLessThan(1);

  await page.getByRole("button", { name: "Fit whole sheet" }).click();
  await expect(fareboxViewport).toHaveAttribute("data-mobile-view", "fit");
  await expect
    .poll(async () => (await fareboxPage.boundingBox())?.width ?? 816)
    .toBeLessThanOrEqual(374);

  const fareboxFit = await fareboxPage.boundingBox();
  const navigation = await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .boundingBox();
  const fareboxGeometry = await fareboxViewport.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(fareboxFit).not.toBeNull();
  expect(navigation).not.toBeNull();
  expect(Math.abs(fareboxFit!.width / fareboxFit!.height - 8.5 / 11)).toBeLessThan(
    0.02,
  );
  expect(fareboxGeometry.scrollHeight).toBeGreaterThan(
    fareboxGeometry.clientHeight,
  );
  const fareboxViewportBox = await fareboxViewport.boundingBox();
  expect(fareboxViewportBox).not.toBeNull();
  expect(fareboxFit!.y + fareboxFit!.height).toBeLessThanOrEqual(
    fareboxViewportBox!.y + fareboxViewportBox!.height,
  );
  expect(fareboxViewportBox!.y + fareboxViewportBox!.height).toBeLessThanOrEqual(
    navigation!.y,
  );
});

test("mobile service controls stay inside the safe viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/service?tab=summary");

  const pageSelector = page.getByRole("button", { name: "Service Sheets" });
  const selectedTab = page.getByRole("radio", { name: "Flag Summary" });
  const dateField = page.getByRole("textbox", { name: "Service sheets date" });
  await expect(selectedTab).toBeVisible();
  await expect(dateField).toBeVisible();

  for (const control of [pageSelector, selectedTab, dateField]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("object codes utility loads", async ({ page }) => {
  await page.goto("/object-codes");
  await expect(page.getByText(/of\s+\d+\s+codes/)).toBeVisible();
});
