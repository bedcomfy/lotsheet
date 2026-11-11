import { chromium, defineConfig } from "@playwright/test";

// A fresh browser and an isolated in-memory database exercise the public
// default. The normal Playwright config still covers re-enabling the gate.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /site-gate-disabled\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://localhost:3001" },
  webServer: {
    command: "npm run dev -- --port 3001",
    url: "http://localhost:3001/home",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "",
      PREVIEW_DATABASE_URL: "",
      POSTGRES_URL: "",
      POSTGRES_PRISMA_URL: "",
      PGLITE_DATA: "memory",
      CHROME_EXECUTABLE_PATH: chromium.executablePath(),
      SITE_GATE_ENABLED: "",
      ADMIN_PASSWORD: "site-open-test-admin",
    },
  },
});
