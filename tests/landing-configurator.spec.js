import { test, expect } from "./fixtures";

test.use({ signedIn: false });

test("Georgian leads the homepage and language choices, with explicit and remembered choices respected", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".landing")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ka");
  expect(
    await page
      .locator(".lp-header option")
      .evaluateAll((options) => options.map((option) => option.value)),
  ).toEqual(["ka", "en", "ru"]);
  await expect(page.locator(".lp-hero .lp-cta")).toHaveAttribute(
    "href",
    "/studio?lang=ka&auth=register",
  );
  await page.locator(".lp-header select").selectOption("en");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/?lang=ru");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.locator(".lp-faq, .lp-cta-hint")).toHaveCount(0);
  await expect(
    page.getByText("Без навыков дизайна. В вашем темпе."),
  ).toHaveCount(0);
  await expect(page.locator(".lp-occasion h3")).toHaveText([
    "Первый год",
    "Путешествие",
    "Каким был 2026?",
  ]);
  await expect(page.locator(".lp-step-list li").last()).toContainText(
    "Сохраните готовый макет и отправьте заказ администратору.",
  );
  await expect(
    page.locator('a[href*="wa.me"], a[href*="whatsapp"]'),
  ).toHaveCount(0);
  await page.goto("/studio?lang=ka");
  await expect(page.locator(".site-header .language-switch")).toBeVisible();
  expect(
    await page
      .locator(".site-header .language-switch button")
      .allTextContents(),
  ).toEqual(["ქარ", "EN", "RU"]);
});

test("the six supplied prices in GEL match the selected cover and pages, and the physical preview changes", async ({
  page,
}, info) => {
  const apiRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto("/?lang=ru");
  const section = page.locator("#book-options"),
    model = section.locator(".lp-book-model");
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator("output")).toHaveText("100 ₾");
  const hardInset = await model.evaluate((element) =>
    parseFloat(getComputedStyle(element).getPropertyValue("--page-inset")),
  );
  let depth40, depth80;
  for (const [cover, pages, price] of [
    ["Твёрдая", 40, 100],
    ["Твёрдая", 60, 140],
    ["Твёрдая", 80, 190],
    ["Мягкая", 80, 150],
    ["Мягкая", 60, 110],
    ["Мягкая", 40, 80],
  ]) {
    await section.getByRole("radio", { name: cover, exact: true }).check();
    await section
      .getByRole("radio", { name: String(pages), exact: true })
      .check();
    await expect(section.locator("output")).toHaveText(`${price} ₾`);
    await expect(model).toHaveAttribute(
      "data-cover",
      cover === "Твёрдая" ? "hard" : "soft",
    );
    await expect(model).toHaveAttribute("data-pages", String(pages));
    if (cover === "Твёрдая" && pages === 40)
      depth40 = await model.evaluate((element) =>
        parseFloat(getComputedStyle(element).getPropertyValue("--book-depth")),
      );
    if (cover === "Твёрдая" && pages === 80)
      depth80 = await model.evaluate((element) =>
        parseFloat(getComputedStyle(element).getPropertyValue("--book-depth")),
      );
  }
  expect(depth80).toBeGreaterThan(depth40);
  expect(
    await model
      .locator(".lp-book-front")
      .evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("0px");
  expect(await model.evaluate((element) =>
    parseFloat(getComputedStyle(element).getPropertyValue("--page-inset")),
  )).toBeLessThan(hardInset);
  await section.locator("summary").click();
  expect(
    await section
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows.map((row) => [...row.cells].map((cell) => cell.textContent)),
      ),
  ).toEqual([
    ["40", "80 ₾", "100 ₾"],
    ["60", "110 ₾", "140 ₾"],
    ["80", "150 ₾", "190 ₾"],
  ]);
  expect(apiRequests).toEqual([]);
  await expect(section.locator(".lp-cta")).toHaveAttribute(
    "href",
    "/studio?lang=ru&auth=register",
  );
  await model.screenshot({ path: info.outputPath("softcover-preview.png") });
  await section.getByRole("radio", { name: "Твёрдая", exact: true }).check();
  await section.getByRole("radio", { name: "80", exact: true }).check();
  await model.screenshot({ path: info.outputPath("hardcover-80-preview.png") });
});

test("sample spreads turn without moving the page and all controls and prices fit on a phone", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/landing-v2?lang=ru");
  const picture = page.locator(".v2-open-sample img");
  await expect(
    page.getByRole("button", { name: "Предыдущий пример разворота" }),
  ).toBeDisabled();
  const originalSource = await picture.getAttribute("src");
  await page
    .getByRole("button", { name: "Следующий пример разворота" })
    .click();
  await expect(picture).not.toHaveAttribute("src", originalSource);
  await page
    .getByRole("button", { name: "Следующий пример разворота" })
    .press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Следующий пример разворота" }),
  ).toBeDisabled();
  await expect(page.locator(".lp-preview-caption")).toContainText("Наш 2026");
  const section = page.locator("#book-options");
  async function modelVisible() {
    await section.locator(".lp-book-model").scrollIntoViewIfNeeded();
  }
  for (const [language, hard, soft] of [
    ["ka", "მყარი", "რბილი"],
    ["en", "Hardcover", "Softcover"],
    ["ru", "Твёрдая", "Мягкая"],
  ]) {
    await page.locator(".lp-header select").selectOption(language);
    await section.getByRole("radio", { name: soft, exact: true }).check();
    await section.getByRole("radio", { name: "80", exact: true }).check();
    await expect(section.locator("output")).toHaveText("150 ₾");
    await section.getByRole("radio", { name: hard, exact: true }).check();
    await expect(section.locator("output")).toHaveText("190 ₾");
    await modelVisible();
    const box = await section.locator(".lp-book-model").boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(-1);
    const controls = await section.locator(".lp-configurator-controls").boundingBox();
    expect(controls.y).toBeGreaterThanOrEqual(box.y + box.height);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: info.outputPath("mobile-book-options.png") });
});
