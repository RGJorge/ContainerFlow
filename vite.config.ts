import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/client",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  define: {
    // Inject app version from package.json so UI never drifts from the source of truth
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 9420,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:9470",
      "/ws": {
        target: "http://localhost:9470",
        ws: true,
      },
    },
  },
});
