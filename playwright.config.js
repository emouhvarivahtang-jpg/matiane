import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: process.env.MATIANE_TEST_URL || "http://127.0.0.1:5173",
    headless: true,
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: process.env.MATIANE_TEST_URL
    ? undefined
    : [
        {
          command: "npm run dev -- --port 5173",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: !process.env.CI,
        },
        {
          command: "node server/index.js",
          url: "http://127.0.0.1:3000/api/health",
          reuseExistingServer: !process.env.CI,
          env: {
            SECURE_COOKIES: "false",
            PUBLIC_ORIGIN: "http://127.0.0.1:5173",
            DATA_DIR: "/tmp/matiane-browser-tests",
          },
        },
      ],
});
