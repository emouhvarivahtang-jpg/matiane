import { test, expect } from "./fixtures";

test.use({ signedIn: false });

for (const path of ["/", "/landing-v2"]) {
  test(`${path} has the exact proposition, complete prices and a visible first-screen action`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    const errors = [];
    await page.goto(`${path}?lang=ru`);
    await expect(page.locator("html")).toHaveAttribute("data-landing-version", "v2");
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [language, headline] of [
      ["ka", "გადაიტანეთ მოგონებები ტელეფონის გალერეიდან წიგნში"],
      ["en", "Move your memories from camera roll to book"],
      ["ru", "Перенесите воспоминания из ленты телефона в книгу"],
    ]) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${path}?lang=${language}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        headline,
      );
      await page.evaluate(() => document.fonts.ready);
      const action = await page.locator(".lp-hero .lp-cta").boundingBox();
      expect(action.y).toBeGreaterThan(0);
      expect(action.y + action.height).toBeLessThanOrEqual(800);
      expect(
        await page
          .locator(".lp-header option")
          .evaluateAll((options) => options.map((option) => option.value)),
      ).toEqual(["ka", "en", "ru"]);
      await expect(page.locator(".lp-faq, .lp-cta-hint")).toHaveCount(0);
      await expect(page.locator("#book-options output")).toHaveText("100 ₾");
      const cover = page.locator(
        '#book-options input[name="book-cover"][value="soft"]',
      );
      const pages = page.locator(
        '#book-options input[name="book-pages"][value="80"]',
      );
      await cover.check();
      await pages.check();
      await expect(page.locator("#book-options output")).toHaveText("150 ₾");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`desktop-${language}.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(375);
      await expect(page.locator(".lp-hero .lp-cta")).toBeInViewport();
      await page.screenshot({
        path: info.outputPath(`phone-${language}.png`),
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });
}

test("the preserved photo-journal remains available while v2 has a clear reading order", async ({
  page,
}) => {
  await page.goto("/landing-archive?lang=ru");
  await expect(page.locator("html")).toHaveAttribute(
    "data-landing-version",
    "archive",
  );
  await expect(page.locator("h1")).toHaveText(
    "Самое дорогое —между страницами.",
  );
  await expect(page.locator(".lp-footer-masthead")).toBeVisible();
  await expect(page.locator(".lp-hero-art img")).toHaveAttribute(
    "src",
    "/landing/spread-journal-ru-0.webp",
  );
  await page.goto("/landing-v2?lang=ru");
  await expect(page.locator("html")).toHaveAttribute(
    "data-landing-version",
    "v2",
  );
  await expect(page.locator("main > section")).toHaveCount(5);
  expect(
    await page
      .locator("main > section")
      .evaluateAll((sections) =>
        sections.map((section) => section.id || section.className),
      ),
  ).toEqual([
    "lp-hero",
    "inspiration",
    "how-it-works",
    "book-options",
    "about",
  ]);
  await expect(page.locator(".lp-occasion h3")).toHaveText([
    "Первый год",
    "Путешествие",
    "Каким был 2026?",
  ]);
  await expect(page.locator(".lp-step-list li").last()).toContainText(
    "отправьте заказ администратору",
  );
  await page.locator(".lp-hero .lp-cta").click();
  await expect(
    page.getByRole("dialog", { name: "Создать аккаунт", exact: true }),
  ).toBeVisible({ timeout: 15000 });
});
