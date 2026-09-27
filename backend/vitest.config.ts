import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup-env.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Tests share one Postgres DB + Redis DB, so run files one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
