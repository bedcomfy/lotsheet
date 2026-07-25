import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig } from "vitest/config";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  optimizeDeps: {
    include: ["next/link", "@tanstack/react-query", "zod"],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          // Pure logic + data-layer tests run in Node. The data-layer test uses
          // an in-memory PGlite so it never touches the dev database.
          name: "unit",
          environment: "node",
          env: {
            PGLITE_DATA: "memory",
          },
          include: ["app/**/*.test.ts"],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
