import { test, expect } from "./fixtures";
import { newBook } from "../src/model.js";

test.use({ signedIn: false });

async function mockStudio(context) {
  const book = newBook(40, "Independent studio layout");
  book.photos = [
    {
      id: "public-sample",
      name: "Public sample",
      src: "/photos/mountains.jpg",
      width: 640,
      height: 480,
    },
  ];
  book.pages[0].photos = [book.photos[0].id];
  book.pages[2].photos = [book.photos[0].id];
  book.pages[2].caption = "A memory worth keeping";
  const record = {
    id: book.id,
    revision: 1,
    title: book.title,
    pageCount: 40,
    updatedAt: new Date().toISOString(),
  };
  await context.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const json =
      path === "/api/session"
        ? {
            user: {
              id: "layout-user",
              email: "layout@example.invalid",
              isAdmin: false,
            },
            csrfToken: "synthetic-token",
          }
        : path === "/api/books"
          ? { books: [record], storageUsed: 0 }
          : path === "/api/books/" + book.id
            ? { ...record, book }
            : {};
    return route.fulfill({ json });
  });
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
}

async function styles(page) {
  return page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText))
      .join("\n"),
  );
}

async function studioMetrics(page) {
  await settle(page);
  return page.evaluate(() => {
    const result = {};
    for (const selector of [
      ".editor-shell",
      ".site-header",
      ".workspace",
      ".spread-fit",
      ".workspace .book-spread",
      ".photo-panel",
      ".design-panel",
      ".filmstrip-section",
    ]) {
      const element = document.querySelector(selector),
        rect = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      result[selector] = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        display: style.display,
        fontFamily: style.fontFamily,
        color: style.color,
        background: style.backgroundColor,
      };
    }
    return result;
  });
}

test("the built studio loads its own CSS and resists every landing stylesheet", async ({
  page,
}, info) => {
  await mockStudio(page.context());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/studio");
  await page.locator(".book-card-open").click();
  await expect(page.locator("html")).toHaveAttribute("data-surface", "studio");
  const ownStyles = await styles(page);
  expect(ownStyles).toContain(".editor-shell");
  expect(ownStyles).not.toContain(".lp-hero");
  const before = await studioMetrics(page);
  expect(before[".editor-shell"].display).toBe("flex");
  expect(before[".editor-shell"].height).toBe(900);
  expect(before[".workspace .book-spread"].height).toBeGreaterThan(500);
  expect(
    before[".workspace .book-spread"].y +
      before[".workspace .book-spread"].height,
  ).toBeLessThan(900);
  const other = await page.context().newPage();
  await other.goto("/?lang=en");
  await expect(other.locator(".lp-hero")).toBeVisible();
  await page.addStyleTag({ content: await styles(other) });
  await other.close();
  expect(await studioMetrics(page)).toEqual(before);
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  const spread = await studioMetrics(page);
  expect(spread[".workspace .book-spread"].width).toBeGreaterThan(830);
  await page.locator(".active-leaf .editable-caption").click();
  await page.getByLabel("Your words").fill("The product stays independent");
  expect(await studioMetrics(page)).toEqual(spread);
  await page.screenshot({
    path: info.outputPath("isolated-production-studio.png"),
  });
});

test("the built landing loads its own CSS and resists every studio stylesheet", async ({
  page,
}, info) => {
  await mockStudio(page.context());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?lang=ru");
  await expect(page.locator(".lp-hero")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-surface", "landing");
  const ownStyles = await styles(page);
  expect(ownStyles).toContain(".lp-hero");
  expect(ownStyles).not.toContain(".editor-shell");
  async function metrics() {
    await settle(page);
    return page.evaluate(() =>
      [".landing", ".lp-header", "h1", ".lp-hero .lp-cta", ".lp-hero-art"].map(
        (selector) => {
          const element = document.querySelector(selector),
            rect = element.getBoundingClientRect(),
            style = getComputedStyle(element);
          return {
            selector,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            font: style.font,
            color: style.color,
            background: style.backgroundColor,
          };
        },
      ),
    );
  }
  const before = await metrics();
  const other = await page.context().newPage();
  await other.goto("/studio");
  await expect(other.locator(".cabinet")).toBeVisible();
  await page.addStyleTag({ content: await styles(other) });
  await other.close();
  expect(await metrics()).toEqual(before);
  await page.screenshot({
    path: info.outputPath("isolated-production-landing.png"),
  });
});
