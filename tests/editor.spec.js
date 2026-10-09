import { test, expect } from "./fixtures";
import { PDFDocument, decodePDFRawStream } from "pdf-lib";
import fs from "node:fs/promises";
import { FONT_CATALOG, GEORGIAN_FONT_CATALOG } from "../src/fonts.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const create = async (page, title = "My memories", count = 40) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill(title);
  await page.getByRole("button", { name: String(count), exact: true }).click();
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await expect(page.locator(".page-thumb")).toHaveCount(count + 2);
};
const edit = async (page, text) => {
  await page.locator(".active-leaf .editable-caption").click();
  await page.getByLabel("Your words").fill(text);
};
const downloadProject = async (page) => {
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download project", exact: true })
    .click();
  return JSON.parse(await fs.readFile(await (await event).path(), "utf8"));
};
test("cabinet keeps multiple books, fixed counts and covers, backs up shrinking", async ({
  page,
}) => {
  await create(page, "First book", 60);
  await expect(page.getByLabel("Inside pages", { exact: true })).toHaveValue(
    "60",
  );
  await expect(page.locator(".canvas-toolbar")).toContainText("Cover ·");
  expect(await page.locator(".workspace .book-spread .book-page").count()).toBe(
    2,
  );
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await edit(page, "Saved page");

  await page.getByRole("button", { name: "← My books", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "First book", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByRole("button", { name: "80", exact: true }).click();
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await expect(page.locator(".page-thumb")).toHaveCount(82);
  page.on("dialog", (d) => d.accept());
  await page.getByLabel("Inside pages", { exact: true }).selectOption("40");
  await expect(page.locator(".page-thumb")).toHaveCount(42);
  await page.getByRole("button", { name: "← My books", exact: true }).click();
  await expect(page.locator(".book-card")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".book-card")).toHaveCount(3);
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "First book", exact: true }),
    })
    .click();
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await expect(page.locator(".active-leaf .page-caption")).toHaveText(
    "Saved page",
  );
});
test("all photos crop on canvas independently, usage labels, reorder and spreads", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await create(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/photos/mountains.jpg");
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await page.getByRole("button", { name: "Side by side", exact: true }).click();
  await page.locator(".active-leaf .photo-frame").first().click();
  await page
    .getByRole("button", {
      name: "Your photographs: mountains.jpg",
      exact: true,
    })
    .click();
  const first = page.locator(".active-leaf .photo-frame").first();
  const before = await first.locator("img").getAttribute("style");
  await first.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect(await first.locator("img").getAttribute("style")).not.toBe(before);
  const warning = await first.locator(".quality-badge").textContent();
  await first.hover();
  await page.mouse.wheel(0, -150);
  await expect(first.locator(".quality-badge")).not.toHaveText(warning);
  const bounds = await first.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * 0.5,
    bounds.y + bounds.height * 0.4,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.7,
    bounds.y + bounds.height * 0.5,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.locator(".active-leaf .photo-frame").nth(1).click();
  await page
    .getByRole("button", {
      name: "Your photographs: mountains.jpg",
      exact: true,
    })
    .click();
  const second = page.locator(".active-leaf .photo-frame").nth(1);
  await second.getByRole("button", { name: "Fill frame", exact: true }).click();
  await expect(page.locator(".photo-used")).toContainText("Used");
  await edit(page, "Move this page");

  const data = await downloadProject(page);
  expect(data.pages[2].crops[0].zoom).not.toEqual(data.pages[2].crops[1].zoom);
  expect(data.pages[2].crops[0].x).not.toEqual(50);
  await page
    .getByRole("button", { name: "Page 2", exact: true })
    .dragTo(page.getByRole("button", { name: "Page 5", exact: true }));
  await expect(page.locator(".active-leaf .page-caption")).toHaveText(
    "Move this page",
  );
  expect((await downloadProject(page)).pages[5].caption).toBe("Move this page");
  await expect(page.locator(".page-thumb")).toHaveCount(42);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".book-page")).toHaveCount(2);
  await expect(page.getByRole("dialog").locator(".quality-badge")).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
test("deletes a page with confirmation, shifts following content, keeps covers and supports undo", async ({
  page,
}) => {
  await create(page);
  await expect(
    page.getByRole("button", { name: "Delete page", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await edit(page, "Delete me");

  await page.getByRole("button", { name: "Page 3", exact: true }).click();
  await edit(page, "Preserve the next page");

  const original = await downloadProject(page);
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  await expect(page.locator(".active-leaf .page-caption")).toHaveText(
    "Delete me",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  await expect(page.locator(".active-leaf .page-caption")).toHaveText(
    "Preserve the next page",
  );
  await expect(page.locator(".page-thumb")).toHaveCount(42);
  const changed = await downloadProject(page);
  expect(changed.pages[40].caption).toBe("");
  expect(changed.pages[0]).toEqual(original.pages[0]);
  expect(changed.pages[41]).toEqual(original.pages[41]);
  expect(changed.pages.some((p) => p.caption === "Delete me")).toBe(false);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".active-leaf .page-caption")).toHaveText(
    "Delete me",
  );
});
test("photo fills every changed template after zooming out and panning to the limits", async ({
  page,
}) => {
  await create(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/photos/mountains.jpg");
  await page.locator(".library-photo>button").first().click();
  for (const layout of [
    "Editorial",
    "Full bleed",
    "Two moments",
    "Side by side",
    "Four stories",
    "The gallery",
  ]) {
    await page.getByRole("button", { name: layout, exact: true }).click();
    const frame = page.locator(".active-leaf .photo-frame").first();
    await frame.click();
    await frame.getByRole("button", { name: "Zoom in", exact: true }).click();
    await frame.hover();
    await page.mouse.wheel(0, 5000);
    await expect(
      frame.getByRole("button", { name: "Zoom out", exact: true }),
    ).toBeDisabled();
    for (let i = 0; i < 25; i++) await frame.press("ArrowRight");
    for (let i = 0; i < 25; i++) await frame.press("ArrowDown");
    const filled = await frame.evaluate((element) => {
      const frame = element.getBoundingClientRect(),
        image = element.querySelector("img").getBoundingClientRect();
      return (
        image.left <= frame.left + 0.5 &&
        image.top <= frame.top + 0.5 &&
        image.right >= frame.right - 0.5 &&
        image.bottom >= frame.bottom - 0.5
      );
    });
    expect(filled, layout).toBe(true);
  }
  await expect(
    page.getByRole("button", { name: "Fit whole photo", exact: true }),
  ).toHaveCount(0);
});
test("password visibility is reversible and does not submit or change its value", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const password = page.getByLabel("Password (at least 10 characters)");
  await password.fill("Visibility sample password");
  await expect(password).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("Visibility sample password");
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("formats Russian and Georgian text and exports real PDFs with embedded fonts", async ({
  page,
}, info) => {
  await create(page);
  await edit(page, "თბილისი — Москва, наши воспоминания");
  await page.getByLabel("English / Russian typeface").selectOption("manrope");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page.getByRole("button", { name: "Underline", exact: true }).click();
  await page.getByLabel("Text color", { exact: true }).fill("#a23c52");

  await expect(page.locator(".active-leaf .page-caption")).toHaveCSS(
    "font-weight",
    "700",
  );
  for (const scope of ["all", "interior", "covers"]) {
    await page
      .getByRole("button", { name: "Export book", exact: true })
      .click();
    await page.getByLabel("PDF pages").selectOption(scope);
    await page
      .getByLabel("I have reviewed these warnings and want to export anyway.")
      .check();
    const event = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download print PDF", exact: true })
      .click();
    const file = await event;
    const target = info.outputPath(scope + ".pdf");
    await file.saveAs(target);
    const doc = await PDFDocument.load(await fs.readFile(target));
    expect(doc.getPageCount()).toBe(
      scope === "all" ? 41 : scope === "interior" ? 40 : 1,
    );
    if (scope !== "interior") {
      const contents = doc.getPage(0).node.Contents();
      const stream = Buffer.from(
        decodePDFRawStream(doc.context.lookup(contents.get(0))).decode(),
      ).toString();
      const matrices = [
        ...stream.matchAll(
          /([\d.e-]+) ([\d.e-]+) ([\d.e-]+) ([\d.e-]+) ([\d.e-]+) ([\d.e-]+) Tm/g,
        ),
      ].map((m) => m.slice(1).map(Number));
      expect(matrices.length).toBeGreaterThan(0);
      // Italic must shear the glyphs, keeping each text baseline horizontal.
      for (const m of matrices) {
        expect(m[1]).toBe(0);
        expect(m[2]).toBeGreaterThan(0);
        expect(m[3]).toBe(1);
      }
    }
    expect(doc.getPage(0).getWidth()).toBeCloseTo(
      ((scope === "interior" ? 196 : 404) * 72) / 25.4,
    );
    expect(doc.getPage(0).getTrimBox().height).toBeCloseTo(
      ((scope === "interior" ? 240 : 245) * 72) / 25.4,
    );
  }
  const data = await downloadProject(page);
  expect(data.pages[0].font).toBe("manrope");
  expect(data.pages[0].bold).toBe(true);
  expect(data.pages[0].textColor).toBe("#a23c52");
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ваши фотографии", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ქარ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "თქვენი ფოტოები", exact: true }),
  ).toBeVisible();
});
test("HEIC decodes to a usable print image and project import preserves it", async ({
  page,
}) => {
  test.skip(
    !process.env.MATIANE_HEIC_FIXTURE,
    "Provide an external HEIC fixture",
  );
  await create(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(process.env.MATIANE_HEIC_FIXTURE);
  await expect(page.locator(".library-heading span")).toHaveText("1", {
    timeout: 45000,
  });
  await page.locator(".library-photo>button").first().click();
  await expect(page.locator(".active-leaf img")).toBeVisible();
  const data = await downloadProject(page);
  expect(data.photos[0].src).toMatch(/^data:image\/jpeg;base64,/);
  expect(data.photos[0].width).toBeGreaterThan(1000);
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "roundtrip.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await expect(page.locator(".active-leaf img")).toBeVisible();
});
test("exports facing spreads and individual pages with correct geometry and centre crop", async ({
  page,
}, info) => {
  await create(page);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(["public/photos/road.jpg", "public/photos/coast.jpg"]);
  for (const [index, photo] of [
    [2, "road.jpg"],
    [3, "coast.jpg"],
  ]) {
    await page
      .getByRole("button", { name: `Page ${index}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Full bleed", exact: true }).click();
    await page
      .getByRole("button", { name: `Your photographs: ${photo}`, exact: true })
      .click();
    await edit(
      page,
      index === 2 ? "Left leaf · მარცხენა" : "Right leaf · правая",
    );
  }
  for (const [layout, scope, bleed, count] of [
    ["spreads", "interior", true, 21],
    ["spreads", "covers", true, 1],
    ["spreads", "all", false, 22],
    ["pages", "interior", true, 40],
  ]) {
    await page
      .getByRole("button", { name: "Export book", exact: true })
      .click();
    await page.getByLabel("PDF layout").selectOption(layout);
    await page.getByLabel("PDF pages").selectOption(scope);
    await page.getByLabel("Include 3 mm bleed").setChecked(bleed);
    await page
      .getByLabel("I have reviewed these warnings and want to export anyway.")
      .check();
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download print PDF", exact: true })
      .click();
    const target = info.outputPath(
      `${layout}-${scope}-${bleed ? "bleed" : "trim"}.pdf`,
    );
    await (await downloaded).saveAs(target);
    const doc = await PDFDocument.load(await fs.readFile(target));
    expect(doc.getPageCount()).toBe(count);
    const b = bleed ? 3 : 0;
    for (const [index, sheet] of doc.getPages().entries()) {
      const single =
        layout === "pages" ||
        (scope !== "covers" &&
          (index === (scope === "all" ? 1 : 0) || index === count - 1));
      expect(sheet.getWidth()).toBeCloseTo(
        (((scope !== "interior" && index === 0 ? 398 : single ? 190 : 380) +
          b * 2) *
          72) /
          25.4,
      );
      expect(sheet.getTrimBox().width).toBeCloseTo(
        ((scope !== "interior" && index === 0 ? 398 : single ? 190 : 380) *
          72) /
          25.4,
      );
      expect(sheet.getTrimBox().height).toBeCloseTo(
        ((scope !== "interior" && index === 0 ? 245 : 240) * 72) / 25.4,
      );
      expect(sheet.getTrimBox().x).toBeCloseTo((b * 72) / 25.4);
    }
    if (layout === "spreads" && scope === "interior") {
      const sheet = doc.getPage(1),
        contents = sheet.node.Contents();
      const stream = Buffer.from(
        decodePDFRawStream(doc.context.lookup(contents.get(0))).decode(),
      ).toString();
      const boxes = [
        ...stream.matchAll(
          /([\d.e-]+) ([\d.e-]+) ([\d.e-]+) ([\d.e-]+) re\nW\nn/g,
        ),
      ].map((match) => match.slice(1).map(Number));
      expect(boxes).toHaveLength(2);
      expect(boxes[0][0]).toBeCloseTo(0);
      expect(boxes[0][0] + boxes[0][2]).toBeCloseTo((193 * 72) / 25.4);
      expect(boxes[1][0]).toBeCloseTo((193 * 72) / 25.4);
      expect(boxes[1][0] + boxes[1][2]).toBeCloseTo((386 * 72) / 25.4);
    }
  }
});
test("all free typefaces render Georgian and Cyrillic and embed both weights in PDF", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await create(page);
  let index = 2;
  for (const [fontIndex, font] of FONT_CATALOG.entries()) {
    for (const bold of [false, true]) {
      await page
        .getByRole("button", { name: `Page ${index++}`, exact: true })
        .click();
      await edit(page, "თბილისი · ᲗᲑᲘᲚᲘᲡᲘ · Москва · Memories");
      await expect(
        page.getByLabel("English / Russian typeface").locator("option"),
      ).toHaveCount(10);
      await page.getByLabel("English / Russian typeface").selectOption(font.id);
      await page
        .getByLabel("Georgian typeface", { exact: true })
        .selectOption(GEORGIAN_FONT_CATALOG[fontIndex].id);
      if (bold)
        await page.getByRole("button", { name: "Bold", exact: true }).click();
      await expect(page.locator(".active-leaf .page-caption")).toHaveCSS(
        "font-family",
        /.+/,
      );

      await page.evaluate(() => document.fonts.ready);
    }
  }
  await page.getByRole("button", { name: "Export book", exact: true }).click();
  await page.getByLabel("PDF pages").selectOption("interior");
  await page
    .getByLabel("I have reviewed these warnings and want to export anyway.")
    .check();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download print PDF", exact: true })
    .click();
  const target = info.outputPath("all-free-fonts.pdf");
  await (await downloaded).saveAs(target);
  const { stdout } = await promisify(execFile)("pdftotext", [
    "-layout",
    target,
    "-",
  ]);
  for (const text of ["თბილისი", "ᲗᲑᲘᲚᲘᲡᲘ", "Москва", "Memories"])
    expect(stdout.split(text)).toHaveLength(21);
  expect(stdout).not.toContain("�");
});
test("account autosave, named versions, recovery login and saved photos survive logout", async ({
  page,
}) => {
  test.skip(
    process.env.MATIANE_TEST_URL?.startsWith("http://"),
    "Accounts require HTTPS",
  );
  await create(page, "Cloud original");
  await edit(page, "თბილისი · моя книга");
  await page
    .getByLabel("English / Russian typeface")
    .selectOption("montserrat");

  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/photos/lake.jpg");
  await page.locator(".library-photo>button").first().click();
  await page
    .getByRole("button", { name: "Save in account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const email = `test-${Date.now()}-${Math.random().toString(16).slice(2)}@example.invalid`;
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password (at least 10 characters)")
    .fill("Synthetic browser password");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".recovery-code")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".save-bar")).toContainText("Saved in account", {
    timeout: 20000,
  });
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await page.getByLabel("Version name (optional)").fill("My checkpoint");
  await page
    .getByRole("button", { name: "Save a version", exact: true })
    .click();
  await expect(page.locator(".version-list")).toContainText("My checkpoint");
  await page.keyboard.press("Escape");
  await page.getByLabel("Book title", { exact: true }).fill("Cloud changed");
  await expect(page.locator(".save-bar")).toContainText("Saved in account", {
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  page.on("dialog", (d) => d.accept());
  await page
    .locator(".version-list>div")
    .filter({ hasText: "My checkpoint" })
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await expect(page.getByLabel("Book title", { exact: true })).toHaveValue(
    "Cloud original",
  );
  await page.getByRole("button", { name: email, exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password (at least 10 characters)")
    .fill("Synthetic browser password");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.locator(".cloud-books .book-card")).toHaveCount(1);
  await page.locator(".cloud-books .book-card-open").click();
  await expect(page.locator(".active-leaf img")).toBeVisible();
  expect((await downloadProject(page)).pages[0].font).toBe("montserrat");
  expect(
    await page.locator(".active-leaf img").evaluate((e) => e.naturalWidth),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "← My books", exact: true }).click();
  await page
    .locator(".cloud-books .book-card")
    .filter({ hasText: "Cloud original" })
    .getByRole("button", { name: "Delete book", exact: true })
    .click();
  await expect(
    page
      .locator(".cloud-books .book-card")
      .filter({ hasText: "Cloud original" }),
  ).toHaveCount(0);
});
test("legacy local draft migrates safely on HTTP and mobile studio fits", async ({
  page,
  request,
}, info) => {
  const base = process.env.MATIANE_TEST_URL || "http://127.0.0.1:5173";
  await page.route("http://matiane.test/**", async (route) => {
    const u = new URL(route.request().url());
    await route.fulfill({
      response: await request.get(new URL(u.pathname + u.search, base).href),
    });
  });
  await page.goto("http://matiane.test/");
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  await page.evaluate(async () => {
    const book = {
      version: 1,
      title: "Legacy memory",
      language: "en",
      photos: [],
      pages: [
        {
          id: "legacy",
          layout: "editorial",
          color: "#FAF8F3",
          photos: [null],
          focus: { x: 50, y: 50 },
          caption: "Preserve my original page",
          font: "serif",
          fontSize: 14,
          align: "center",
        },
      ],
    };
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("matiane", 2);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(book, "current");
      tx.oncomplete = resolve;
    });
    db.close();
  });
  await page.reload();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Legacy memory", exact: true }),
    })
    .click();
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(page.locator(".active-leaf .page-caption")).toHaveText(
    "Preserve my original page",
  );
  await expect(page.locator(".page-thumb")).toHaveCount(42);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "RU", exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "ქარ", exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: info.outputPath("mobile.png"),
    fullPage: true,
  });
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
test("desktop spread presentation", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Try a sample book", exact: true })
    .click();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath("desktop.png"),
    fullPage: true,
  });
});

test("moves an old IP draft to the secure studio once", async ({ page }) => {
  test.skip(
    !process.env.MATIANE_TEST_URL?.startsWith("https://"),
    "Live HTTPS transfer requires both deployed origins",
  );
  await page.goto("http://57.129.177.67/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill("Transferred memory");
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles("public/photos/road.jpg");
  await page.locator(".library-photo>button").first().click();
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("button", {
      name: "Move this book to secure studio",
      exact: true,
    })
    .click();
  const secure = await popup;
  await expect(secure.getByLabel("Book title", { exact: true })).toHaveValue(
    "Transferred memory",
    { timeout: 30000 },
  );
  await expect(secure.locator(".active-leaf img")).toBeVisible();
  await secure.getByRole("button", { name: "← My books", exact: true }).click();
  await expect(secure.locator(".book-card")).toHaveCount(1);
  await expect(page.getByLabel("Book title", { exact: true })).toHaveValue(
    "Transferred memory",
  );
});
