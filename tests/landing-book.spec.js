import { test, expect } from "./fixtures";

test.use({ signedIn: false });

async function loaded(image) {
  await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
}

test("the product card shows the selected binding and localized cover without viewer controls", async ({ page }, info) => {
  const requests = [], errors = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?lang=ru");
  const section = page.locator("#book-options"), preview = section.locator(".lp-book-viewer"), poster = preview.locator("img");
  await preview.scrollIntoViewIfNeeded();
  await loaded(poster);
  await expect(preview.locator("button, canvas")).toHaveCount(0);
  await expect(section.locator("summary, details, table")).toHaveCount(0);
  await expect(poster).toHaveAttribute("src", "/landing/models/card-hard-40-ru.webp");
  await page.locator('[name="book-pages"][value="80"]').check();
  await expect(poster).toHaveAttribute("src", "/landing/models/card-hard-80-ru.webp");
  await loaded(poster);
  await preview.screenshot({ path: info.outputPath("hardcover-card.png") });
  await page.locator('[name="book-cover"][value="soft"]').check();
  await expect(poster).toHaveAttribute("src", "/landing/models/card-soft-80-ru.webp");
  await loaded(poster);
  await preview.screenshot({ path: info.outputPath("softcover-card.png") });
  for (const language of ["ka", "en"]) {
    await page.locator(".lp-header select").selectOption(language);
    await expect(poster).toHaveAttribute("src", `/landing/models/card-soft-80-${language}.webp`);
    await preview.scrollIntoViewIfNeeded();
    await loaded(poster);
  }
  expect(requests.filter(url => /\.glb(?:\?|$)|landing-book-scene/.test(url))).toEqual([]);
  expect(errors).toEqual([]);
});

test("the card has a modest desktop hover zoom and respects reduced motion and ordinary scrolling", async ({ page }, info) => {
  await page.goto("/?lang=ru");
  const preview = page.locator(".lp-book-viewer"), poster = preview.locator("img");
  await preview.scrollIntoViewIfNeeded();
  await loaded(poster);
  await page.mouse.move(0, 0);
  const scale = () => poster.evaluate(img => new DOMMatrixReadOnly(getComputedStyle(img).transform).a);
  await expect.poll(scale).toBe(1);
  await preview.hover();
  await expect.poll(scale).toBeCloseTo(1.045, 3);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(scale).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await preview.scrollIntoViewIfNeeded();
  await expect(poster).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await preview.screenshot({ path: info.outputPath("mobile-product-card.png") });
  const before = await page.evaluate(() => scrollY);
  await preview.hover();
  await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await expect(poster).toHaveAttribute("draggable", "false");
});
