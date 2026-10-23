import { test, expect } from "./fixtures";

test.describe("public homepage", () => {
  test.use({ signedIn: false });

  test("homepage has working navigation and images, and loads without the studio or private APIs", async ({
    page,
  }, info) => {
    const requests = [];
    const errors = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/?lang=ru");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Самое дорогое —между страницами.",
    );
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".lp-hero-art img").first()).toBeVisible();
    expect(
      await page
        .locator(".lp-hero-art img")
        .evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Как это работает", exact: true })
      .click();
    await expect(page.locator("#how-it-works")).toBeInViewport();
    await page
      .locator("summary")
      .filter({ hasText: "Вы печатаете и доставляете книги?" })
      .click();
    await expect(
      page.getByText(/Сейчас Matiane — это студия для создания макета/),
    ).toBeVisible();
    expect(
      requests.filter((url) =>
        /\/api\/|\/src\/main\.jsx|\/src\/model\.js|heic|pdf-lib/.test(url),
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(async () =>
        (await indexedDB.databases()).map((db) => db.name),
      ),
    ).not.toContain("matiane");
    expect(errors).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("homepage-desktop.png"),
      fullPage: true,
    });
    await page.locator(".lp-hero .lp-cta").click();
    await expect(page).toHaveURL(/\/studio\?lang=ru$/);
    await expect(
      page.getByRole("dialog", { name: "Создать аккаунт", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#account-password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  test("all languages fit mobile, keep the selected language, and open the right authentication form", async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?lang=ru");
    for (const [language, title] of [
      ["ru", "Самое дорогое —"],
      ["en", "Your favourite days,"],
      ["ka", "ყველაზე ძვირფასი —"],
    ]) {
      await page.locator(".lp-header select").selectOption(language);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        title,
      );
      await page.evaluate(() => document.fonts.ready);
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
      await expect(page.locator(".lp-hero .lp-cta")).toBeVisible();
      await expect(page.locator(".lp-hero .lp-cta")).toHaveAttribute(
        "href",
        `/studio?lang=${language}&auth=register`,
      );
      await page.screenshot({
        path: info.outputPath(`homepage-mobile-${language}.png`),
        fullPage: true,
      });
    }
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "ka");
    await page.locator(".lp-header select").selectOption("ka");
    await page.locator(".lp-login").click();
    await expect(
      page.getByRole("dialog", { name: "შესვლა", exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ka");
    await expect(page.locator("#account-password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  test("registration from the homepage reaches a cloud cabinet and can create a book", async ({
    page,
  }) => {
    await page.goto("/?lang=en");
    await page.locator(".lp-hero .lp-cta").click();
    await expect(
      page.getByRole("dialog", { name: "Create account", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Email", { exact: true })
      .fill(`landing-qa-${crypto.randomUUID()}@example.invalid`);
    await page.locator("#account-password").fill(crypto.randomUUID());
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Continue", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "New book", exact: true }).click();
    await page
      .getByLabel("Book title", { exact: true })
      .fill("Homepage registration QA");
    await page
      .getByRole("button", { name: "Create book", exact: true })
      .click();
    await expect(page.locator(".editor-shell")).toBeVisible();
    await expect(page.locator(".save-bar")).toContainText("Saved in account");
    await page.getByRole("button", { name: "← My books", exact: true }).click();
    const response = await page.evaluate(async () => {
      const { csrfToken } = await (await fetch("/api/session")).json();
      const { books } = await (await fetch("/api/books")).json();
      if (books.length !== 1 || books[0].title !== "Homepage registration QA")
        return false;
      return (
        await fetch("/api/books/" + books[0].id, {
          method: "DELETE",
          headers: { "X-CSRF-Token": csrfToken, "X-Matiane-Client": "studio" },
        })
      ).ok;
    });
    expect(response).toBe(true);
  });
});

test("a returning signed-in visitor opens their cabinet through the homepage CTA", async ({
  page,
}) => {
  await page.goto("/?lang=en");
  await page.locator(".lp-hero .lp-cta").click();
  await expect(
    page.getByRole("heading", { name: "My books", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New book", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
