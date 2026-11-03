import { test, expect } from "./fixtures";

test.use({ signedIn: false, reducedMotion: "reduce", launchOptions: { executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--enable-unsafe-swiftshader"] } });

test("the Blender book loads on demand, turns, changes bindings and keeps its localized cover", async ({ page }, info) => {
  test.setTimeout(120000);
  const fetched = [], errors = [];
  page.on("request", request => fetched.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?lang=ru");
  await expect(page.locator("h1")).toBeVisible();
  expect(fetched.some(url => url.endsWith(".glb"))).toBe(false);
  const preview = page.locator(".lp-book-viewer"), canvas = preview.locator("canvas");
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute("data-renderer", "ready", { timeout: 30000 });
  await expect(canvas).toHaveAttribute("data-model", "hard-40");
  await page.getByRole("button", { name: "Повернуть вправо", exact: true }).click();
  await expect.poll(() => canvas.getAttribute("data-angle")).not.toBe("0.00");
  await page.getByRole("button", { name: "Сбоку", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сбоку", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.locator('[name="book-pages"][value="80"]').check();
  await expect(canvas).toHaveAttribute("data-model", "hard-80");
  await preview.screenshot({ path: info.outputPath("hardcover-side.png") });
  await page.locator('[name="book-cover"][value="soft"]').check();
  await expect(canvas).toHaveAttribute("data-model", "soft-80");
  await preview.screenshot({ path: info.outputPath("softcover-side.png") });
  await page.locator(".lp-header select").selectOption("ka");
  await expect(canvas).toHaveAttribute("data-language", "ka", { timeout: 20000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "ყდა", exact: true }).click();
  await preview.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  const originalAngle = await canvas.getAttribute("data-angle");
  await page.mouse.move(bounds.x + bounds.width * .3, bounds.y + bounds.height * .6);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .6, bounds.y + bounds.height * .6, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => canvas.getAttribute("data-angle")).not.toBe(originalAngle);
  expect(await canvas.evaluate(el => getComputedStyle(el).touchAction)).toBe("pan-y");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await preview.screenshot({ path: info.outputPath("mobile-interactive-book.png") });
  await canvas.evaluate(el => el.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  await expect(preview).toHaveAttribute("data-renderer", "fallback");
  await page.locator('[name="book-pages"][value="60"]').check();
  await expect(preview.locator(".lp-book-poster")).toHaveAttribute("src", "/landing/models/soft-60-ka.webp");
  await expect(preview).toHaveAttribute("data-renderer", "fallback");
  expect(errors).toEqual([]);
});

test("the localized Blender renders keep every price selectable when WebGL is unavailable", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return /webgl/.test(type) ? null : original.call(this, type, ...args);
    };
  });
  await page.goto("/?lang=en");
  const preview = page.locator(".lp-book-viewer"), poster = preview.locator(".lp-book-poster");
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute("data-renderer", "fallback");
  await expect(poster).toBeVisible();
  await page.locator('[name="book-cover"][value="soft"]').check();
  await page.locator('[name="book-pages"][value="80"]').check();
  await expect(page.locator("#book-options output")).toHaveText("150 ₾");
  await expect(poster).toHaveAttribute("src", "/landing/models/soft-80-en.webp");
  await expect.poll(() => poster.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator("#book-options .lp-cta")).toHaveAttribute("href", "/studio?lang=en&auth=register");
});
