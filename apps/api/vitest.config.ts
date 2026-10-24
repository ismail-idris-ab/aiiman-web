import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/global-setup.ts"],
    // The first run downloads the MongoDB test binary (~780 MB) in global setup.
    hookTimeout: 600_000,
  },
});
