import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic + data-layer tests run in Node. The data-layer test uses an
    // in-memory PGlite so it never touches the dev database.
    environment: "node",
    env: { PGLITE_DATA: "memory" },
    include: ["app/**/*.test.ts"],
  },
});
