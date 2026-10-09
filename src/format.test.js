import { it, expect } from "vitest";
import { newBook, validateBook, slots, effectiveDpi, issues } from "./model";
import { bookFormat, pageSize, sheetGeometry } from "./format";
import { pdfSheets } from "./pdf-layout";
it("uses 190 × 240 mm interiors, independent 195 × 245 mm covers and adjustable spine/wrap", () => {
  const book = validateBook(newBook());
  expect(pageSize(book, book.pages[1])).toEqual({ w: 190, h: 240 });
  expect(pageSize(book, book.pages[0])).toEqual({ w: 195, h: 245 });
  book.cover.spineWidth = 12;
  book.cover.wrap = 15;
  for (const layout of ["pages", "spreads"]) {
    const sheets = pdfSheets(book, { scope: "covers", layout });
    expect(sheets).toHaveLength(1);
    const geometry = sheetGeometry(book, sheets[0]);
    expect(geometry.w).toBe(438);
    expect(geometry.h).toBe(281);
    expect(geometry.spine).toEqual({ x: 213, y: 18, w: 12, h: 245 });
    expect(geometry.panels.map((p) => p.x)).toEqual([18, 225]);
    expect(geometry.panels[0].full).toEqual({ x: -18, y: -18, w: 213, h: 281 });
    expect(geometry.panels[1].full).toEqual({ x: 0, y: -18, w: 213, h: 281 });
  }
});
it("keeps old A5 projects physically unchanged and rejects invalid format and cover dimensions", () => {
  const old = newBook();
  delete old.format;
  delete old.cover;
  const restored = validateBook(old);
  expect(bookFormat(restored).w).toBe(148);
  expect(restored.cover.spineWidth).toBe(8);
  for (const format of ["constructor", "toString", {}, "unknown"])
    expect(() => validateBook({ ...old, format })).toThrow();
  for (const key of ["wrap", "spineWidth"])
    for (const value of [-1, Infinity, NaN, 100]) {
      const b = newBook();
      b.cover[key] = value;
      expect(() => validateBook(b)).toThrow();
    }
  const b = newBook();
  b.cover.spine.georgianFont = "fake";
  expect(() => validateBook(b)).toThrow();
});
it("calculates print warnings from the actual larger physical slot and zoom", () => {
  const b = newBook();
  b.photos = [{ id: "photo", width: 1600, height: 2000 }];
  b.pages[2].photos = ["photo"];
  const slot = slots(b.pages[2].layout, pageSize(b, b.pages[2]))[0];
  expect(effectiveDpi(b.photos[0], slot, b.pages[2].crops[0])).toBeLessThan(
    300,
  );
  const before = issues(b).find(
    (w) => w.page === 2 && w.type === "resolution",
  ).dpi;
  b.pages[2].crops[0].zoom = 2;
  expect(
    Math.abs(
      issues(b).find((w) => w.page === 2 && w.type === "resolution").dpi -
        before / 2,
    ),
  ).toBeLessThanOrEqual(1);
});
