import { test, expect } from "@playwright/test";
import { PDFDocument, decodePDFRawStream } from "pdf-lib";
import fs from "node:fs/promises";
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
  await expect(page.locator(".canvas-toolbar")).toContainText("Cover layout");
  expect(await page.locator(".workspace .book-spread .book-page").count()).toBe(
    2,
  );
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await edit(page, "Saved page");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
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
  await second
    .getByRole("button", { name: "Fit whole photo", exact: true })
    .click();
  await expect(page.locator(".photo-used")).toContainText("Used");
  await edit(page, "Move this page");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
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
test("formats Russian and Georgian text and exports real PDFs with embedded fonts", async ({
  page,
}, info) => {
  await create(page);
  await edit(page, "თბილისი — Москва, наши воспоминания");
  await page.getByLabel("Typography").selectOption("compact");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page.getByRole("button", { name: "Underline", exact: true }).click();
  await page.getByLabel("Text color", { exact: true }).fill("#a23c52");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
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
      scope === "all" ? 42 : scope === "interior" ? 40 : 2,
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
    expect(doc.getPage(0).getWidth()).toBeCloseTo((154 * 72) / 25.4);
    expect(doc.getPage(0).getTrimBox().height).toBeCloseTo((210 * 72) / 25.4);
  }
  const data = await downloadProject(page);
  expect(data.pages[0].font).toBe("compact");
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
test("account autosave, named versions, recovery login and saved photos survive logout", async ({
  page,
}) => {
  test.skip(
    process.env.MATIANE_TEST_URL?.startsWith("http://"),
    "Accounts require HTTPS",
  );
  await create(page, "Cloud original");
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
}, info) => {
  const base = process.env.MATIANE_TEST_URL || "http://127.0.0.1:5173";
  await page.route("http://matiane.test/**", async (route) => {
    const u = new URL(route.request().url());
    await route.fulfill({
      response: await page.request.get(
        new URL(u.pathname + u.search, base).href,
      ),
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
  await page.unrouteAll({ behavior: "wait" });
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
