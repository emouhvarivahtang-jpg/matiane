import { it, expect } from "vitest";
import { newBook, imageRect, slots } from "./model";
import { pdfSheets } from "./pdf-layout";
import { pdfImagePlan, pdfPhotoSlot } from "./pdf-images";

const photo = (id = "original", src = "same.jpeg") => ({
  id,
  src,
  width: 6000,
  height: 4000,
});
const put = (
  page,
  id,
  layout = "editorial",
  crop = { x: 50, y: 50, zoom: 1 },
) => {
  Object.assign(page, { photos: [id], layout, crops: [crop] });
};

it("keeps source resolution and ignores unused photographs and out-of-scope pages", () => {
  const book = newBook();
  book.format = "a5";
  book.photos = [photo(), photo("unused", "unused.jpeg")];
  put(book.pages[1], "original");
  put(book.pages[0], "original", "full", { x: 50, y: 50, zoom: 5 });
  const sheets = pdfSheets(book, { scope: "interior" });
  expect(pdfImagePlan(book, sheets).get("same.jpeg").ratio).toBe(1);
  const plan = pdfImagePlan(book, sheets, { quality: "print300" });
  expect(plan.size).toBe(1);
  expect(plan.get("same.jpeg").ratio).toBeCloseTo((300 * 153) / 4000 / 25.4);
  expect(() => pdfImagePlan(book, sheets, { quality: "invalid" })).toThrow();
});

it("extends full-frame photographs into external bleed but keeps the spread centre flush", () => {
  const page = { layout: "full" },
    slot = slots("full")[0];
  expect(pdfPhotoSlot(page, slot, 0, 1, true)).toEqual({
    x: -3,
    y: -3,
    w: 154,
    h: 216,
  });
  expect(pdfPhotoSlot(page, slot, 0, 2, true)).toEqual({
    x: -3,
    y: -3,
    w: 151,
    h: 216,
  });
  expect(pdfPhotoSlot(page, slot, 1, 2, true)).toEqual({
    x: 0,
    y: -3,
    w: 151,
    h: 216,
  });
  expect(pdfPhotoSlot(page, slot, 0, 1, false)).toEqual(slot);
  const editorial = slots("editorial")[0];
  expect(pdfPhotoSlot({ layout: "editorial" }, editorial, 0, 1, true)).toBe(
    editorial,
  );
});

it("shares identical image data across photo IDs and retains every panned crop at the largest required resolution", () => {
  const book = newBook();
  book.format = "a5";
  book.photos = [photo(), photo("duplicate")];
  put(book.pages[2], "original", "editorial", { x: 0, y: 0, zoom: 1 });
  put(book.pages[3], "duplicate", "full", { x: 100, y: 100, zoom: 1.4 });
  const sheets = pdfSheets(book, { layout: "spreads", scope: "interior" });
  const plan = pdfImagePlan(book, sheets, { quality: "print300" });
  expect(plan.size).toBe(1);
  const entry = plan.get("same.jpeg");
  expect(entry.ratio).toBeCloseTo((((300 * 216) / 4000) * 1.4) / 25.4);
  expect(entry.area.x).toBe(0);
  expect(entry.area.y).toBe(0);
  expect(entry.area.right).toBeCloseTo(6000);
  expect(entry.area.bottom).toBeCloseTo(4000);
});

it("removes only invisible areas and preserves at least 300 DPI for all placements", () => {
  for (const layout of [
    "editorial",
    "full",
    "pair",
    "diptych",
    "grid",
    "gallery",
  ])
    for (const x of [0, 50, 100])
      for (const zoom of [1, 1.3]) {
        const book = newBook();
  book.format = "a5";
        book.photos = [photo()];
        put(book.pages[1], "original", layout, { x, y: 100 - x, zoom });
        const entry = pdfImagePlan(book, [[book.pages[1]]], {
          quality: "print300",
        }).get("same.jpeg");
        const slot = pdfPhotoSlot(book.pages[1], slots(layout)[0], 0, 1, true);
        const rect = imageRect(book.photos[0], slot, book.pages[1].crops[0]);
        expect(entry.area.x * rect.scale + rect.x).toBeCloseTo(0);
        expect(entry.area.y * rect.scale + rect.y).toBeCloseTo(0);
        expect(entry.area.right * rect.scale + rect.x).toBeCloseTo(slot.w);
        expect(entry.area.bottom * rect.scale + rect.y).toBeCloseTo(slot.h);
        expect((entry.ratio * 25.4) / rect.scale).toBeCloseTo(300);
      }
});

it("does not upscale low-resolution images or reduce sources needed by a strong zoom", () => {
  const book = newBook();
  book.format = "a5";
  book.photos = [{ ...photo(), width: 640, height: 480 }];
  put(book.pages[1], "original");
  expect(
    pdfImagePlan(book, [[book.pages[1]]], { quality: "print300" }).get(
      "same.jpeg",
    ).ratio,
  ).toBe(1);
  book.photos = [photo()];
  put(book.pages[2], "original", "full", { x: 50, y: 50, zoom: 5 });
  expect(
    pdfImagePlan(book, [[book.pages[1]], [book.pages[2]]], {
      quality: "print300",
    }).get("same.jpeg").ratio,
  ).toBe(1);
});

it("keeps resolution when duplicate source metadata is inconsistent", () => {
  const book = newBook();
  book.format = "a5";
  book.photos = [photo(), { ...photo("duplicate"), width: 3000, height: 2000 }];
  put(book.pages[1], "original");
  put(book.pages[2], "duplicate");
  expect(
    pdfImagePlan(book, [[book.pages[1]], [book.pages[2]]], {
      quality: "print300",
    }).get("same.jpeg").ratio,
  ).toBe(1);
});
