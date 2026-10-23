import { test, expect, cloudSnapshot } from "./fixtures";
import { newBook } from "../src/model.js";

test.describe("account gate", () => {
  test.use({ signedIn: false });
  test("anonymous visitors cannot create books or use AI, and no local book database is created", async ({
    page,
  }) => {
    await page.goto("/studio");
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New book", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator(".local-books, .editor-shell, .legal-footer"),
    ).toHaveCount(0);
    const statuses = await page.evaluate(async () => ({
      create: (
        await fetch("/api/books", {
          method: "POST",
          headers: { "X-Matiane-Client": "studio" },
        })
      ).status,
      ai: (
        await fetch("/api/ai/session", {
          headers: { "X-Matiane-Client": "studio" },
        })
      ).status,
      databases: (await indexedDB.databases()).map((db) => db.name),
    }));
    expect(statuses.create).toBe(401);
    expect(statuses.ai).toBe(401);
    expect(statuses.databases).not.toContain("matiane");
  });
});

test("cloud creation works with device storage disabled and survives reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const key of ["indexedDB", "localStorage"])
      Object.defineProperty(window, key, {
        get() {
          throw new DOMException("Blocked", "SecurityError");
        },
      });
  });
  await page.goto("/studio");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill("Cloud without device storage");
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await expect(page.locator(".editor-shell")).toBeVisible();
  await expect(page.locator(".local-import")).toHaveCount(0);
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await page.locator(".active-leaf .editable-caption").click();
  await page.getByLabel("Your words").fill("Stored on the server");
  const before = await cloudSnapshot(page);
  await page.reload();
  await page.locator(".cloud-books .book-card-open").click();
  expect((await cloudSnapshot(page)).pages).toEqual(before.pages);
});

test("batch deletion keeps covers and page count, supports ranges and undo, and drag insertion matches its marker", async ({
  page,
}) => {
  test.setTimeout(60000);
  const book = newBook(40, "Batch deletion and insertion");
  for (let index = 1; index <= 6; index++)
    book.pages[index].caption = "Chapter " + index;
  await page.goto("/studio");
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "book.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(book)),
    });
  await expect(page.locator(".page-thumb")).toHaveCount(42);
  const before = await cloudSnapshot(page);
  await page.getByRole("button", { name: "Select pages", exact: true }).click();
  await expect(page.locator(".page-select-checkbox")).toHaveCount(40);
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await page
    .getByRole("button", { name: "Page 4", exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(
    page.getByRole("button", { name: "Delete (3)", exact: true }),
  ).toBeEnabled();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete (3)", exact: true }).click();
  const after = await cloudSnapshot(page);
  expect(after.pages).toHaveLength(42);
  expect(after.pageCount).toBe(40);
  expect(after.pages[0]).toEqual(before.pages[0]);
  expect(after.pages.at(-1)).toEqual(before.pages.at(-1));
  expect(after.pages[2].caption).toBe("Chapter 5");
  expect(
    after.pages
      .slice(-4, -1)
      .every((page) => !page.caption && page.photos.every((id) => !id)),
  ).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await cloudSnapshot(page)).pages).toEqual(before.pages);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page
    .getByRole("button", { name: "Page 1", exact: true })
    .dispatchEvent("dragstart", { dataTransfer });
  const target = page
    .getByRole("button", { name: "Page 4", exact: true })
    .locator("..");
  const bounds = await target.boundingBox();
  await target.dispatchEvent("dragover", {
    dataTransfer,
    clientX: bounds.x + bounds.width * 0.2,
  });
  await expect(
    page.getByLabel("Insert before Page 4", { exact: true }),
  ).toBeVisible();
  await target.dispatchEvent("drop", { dataTransfer });
  await expect(page.locator(".page-drop-indicator")).toHaveCount(0);
  const moved = await cloudSnapshot(page);
  expect(moved.pages.slice(1, 5).map((page) => page.caption)).toEqual([
    "Chapter 2",
    "Chapter 3",
    "Chapter 1",
    "Chapter 4",
  ]);
  expect(moved.pages[0]).toEqual(before.pages[0]);
  expect(moved.pages.at(-1)).toEqual(before.pages.at(-1));
});
