import { chromium, defineConfig } from "@playwright/test";

// End-to-end smoke tests. Run once: `npx playwright install chromium`, then
// `npm run e2e` (starts the dev server automatically). Vitest owns unit + data-
// layer tests (app/**/*.test.ts); these cover whole-page rendering.
export default defineConfig({
  testDir: "./e2e",
  // Next dev compiles routes lazily and the PDF route launches Chromium. Running
  // several of those jobs at once turns useful smoke tests into resource races.
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      CHROME_EXECUTABLE_PATH: chromium.executablePath(),
      PGLITE_DATA: "memory",
    },
  },
});
