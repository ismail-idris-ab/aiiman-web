import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    // Same-origin in dev too: the browser only ever talks to the admin origin.
    proxy: { "/api": "http://localhost:3001" },
  },
});
