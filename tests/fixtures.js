import { test as base, expect, request } from "@playwright/test";
// Cloud Chromium has its own CA store, while the provided HTTPS proxy CA is
// trusted by Node. Forward live responses through Node's verifying TLS client;
// keep certificate validation enabled and retain the real browser origin.
const relay = process.env.MATIANE_TLS_RELAY === "1";
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
export const testOrigin =
  process.env.MATIANE_TEST_URL ||
  (process.env.MATIANE_TEST_BUILD === "1"
    ? "http://127.0.0.1:4173"
    : "http://127.0.0.1:5173");
export const test = base.extend({
  signedIn: [true, { option: true }],
  cloudAccount: [
    async ({}, use, info) => {
      const origin = testOrigin;
      const transport = await request.newContext({
        baseURL: origin,
        ...(relay && proxy ? { proxy: { server: proxy } } : {}),
        ignoreHTTPSErrors: false,
        extraHTTPHeaders: {
          Origin: new URL(origin).origin,
          "X-Matiane-Client": "studio",
        },
      });
      const credentials = {
        email: `cloud-qa-${process.env.MATIANE_E2E_ACCOUNT_SEED.slice(0, 16)}-${info.parallelIndex}@example.invalid`,
        password: process.env.MATIANE_E2E_ACCOUNT_SEED,
      };
      const logged = await transport.post("/api/auth/login", {
        data: credentials,
      });
      if (logged.status() === 401) {
        const registered = await transport.post("/api/auth/register", {
          data: credentials,
        });
        expect(registered.status()).toBe(201);
      } else expect(logged.status()).toBe(200);
      async function session() {
        let value = await (await transport.get("/api/session")).json();
        if (!value.user) {
          const response = await transport.post("/api/auth/login", {
            data: credentials,
          });
          expect(response.ok()).toBe(true);
          value = await response.json();
        }
        return value;
      }
      async function cleanup() {
        const value = await session();
        const { books } = await (await transport.get("/api/books")).json();
        for (const book of books) {
          const response = await transport.delete("/api/books/" + book.id, {
            headers: { "X-CSRF-Token": value.csrfToken },
          });
          expect(response.ok()).toBe(true);
        }
      }
      await use({ transport, session, cleanup });
      await cleanup();
      await transport.dispose();
    },
    { scope: "worker" },
  ],
  request: async ({}, use) => {
    const transport = await request.newContext({
      baseURL: testOrigin,
      ...(relay && proxy ? { proxy: { server: proxy } } : {}),
      ignoreHTTPSErrors: false,
    });
    await use(transport);
    await transport.dispose();
  },
  page: async ({ page, request, signedIn, cloudAccount }, use) => {
    if (signedIn) {
      await cloudAccount.cleanup();
      await page
        .context()
        .addCookies((await cloudAccount.transport.storageState()).cookies);
    }
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

export async function cloudSnapshot(page) {
  await expect(page.locator(".save-bar")).toContainText("Saved in account", {
    timeout: 25000,
  });
  return page.evaluate(async () => {
    const id = document.querySelector(".app-shell").dataset.bookId;
    const { book } = await (await fetch("/api/books/" + id)).json();
    for (const photo of book.photos) {
      const blob = await (await fetch(photo.src)).blob();
      photo.src = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }
    return book;
  });
}
