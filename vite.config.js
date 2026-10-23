import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { scopeUiStyles } from "./deploy/scope-ui-styles.js";
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [scopeUiStyles()] } },
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
  preview: {
    proxy: {
      "/api":
        process.env.MATIANE_TEST_BUILD === "1"
          ? "http://127.0.0.1:3002"
          : "http://127.0.0.1:3000",
    },
  },
  // Icon modules are imported individually; PDF engines ship as lazy local assets.
  // Avoid expensive whole-program analysis of this editor in Rollup 4.64.
  build: { rollupOptions: { treeshake: false } },
  test: { include: ["src/**/*.test.js"] },
});
