import { defineConfig } from "@playwright/test";

// End-to-end smoke tests. Run once: `npx playwright install chromium`, then
// `npm run e2e` (starts the dev server automatically). Vitest owns unit + data-
// layer tests (app/**/*.test.ts); these cover whole-page rendering.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: true,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
