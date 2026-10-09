import { test, expect } from "./fixtures";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { newBook } from "../src/model.js";
import sharp from "sharp";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// A photographic fixture with deterministic fine grain, generated in memory.
// No large raster fixture or user photograph is stored in the repository.
async function photograph() {
  const { data, info } = await sharp("public/photos/mountains.jpg")
    .resize(5000, 3333, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let seed = 42;
  for (let i = 0; i < data.length; i += 3) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const grain = ((seed >>> 0) % 41) - 20;
    for (let c = 0; c < 3; c++)
      data[i + c] = Math.min(255, Math.max(0, data[i + c] + grain));
  }
  return sharp(data, { raw: info }).jpeg({ quality: 95 }).toBuffer();
}
const project = async (page) => {
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download project", exact: true })
    .click();
  return JSON.parse(await fs.readFile(await (await event).path(), "utf8"));
};
const jpegImages = (doc) =>
  doc.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter(
      (object) =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image" &&
        object.dict.get(PDFName.of("Filter"))?.toString() === "/DCTDecode",
    );

test("PDF profiles keep exact source bytes, share duplicate uploads and reduce print files without changing crops", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const jpeg = await photograph();
  const source = "data:image/jpeg;base64," + jpeg.toString("base64");
  const thumb = await sharp(jpeg).resize(320).jpeg({ quality: 75 }).toBuffer();
  const book = newBook(40, "Print-size review");
  book.photos = ["original-photo", "duplicate-photo"].map((id) => ({
    id,
    name: id + ".jpg",
    src: source,
    width: 5000,
    height: 3333,
    thumbnail: "data:image/jpeg;base64," + thumb.toString("base64"),
  }));
  for (let index = 1; index <= 40; index++) {
    const page = book.pages[index];
    page.photos = [book.photos[index % 2].id];
    page.crops = [
      {
        x: index === 2 ? 0 : index === 3 ? 100 : 50,
        y: 50,
        zoom: index === 3 ? 1.25 : 1,
      },
    ];
    page.caption = index === 2 ? "თბილისი · Москва · Memories" : "";
  }
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "print-size-review.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(book)),
    });
  await expect(page.locator(".page-thumb")).toHaveCount(42);
  const before = await project(page);
  const files = {};
  for (const layout of ["pages", "spreads"]) {
    for (const quality of ["source", "print300"]) {
      await page
        .getByRole("button", { name: "Export book", exact: true })
        .click();
      if (layout === "pages" && quality === "source")
        await expect(page.getByLabel("PDF image quality")).toHaveValue(
          "source",
        );
      await page.getByLabel("PDF layout").selectOption(layout);
      await page.getByLabel("PDF pages").selectOption("interior");
      await page.getByLabel("PDF image quality").selectOption(quality);
      const warning = page.getByLabel(
        "I have reviewed these warnings and want to export anyway.",
      );
      if (await warning.count()) await warning.check();
      const event = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download print PDF", exact: true })
        .click();
      const downloaded = await event;
      expect(downloaded.suggestedFilename()).toContain(
        `-${layout}-interior-${quality}.pdf`,
      );
      const target = info.outputPath(`${layout}-${quality}.pdf`);
      await downloaded.saveAs(target);
      const bytes = await fs.readFile(target);
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(layout === "pages" ? 40 : 21);
      const images = jpegImages(doc);
      expect(images).toHaveLength(1); // Same JPEG, two upload IDs, forty placements.
      const image = images[0],
        dimensions = await sharp(image.contents).metadata();
      if (quality === "source") {
        expect(Buffer.from(image.contents).equals(jpeg)).toBe(true);
        expect(dimensions.width).toBe(5000);
        expect(dimensions.height).toBe(3333);
      } else {
        expect(dimensions.width).toBeLessThan(5000);
        expect(dimensions.height).toBeLessThan(3333);
        // Largest physical scale: editorial 153 mm at 1.25× zoom. Every
        // placement has at least 300 DPI, including the panned crop union.
        const scale = (153 / 3333) * 1.25;
        expect(
          (dimensions.height * 25.4) / (3333 * scale),
        ).toBeGreaterThanOrEqual(300);
        expect(bytes.length).toBeLessThan(
          files[`${layout}-source`].bytes * 0.6,
        );
      }
      files[`${layout}-${quality}`] = {
        bytes: bytes.length,
        width: dimensions.width,
        height: dimensions.height,
        target,
      };
    }
  }
  // Render the same panned page at 150 DPI. The print profile may change fine
  // pixels, but image placement, crop and text must remain visually consistent.
  for (const quality of ["source", "print300"]) {
    await promisify(execFile)("pdftoppm", [
      "-f",
      "3",
      "-l",
      "3",
      "-singlefile",
      "-scale-to",
      "1200",
      "-png",
      files[`pages-${quality}`].target,
      info.outputPath(quality),
    ]);
  }
  const a = await sharp(info.outputPath("source.png"))
    .removeAlpha()
    .raw()
    .toBuffer();
  const b = await sharp(info.outputPath("print300.png"))
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(a.length).toBe(b.length);
  const meanDifference =
    a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) /
    a.length;
  expect(meanDifference).toBeLessThan(7);
  const after = await project(page);
  expect(after.photos).toEqual(before.photos);
  expect(after.pages).toEqual(before.pages);
  await fs.writeFile(
    info.outputPath("size-report.json"),
    JSON.stringify({ files, meanDifference }, null, 2),
  );
});

test("compact spreads remove hidden pixels while preserving pan, zoom, bleed and the centre seam", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const jpeg = await photograph();
  const book = newBook(40, "Cropped spread review");
  book.photos = [
    {
      id: "cropped-photo",
      name: "cropped.jpg",
      width: 5000,
      height: 3333,
      src: "data:image/jpeg;base64," + jpeg.toString("base64"),
    },
  ];
  for (const source of book.pages.slice(1, -1)) {
    source.layout = "full";
    source.photos = [book.photos[0].id];
    source.crops = [{ x: 73, y: 22, zoom: 1.1 }];
  }
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "cropped-spread.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(book)),
    });
  await expect(page.locator(".page-thumb")).toHaveCount(42);
  const files = {};
  for (const quality of ["source", "print300"]) {
    await page
      .getByRole("button", { name: "Export book", exact: true })
      .click();
    await page.getByLabel("PDF layout").selectOption("spreads");
    await page.getByLabel("PDF pages").selectOption("interior");
    await page.getByLabel("PDF image quality").selectOption(quality);
    const event = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download print PDF", exact: true })
      .click();
    const target = info.outputPath(`${quality}.pdf`);
    await (await event).saveAs(target);
    const bytes = await fs.readFile(target),
      doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(21);
    const [image] = jpegImages(doc);
    const dimensions = await sharp(image.contents).metadata();
    if (quality === "print300") {
      // Cropping really happened: source is landscape, the retained region is
      // portrait, with a small sampling margin. Merely resizing cannot do this.
      expect(dimensions.width).toBeLessThan(dimensions.height);
      expect(dimensions.width).toBeLessThan(1900);
      expect(dimensions.height).toBeGreaterThanOrEqual(
        Math.ceil((216 * 300) / 25.4),
      );
      expect(bytes.length).toBeLessThan(files.source.bytes * 0.45);
    }
    files[quality] = {
      bytes: bytes.length,
      width: dimensions.width,
      height: dimensions.height,
    };
    await promisify(execFile)("pdftoppm", [
      "-f",
      "2",
      "-l",
      "2",
      "-singlefile",
      "-scale-to",
      "1200",
      "-png",
      target,
      info.outputPath(quality),
    ]);
  }
  // Compare placement after filtering the fine grain that changes during
  // downsampling; this does not assert lossless or pixel-identical output.
  const a = await sharp(info.outputPath("source.png"))
    .blur(2)
    .removeAlpha()
    .raw()
    .toBuffer();
  const b = await sharp(info.outputPath("print300.png"))
    .blur(2)
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(a.length).toBe(b.length);
  const meanDifference =
    a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) /
    a.length;
  expect(meanDifference).toBeLessThan(4);
  await fs.writeFile(
    info.outputPath("size-report.json"),
    JSON.stringify({ files, meanDifference }, null, 2),
  );
});
