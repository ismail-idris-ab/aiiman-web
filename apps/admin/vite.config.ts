import { readFileSync } from "node:fs";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

interface VercelConfig {
  headers: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
}

/**
 * The production headers from the root vercel.json, so `vite preview` runs
 * the built admin under the same strict CSP it gets on Vercel. Dev skips
 * them: React Refresh needs an inline script.
 */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(
    readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
  ) as VercelConfig;
  const all = config.headers.find((rule) => rule.source === "/(.*)");
  return Object.fromEntries(
    (all?.headers ?? [])
      // HSTS on localhost would pin the browser to https for every local port.
      .filter((header) => header.key !== "Strict-Transport-Security")
      .map((header) => [header.key, header.value]),
  );
}

// Keep the browser's Host header (Vite's string shorthand rewrites it to the
// target), so the API's same-origin check sees what it sees on Vercel.
const apiProxy = {
  "/api": { target: "http://localhost:3001", changeOrigin: false },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    // Same-origin in dev too: the browser only ever talks to the admin origin.
    proxy: apiProxy,
  },
  preview: {
    port: 3002,
    proxy: apiProxy,
    headers: productionHeaders(),
  },
});
