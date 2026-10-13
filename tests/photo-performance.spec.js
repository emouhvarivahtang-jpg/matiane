import { test, expect } from "./fixtures";
import { newBook } from "../src/model.js";
import fs from "node:fs/promises";
import sharp from "sharp";

test("cloud books show thumbnails immediately, prefetch neighbouring screen copies and export original photo bytes", async ({ page }, info) => {
  const original = await sharp(await fs.readFile("public/photos/mountains.jpg"))
    .resize(3200, 2400, { fit: "fill" })
    .jpeg({ quality: 98 })
    .toBuffer();
  const thumbnail = await sharp(original).resize(320).webp().toBuffer();
  const preview = await sharp(original).resize(1600).webp({ quality: 84 }).toBuffer();
  const book = newBook(40, "Fast cloud photographs");
  book.photos = Array.from({ length: 4 }, (_, index) => ({
    id: `photo-${index}`,
    name: `Memory ${index + 1}.jpg`,
    src: "/api/photos/" + String(index + 1).repeat(64),
    width: 3200,
    height: 2400,
  }));
  for (const [at, photo] of [[0, 0], [1, 1], [2, 2], [40, 3]])
    book.pages[at].photos = [book.photos[photo].id];
  const requested = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path.startsWith("/api/photos/")) {
      requested.push(path + url.search);
      const screen = url.searchParams.has("preview");
      if (screen) await new Promise((resolve) => setTimeout(resolve, 1200));
      return route.fulfill({
        contentType: url.search ? "image/webp" : "image/jpeg",
        body: screen ? preview : url.search ? thumbnail : original,
      });
    }
    if (path === "/api/session")
      return route.fulfill({ json: {
        user: { id: "performance-user", email: "preview@example.invalid", isAdmin: false },
        csrfToken: "synthetic-token",
      } });
    const record = { id: book.id, revision: 1, title: book.title, pageCount: 40, updatedAt: new Date().toISOString() };
    if (path === "/api/books")
      return route.fulfill({ json: { books: [record], storageUsed: 0 } });
    if (path === "/api/books/" + book.id)
      return route.fulfill({ json: { ...record, book } });
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  await page.goto("/");
  await page.locator(".book-card-open").click();
  const frame = page.locator(".workspace .spread-fit .photo-frame").filter({
    has: page.locator('img[alt="Memory 1.jpg"]'),
  });
  await expect(frame.locator(".photo-placeholder")).toHaveCount(0);
  await expect(frame.locator('img[alt="Memory 1.jpg"]')).toHaveAttribute("data-ready", "false");
  await expect(frame.locator('img[alt="Memory 1.jpg"]')).toHaveAttribute(
    "src", book.photos[0].src + "?preview=1",
  );
  await expect(frame.locator('img[alt="Memory 1.jpg"]')).toHaveAttribute("data-ready", "true");
  await expect.poll(() => requested.includes(book.photos[1].src + "?preview=1")).toBe(true);
  expect(requested.includes(book.photos[3].src + "?preview=1")).toBe(false);
  expect(requested.filter((url) => !url.includes("?"))).toEqual([]);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("dialog").locator('img[alt="Memory 1.jpg"]')).toHaveAttribute(
    "src", book.photos[0].src + "?preview=1",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Export book", exact: true }).click();
  await page.getByLabel("PDF image quality").selectOption("source");
  await page.getByLabel("PDF pages").selectOption("covers");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download print PDF", exact: true }).click();
  const file = info.outputPath("original-quality.pdf");
  await (await event).saveAs(file);
  expect((await fs.readFile(file)).includes(original)).toBe(true);
  expect(requested).toContain(book.photos[0].src);
});
