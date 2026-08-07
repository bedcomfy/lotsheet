import { expect, test } from "@playwright/test";

function storyUrl(
  id: string,
  globals: { theme?: "light" | "dark"; safeArea?: "none" | "phone" } = {},
) {
  const theme = globals.theme ?? "light";
  const safeArea = globals.safeArea ?? "none";
  return `/iframe.html?id=${id}&viewMode=story&globals=theme:${theme};safeArea:${safeArea}`;
}

test("foundation tokens stay consistent in both themes", async ({ page }) => {
  await page.goto(storyUrl("foundation-tokens--color-and-type"));
  await expect(page.locator(".ui-story-canvas")).toHaveScreenshot(
    "foundation-light.png",
  );

  await page.goto(
    storyUrl("foundation-tokens--color-and-type", { theme: "dark" }),
  );
  await expect(page.locator(".ui-story-canvas")).toHaveScreenshot(
    "foundation-dark.png",
  );
});

test("buttons and fields retain their hierarchy", async ({ page }) => {
  await page.goto(storyUrl("components-button--all-states"));
  await expect(page.locator(".ui-story-canvas")).toHaveScreenshot(
    "button-states.png",
  );

  await page.goto(storyUrl("components-fields--field-set"));
  await expect(page.locator(".ui-story-canvas")).toHaveScreenshot(
    "field-states.png",
  );
});

test("operational controls stay consistent across themes", async ({ page }) => {
  await page.goto(storyUrl("components-operational-controls--all-states"));
  await expect(page.locator(".ui-story-canvas")).toHaveScreenshot(
    "operational-controls-light.png",
  );

  await page.goto(
    storyUrl("components-operational-controls--all-states", {
      theme: "dark",
    }),
  );
  await expect(page.locator(".ui-story-canvas")).toHaveScreenshot(
    "operational-controls-dark.png",
  );
});

test("page empty loading and error states remain deliberate", async ({ page }) => {
  for (const state of ["empty", "loading", "error"]) {
    await page.goto(storyUrl(`patterns-page-states--${state}`));
    await expect(page.locator(".ui-story-canvas")).toHaveScreenshot(
      `page-state-${state}.png`,
    );
  }
});

test("long menus remain within a phone safe area", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    storyUrl("components-action-menu--long-operational-list", {
      theme: "dark",
      safeArea: "phone",
    }),
  );
  await page.getByRole("button", { name: "Choose location" }).click();
  await expect(page.locator("[role=menu]")).toBeVisible();
  await expect(page).toHaveScreenshot("long-menu-phone.png");
});

test("long dialogs keep their actions visible on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    storyUrl("patterns-responsive-dialog--phone-with-long-content", {
      theme: "dark",
      safeArea: "phone",
    }),
  );
  await page.getByRole("button", { name: "Open bus editor" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save changes" })).toBeVisible();
  await expect(page).toHaveScreenshot("long-dialog-phone.png");

  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
});

test("contained phone dialogs keep one scroll owner above the keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    storyUrl("patterns-workflow-regressions--phone-dialog-with-long-locations", {
      theme: "dark",
      safeArea: "phone",
    }),
  );

  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--ui-viewport-height", "500px");
    root.style.setProperty("--ui-viewport-top", "0px");
    root.setAttribute("data-ui-keyboard-open", "");
  });

  const dialog = page.getByRole("dialog");
  const body = dialog.locator("[data-dialog-body]");
  const scrollRegion = dialog.locator("[data-dialog-scroll-region]");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(500);

  const bodyGeometry = await body.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(bodyGeometry.scrollHeight - bodyGeometry.clientHeight).toBeLessThanOrEqual(1);

  const scrollGeometry = await scrollRegion.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return {
      max: element.scrollHeight - element.clientHeight,
      top: element.scrollTop,
    };
  });
  expect(scrollGeometry.max).toBeGreaterThan(0);
  expect(scrollGeometry.top).toBeGreaterThan(0);
});

test("mobile navigation directories keep their footer reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    storyUrl("patterns-mobile-navigation--long-directory", {
      theme: "dark",
      safeArea: "phone",
    }),
  );
  await page
    .getByRole("button", { name: "Open page directory" })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close More" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Dark mode" })).toBeVisible();
  await expect(page).toHaveScreenshot("mobile-navigation-long-phone.png");
});

test("operations shell stays coherent across themes and phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storyUrl("patterns-operations-shell--desktop"));
  await expect(
    page.getByRole("heading", { name: "Maintenance Logistics" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("operations-shell-light.png");

  await page.goto(
    storyUrl("patterns-operations-shell--desktop", { theme: "dark" }),
  );
  await expect(
    page.getByRole("heading", { name: "Maintenance Logistics" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("operations-shell-dark.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    storyUrl("patterns-operations-shell--phone", {
      theme: "dark",
      safeArea: "phone",
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Maintenance Logistics" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("operations-shell-phone.png");
});

test("Paper Lab preserves Letter and Legal physical geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1500 });
  await page.goto(storyUrl("sheets-paper-lab--letter-typical"));
  const letter = page.locator("[data-paper-page]");
  await expect(letter).toBeVisible();
  const letterBox = await letter.boundingBox();
  expect(letterBox).not.toBeNull();
  expect(Math.abs(letterBox!.width - 816)).toBeLessThan(1);
  expect(Math.abs(letterBox!.height - 1056)).toBeLessThan(1);
  await expect(page).toHaveScreenshot("paper-lab-letter.png");

  await page.setViewportSize({ width: 1100, height: 1600 });
  await page.goto(storyUrl("sheets-paper-lab--legal-typical"));
  const legal = page.locator("[data-paper-page]");
  const legalBox = await legal.boundingBox();
  expect(legalBox).not.toBeNull();
  expect(Math.abs(legalBox!.width - 816)).toBeLessThan(1);
  expect(Math.abs(legalBox!.height - 1344)).toBeLessThan(1);
  await expect(page).toHaveScreenshot("paper-lab-legal.png");
});

test("Paper Lab pans at 100% and fits Legal paper without changing its ratio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    storyUrl("sheets-paper-lab--phone-fit", {
      theme: "dark",
      safeArea: "phone",
    }),
  );
  const viewport = page.locator("[data-paper-viewport]");
  const paper = page.locator("[data-paper-page]");
  const actualBox = await paper.boundingBox();
  expect(actualBox).not.toBeNull();
  expect(Math.abs(actualBox!.width - 816)).toBeLessThan(1);
  expect(Math.abs(actualBox!.height - 1344)).toBeLessThan(1);

  const actualGeometry = await viewport.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(actualGeometry.scrollWidth).toBeGreaterThan(actualGeometry.clientWidth);
  expect(actualGeometry.scrollHeight).toBeGreaterThan(actualGeometry.clientHeight);

  await viewport.dispatchEvent("dblclick");
  await expect(viewport).toHaveAttribute("data-mobile-view", "actual");

  await page.getByRole("button", { name: "Fit whole sheet" }).click();
  await expect(viewport).toHaveAttribute("data-mobile-view", "fit");
  await expect
    .poll(async () => (await paper.boundingBox())?.width ?? 816)
    .toBeLessThanOrEqual(374);
  const fitBox = await paper.boundingBox();
  expect(fitBox).not.toBeNull();
  expect(fitBox!.height).toBeLessThan(844 - 34);
  expect(Math.abs(fitBox!.width / fitBox!.height - 8.5 / 14)).toBeLessThan(0.02);
  await expect(
    page.getByRole("button", { name: "View sheet at 100%" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("paper-lab-legal-phone-fit.png");
});

test("mobile navigation remains inset from phone edges", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    storyUrl("patterns-mobile-navigation--phone-bar", {
      theme: "light",
      safeArea: "phone",
    }),
  );

  const navigation = page.getByRole("navigation", {
    name: "Mobile navigation",
  });
  const box = await navigation.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(8);
  expect(box!.x + box!.width).toBeLessThanOrEqual(382);
  expect(box!.y + box!.height).toBeLessThanOrEqual(836);
  await expect(page).toHaveScreenshot("mobile-navigation-inset-phone.png");
});
