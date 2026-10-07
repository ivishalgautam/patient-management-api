import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    globalSetup: ["test/setup/global-setup.js"],
    setupFiles: ["test/setup/env.js"],
    // Tests share one database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
