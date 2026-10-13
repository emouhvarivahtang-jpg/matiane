import { test, expect } from "./fixtures";
import { newBook } from "../src/model.js";
import fs from "node:fs/promises";

async function openLongDraft(page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "New book", exact: true }),
  ).toBeVisible();
  const book = newBook(40, "A book that stays in view");
  const src =
    "data:image/jpeg;base64," +
    (await fs.readFile("public/photos/mountains.jpg")).toString("base64");
  book.photos = Array.from({ length: 200 }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Photo ${i + 1}.jpg`,
    src,
    width: 640,
    height: 480,
  }));
  book.pages[0].photos = [book.photos[0].id];
  book.pages[2].photos = [book.photos[1].id];
  book.pages[2].caption = "Our favourite little moment";
  await page.evaluate(async (book) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("matiane", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["books", "photos"], "readwrite");
      for (const photo of book.photos)
        tx.objectStore("photos").put(photo, "guest:" + photo.id);
      tx.objectStore("books").put(
        {
          id: book.id,
          owner: "guest",
          cloud: null,
          updatedAt: new Date().toISOString(),
          book: {
            ...book,
            photos: book.photos.map((photo) => ({
              ...photo,
              src: "local:" + photo.id,
            })),
          },
        },
        "guest:" + book.id,
      );
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, book);
  await page.reload();
  await page.locator(".local-books .book-card-open").click();
  await expect(page.locator(".editor-shell")).toBeVisible();
  await expect(page.locator(".workspace .book-spread")).toBeVisible();
}

async function assertBookInViewport(page) {
  const metrics = await page.evaluate(() => {
    const book = document
      .querySelector(".workspace .book-spread")
      .getBoundingClientRect();
    const paper = document
      .querySelector(".workspace .book-page")
      .getBoundingClientRect();
    const viewport = document
      .querySelector(".spread-fit")
      .getBoundingClientRect();
    const root = document.scrollingElement;
    return {
      book: { x: book.x, y: book.y, width: book.width, height: book.height },
      paperRatio: paper.width / paper.height,
      available: {
        x: viewport.x,
        y: viewport.y,
        width: viewport.width,
        height: viewport.height,
      },
      width: innerWidth,
      height: innerHeight,
      scrollHeight: root.scrollHeight,
      scrollWidth: root.scrollWidth,
      scrollTop: root.scrollTop,
    };
  });
  expect(metrics.book.x).toBeGreaterThanOrEqual(-1);
  expect(metrics.book.y).toBeGreaterThanOrEqual(-1);
  expect(metrics.book.x + metrics.book.width).toBeLessThanOrEqual(
    metrics.width + 1,
  );
  expect(metrics.book.y + metrics.book.height).toBeLessThanOrEqual(
    metrics.height + 1,
  );
  expect(metrics.book.width).toBeGreaterThan(100);
  expect(metrics.book.height).toBeGreaterThan(70);
  expect(metrics.paperRatio).toBeGreaterThan(0.78);
  expect(metrics.paperRatio).toBeLessThan(0.81);
  expect(
    Math.abs(metrics.book.x + metrics.book.width / 2 - metrics.width / 2),
  ).toBeLessThan(3);
  expect(
    Math.abs(
      metrics.book.x +
        metrics.book.width / 2 -
        metrics.available.x -
        metrics.available.width / 2,
    ),
  ).toBeLessThan(3);
  expect(
    Math.abs(
      metrics.book.y +
        metrics.book.height / 2 -
        metrics.available.y -
        metrics.available.height / 2,
    ),
  ).toBeLessThan(3);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.height + 1);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
  expect(metrics.scrollTop).toBe(0);
  return metrics.book;
}

async function scrollPanel(page, selector, toBottom = true) {
  const panel = page.locator(selector);
  await expect
    .poll(() =>
      panel.evaluate(
        (element) => element.scrollHeight > element.clientHeight + 10,
      ),
    )
    .toBe(true);
  await panel.evaluate((element, toBottom) => {
    element.scrollTop = toBottom ? element.scrollHeight : 0;
  }, toBottom);
  await expect
    .poll(() => panel.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(toBottom ? 10 : -1);
  // Two frames allow ResizeObserver and the canvas fitting to finish.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
]) {
  test(`the ${viewport.width}×${viewport.height} editor keeps cover and spread fixed while both sidebars scroll`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await openLongDraft(page);
    await expect(page.locator(".project-bar")).toHaveCount(0);
    await expect(page.locator(".design-panel").getByLabel("Book title", { exact: true })).toHaveValue("A book that stays in view");
    await expect(page.locator(".design-panel").getByLabel("Inside pages", { exact: true })).toHaveValue("40");
    const coverBefore = await assertBookInViewport(page);
    expect(coverBefore.height).toBeGreaterThan(viewport.width === 1440 ? 500 : 410);
    await scrollPanel(page, ".photo-panel");
    expect(await assertBookInViewport(page)).toEqual(coverBefore);
    await scrollPanel(page, ".design-panel");
    expect(await assertBookInViewport(page)).toEqual(coverBefore);
    await page.screenshot({ path: info.outputPath("fixed-cover.png") });
    await page.getByRole("button", { name: "Page 2", exact: true }).click();
    const spreadBefore = await assertBookInViewport(page);
    expect(spreadBefore.width).toBeGreaterThan(viewport.width === 1440 ? 830 : 680);
    await page.locator(".active-leaf .editable-caption").click();
    await expect(page.getByLabel("Your words")).toBeFocused();
    await page
      .getByLabel("Your words")
      .fill("Visible while I edit this memory");
    await expect(page.locator(".active-leaf .page-caption")).toContainText(
      "Visible while I edit this memory",
    );
    expect(await assertBookInViewport(page)).toEqual(spreadBefore);
    await page
      .getByRole("button", { name: "Page 2", exact: true })
      .dragTo(page.getByRole("button", { name: "Page 5", exact: true }));
    await expect(
      page.getByRole("button", { name: "Page 5", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".active-leaf .page-caption")).toContainText(
      "Visible while I edit this memory",
    );
    await assertBookInViewport(page);
    await page.screenshot({ path: info.outputPath("fixed-inner-spread.png") });
  });
}

test("mobile keeps the book visible while the photo or text panel scrolls", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLongDraft(page);
  for (const name of ["RU", "ქარ", "EN"]) {
    await page.locator(".site-header").getByRole("button", { name, exact: true }).click();
    const actions = await page.locator(".header-actions").boundingBox();
    expect(actions.x + actions.width).toBeLessThanOrEqual(390);
    await assertBookInViewport(page);
  }
  await assertBookInViewport(page);
  await page
    .locator(".mobile-editor-tools")
    .getByRole("button", { name: "Your photographs", exact: true })
    .click();
  await expect(page.locator(".photo-panel")).toBeVisible();
  const withPhotos = await assertBookInViewport(page);
  await scrollPanel(page, ".photo-panel");
  expect(await assertBookInViewport(page)).toEqual(withPhotos);
  await page.screenshot({ path: info.outputPath("mobile-photos.png") });
  await page
    .locator(".mobile-editor-tools")
    .getByRole("button", { name: "The photobook studio", exact: true })
    .click();
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await page.locator(".active-leaf .editable-caption").click();
  await expect(page.locator(".design-panel")).toBeVisible();
  await expect(page.getByLabel("Your words")).toBeFocused();
  await page.getByLabel("Your words").fill("A little moment, always in view");
  await expect(page.locator(".active-leaf .page-caption")).toContainText(
    "A little moment, always in view",
  );
  const withText = await assertBookInViewport(page);
  await scrollPanel(page, ".design-panel");
  expect(await assertBookInViewport(page)).toEqual(withText);
  await page.screenshot({ path: info.outputPath("mobile-text.png") });
});
