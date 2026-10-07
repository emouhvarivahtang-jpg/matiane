import { test as base, expect, request } from "@playwright/test";
// Cloud Chromium has its own CA store, while the provided HTTPS proxy CA is
// trusted by Node. Forward live responses through Node's verifying TLS client;
// keep certificate validation enabled and retain the real browser origin.
const relay = process.env.MATIANE_TLS_RELAY === "1";
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
export const test = base.extend({
  request: async ({}, use) => {
    const transport = await request.newContext({
      baseURL: process.env.MATIANE_TEST_URL || "http://127.0.0.1:5173",
      ...(relay && proxy ? { proxy: { server: proxy } } : {}),
      ignoreHTTPSErrors: false,
    });
    await use(transport);
    await transport.dispose();
  },
  page: async ({ page, request }, use) => {
    if (relay) {
      const target = new URL(process.env.MATIANE_TEST_URL).origin;
      await page.context().route(target + "/**", async (route) => {
        const source = route.request();
        try {
          const response = await request.fetch(source.url(), {
            method: source.method(),
            headers: await source.allHeaders(),
            data: source.postDataBuffer() || undefined,
            maxRedirects: 0,
          });
          await route.fulfill({ response });
        } catch {
          throw new Error(
            "Verified HTTPS transport failed: " +
              new URL(source.url()).pathname,
          );
        }
      });
    }
    await use(page);
    // Unrouting releases pending browser requests. Their route callbacks may
    // still be awaiting TLS responses; ignore cancellation errors only after
    // the test has finished, before its request context is disposed.
    if (relay) await page.context().unrouteAll({ behavior: "ignoreErrors" });
  },
});
export { expect };
