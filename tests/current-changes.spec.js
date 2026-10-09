import { test, expect } from "./fixtures";
import { newBook } from "../src/model.js";
import { FONT_CATALOG, GEORGIAN_FONT_CATALOG } from "../src/fonts.js";
import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

async function create(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByRole("button", { name: "Create book", exact: true }).click();
}
test("full cover edits live, includes a spine and wrap, and exports matching physical PDF geometry", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await create(page);
  await page.getByLabel("Spine width, mm").fill("12");
  await page.getByLabel("Cover wrap on each edge, mm").fill("10");
  await page.locator(".workspace .cover-spine").click();
  await expect(page.getByLabel("Your words")).toBeFocused();
  await page.getByLabel("Your words").fill("Our story · ჩვენი ამბავი");
  await page
    .getByLabel("English / Russian typeface")
    .selectOption("cormorantgaramond");
  await page
    .getByLabel("Georgian typeface", { exact: true })
    .selectOption("bpg-chveulebrivi");
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await expect(page.locator(".workspace .spine-caption")).toContainText(
    "Our story",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".workspace .spread-leaf")
    .first()
    .locator(".editable-caption")
    .click();
  await page.getByLabel("Your words").fill("Back cover · უკანა ყდა");
  await page
    .locator(".workspace .spread-leaf")
    .last()
    .locator(".editable-caption")
    .click();
  await page.getByLabel("Your words").fill("Front cover · წინა ყდა");
  await expect(page.locator(".active-leaf .page-caption")).toContainText(
    "Front cover",
  );
  await page.getByRole("button", { name: "Full bleed", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/photos/mountains.jpg");
  await page.locator(".library-photo>button").first().click();
  await expect(page.locator(".active-leaf .quality-badge")).toContainText(
    "Low resolution",
  );
  await page
    .locator(".active-leaf .frame-controls")
    .getByRole("button", { name: "Zoom in", exact: true })
    .click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("dialog").locator(".complete-cover .book-page"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("dialog").locator(".spine-caption"),
  ).toContainText("Our story");
  await page.keyboard.press("Escape");
  await page
    .locator(".workspace .complete-cover")
    .screenshot({ path: info.outputPath("cover.png") });
  for (const layout of ["pages", "spreads"]) {
    await page
      .getByRole("button", { name: "Export book", exact: true })
      .click();
    await page.getByLabel("PDF layout").selectOption(layout);
    await page.getByLabel("PDF pages").selectOption("covers");
    await page
      .getByLabel("I have reviewed these warnings and want to export anyway.")
      .check();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download print PDF", exact: true })
      .click();
    const file = info.outputPath("cover-" + layout + ".pdf");
    await (await download).saveAs(file);
    const doc = await PDFDocument.load(await fs.readFile(file));
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo((428 * 72) / 25.4);
    expect(doc.getPage(0).getHeight()).toBeCloseTo((271 * 72) / 25.4);
    const { stdout } = await promisify(execFile)("pdftotext", [
      "-layout",
      file,
      "-",
    ]);
    for (const text of [
      "Our story",
      "ჩვენი ამბავი",
      "Front cover",
      "Back cover",
    ])
      expect(stdout).toContain(text);
    if (layout === "pages")
      await promisify(execFile)("pdftoppm", [
        "-singlefile",
        "-scale-to",
        "1400",
        "-png",
        file,
        info.outputPath("printed-cover"),
      ]);
  }
  expect(errors).toEqual([]);
});
test("all ten Georgian choices visibly change Georgian letters independently of Latin fonts", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await create(page);
  const caption = page.locator(".active-leaf .editable-caption");
  await caption.click();
  await page.getByLabel("Your words").fill("თბილისი, ჩვენი მოგონებები");
  const georgian = new Set(),
    latin = new Set(),
    images = [];
  for (const font of GEORGIAN_FONT_CATALOG) {
    await page
      .getByLabel("Georgian typeface", { exact: true })
      .selectOption(font.id);
    await page.evaluate(async (family) => {
      await document.fonts.load(`400 24px "${family}"`, "თბილისი");
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    }, font.family);
    const picture = await caption.screenshot();
    georgian.add(createHash("sha256").update(picture).digest("hex"));
    images.push(
      await sharp(picture)
        .extend({ top: 4, bottom: 4, left: 4, right: 4, background: "#ffffff" })
        .png()
        .toBuffer(),
    );
    await expect(page.getByLabel("English / Russian typeface")).toHaveValue(
      "montserrat",
    );
  }
  expect(georgian.size).toBe(10);
  await page.getByLabel("Your words").fill("Memories · Наши воспоминания");
  for (const font of FONT_CATALOG) {
    await page.getByLabel("English / Russian typeface").selectOption(font.id);
    await page.evaluate(async (family) => {
      await document.fonts.load(`400 24px "${family}"`, "Memories Москва");
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    }, font.family);
    latin.add(
      createHash("sha256")
        .update(await caption.screenshot())
        .digest("hex"),
    );
    await expect(
      page.getByLabel("Georgian typeface", { exact: true }),
    ).toHaveValue("bpg-serif-modern");
  }
  expect(latin.size).toBe(10);
  const sizes = await Promise.all(
    images.map((buffer) => sharp(buffer).metadata()),
  );
  const width = Math.max(...sizes.map((s) => s.width)),
    height = sizes.reduce((n, s) => n + s.height, 0);
  let top = 0;
  const overlays = images.map((input, i) => {
    const overlay = { input, top, left: 0 };
    top += sizes[i].height;
    return overlay;
  });
  await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite(overlays)
    .png()
    .toFile(info.outputPath("georgian-choices.png"));
});
test("admin review shows other owners and does not autosave their books", async ({
  page,
}) => {
  const book = newBook(40, "Another account’s book");
  book.pages[1].caption = "Original page";
  const writes = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() !== "GET")
      writes.push({ path, method: request.method() });
    let data;
    if (path === "/api/session")
      data = {
        user: {
          id: "admin-user",
          email: "admin@example.invalid",
          isAdmin: true,
        },
        csrfToken: "synthetic-token",
      };
    else if (path === "/api/auth/logout") data = {};
    else if (path === "/api/books") data = { books: [], storageUsed: 0 };
    else if (path === "/api/admin/books")
      data = {
        total: 1,
        books: [
          {
            id: book.id,
            title: book.title,
            pageCount: 40,
            ownerId: "another-user",
            ownerEmail: "author@example.invalid",
            updatedAt: new Date().toISOString(),
            cover: null,
          },
        ],
      };
    else if (path === "/api/admin/books/" + book.id)
      data = {
        book,
        id: book.id,
        revision: 1,
        ownerId: "another-user",
        ownerEmail: "author@example.invalid",
      };
    else return route.fulfill({ status: 404, json: { error: "not_found" } });
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "All books · administrator · 1" }),
  ).toBeVisible();
  await expect(page.locator(".book-owner")).toHaveText(
    "author@example.invalid",
  );
  await page.locator(".book-card-open").click();
  await expect(page.locator(".save-bar")).toContainText("Administrator review");
  await expect(page.getByLabel("Your words")).toBeDisabled();
  await expect(page.getByLabel("Inside pages", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Upload photos", exact: false }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Export book", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(page.locator(".active-leaf .page-caption")).toHaveText(
    "Original page",
  );
  await page.waitForTimeout(2700);
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "← My books", exact: true }).click();
  await expect(page.locator(".book-card")).toHaveCount(1);
  expect(writes).toEqual([]);
  await page.locator('.book-card-open').click();
  await page.getByRole('button',{name:'admin@example.invalid',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  expect(writes).toEqual([{path:'/api/auth/logout',method:'POST'}]);
  const drafts=await page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open('matiane',2);open.onsuccess=()=>{const db=open.result;const request=db.transaction('books').objectStore('books').getAll();request.onsuccess=()=>{resolve(request.result);db.close();};};}));
  expect(drafts).toEqual([]);
});
