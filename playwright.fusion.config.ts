import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Exercise the compiled bookmark with a fully mocked Oracle origin. No Oracle
// credentials or external Oracle requests are used by this test suite.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /fusion-(connection|parts)\.spec\.ts/,
  outputDir: "test-results/fusion",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://localhost:3002", viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: "npm run start -- --port 3002",
    url: "http://localhost:3002/fusion",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "", PREVIEW_DATABASE_URL: "", POSTGRES_URL: "", POSTGRES_PRISMA_URL: "",
      PGLITE_DATA: "memory", SITE_GATE_ENABLED: "", ADMIN_PASSWORD: "fusion-test-admin",
      NODE_OPTIONS: "--import=" + pathToFileURL(resolve("e2e/fusion-fetch-mock.mjs")).href,
    },
  },
});
