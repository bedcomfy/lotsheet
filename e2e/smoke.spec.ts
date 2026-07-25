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
    page.getByRole("heading", { name: "Maintenance Logistics" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Available Now" }),
  ).toBeVisible();

  const shellGeometry = await page.evaluate(() => {
    const nav = document.querySelector("nav");
    const main = document.querySelector(".appmain");
    const header = document.querySelector("header");
    if (!nav || !main || !header) return null;
    const content = main.querySelector("h1");
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
    ["On grid", "On the grid"],
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
    .getByRole("button", { name: /^EAST LOT \(0\)/ })
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
