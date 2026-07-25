import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./ui-e2e",
  snapshotDir: "./ui-e2e/__snapshots__",
  timeout: 30000,
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.005,
    },
  },
  use: {
    baseURL: "http://127.0.0.1:6006",
    colorScheme: "light",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run storybook -- --ci --no-open",
    url: "http://127.0.0.1:6006",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
