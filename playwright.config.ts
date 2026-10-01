import { chromium, defineConfig } from "@playwright/test";

// End-to-end smoke tests. Run once: `npx playwright install chromium`, then
// `npm run e2e` (starts the dev server automatically). Vitest owns unit + data-
// layer tests (app/**/*.test.ts); these cover whole-page rendering.
//
// The site gate (proxy.ts) hides every page behind the decoy typing test, so a
// setup project unlocks once and every other test reuses that cookie jar.
const GATE_PASSPHRASE = "e2e typing gate";
const GATE_STATE = "tmp/playwright/gate.json";

export default defineConfig({
  testDir: "./e2e",
  // Next dev compiles routes lazily and the PDF route launches Chromium. Running
  // several of those jobs at once turns useful smoke tests into resource races.
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  projects: [
    { name: "gate", testMatch: /gate\.setup\.ts/ },
    { name: "chromium", testIgnore: /gate\.setup\.ts/, dependencies: ["gate"], use: { storageState: GATE_STATE } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      CHROME_EXECUTABLE_PATH: chromium.executablePath(),
      PGLITE_DATA: "memory",
      SITE_GATE_PASSPHRASE: GATE_PASSPHRASE,
    },
  },
});
