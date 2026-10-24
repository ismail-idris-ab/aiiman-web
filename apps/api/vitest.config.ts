import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The first run downloads the MongoDB test binary (~780 MB); later runs use the cache.
    hookTimeout: 600_000,
  },
});
