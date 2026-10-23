import { defineConfig } from "@playwright/test";
// Worker restarts reuse their synthetic account rather than exhausting sign-up limits.
process.env.MATIANE_E2E_ACCOUNT_SEED ||=
  crypto.randomUUID() + crypto.randomUUID();
const production = process.env.MATIANE_TEST_BUILD === "1";
const localUrl = production ? "http://127.0.0.1:4173" : "http://127.0.0.1:5173";
const apiPort = production ? "3002" : "3000";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: process.env.MATIANE_TEST_URL ? 90000 : 30000,
  use: {
    baseURL: process.env.MATIANE_TEST_URL || localUrl,
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
          command: production
            ? "npm run preview -- --port 4173"
            : "npm run dev -- --port 5173",
          url: localUrl,
          reuseExistingServer: !process.env.CI,
        },
        {
          command: "node server/index.js",
          url: `http://127.0.0.1:${apiPort}/api/health`,
          reuseExistingServer: !process.env.CI,
          env: {
            SECURE_COOKIES: "false",
            PORT: apiPort,
            PUBLIC_ORIGIN: localUrl,
            DATA_DIR:
              process.env.MATIANE_TEST_DATA_DIR ||
              `/tmp/matiane-browser-tests-${process.pid}`,
          },
        },
      ],
});
