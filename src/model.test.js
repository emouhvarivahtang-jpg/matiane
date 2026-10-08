import { describe, it, expect } from "vitest";
import {
  newBook,
  demoBook,
  newPage,
  validateBook,
  spreads,
  resizeBook,
  reorderPage,
  deletePage,
  forkBook,
  slots,
  imageRect,
  effectiveDpi,
  issues,
} from "./model";
describe("books, spreads and legacy drafts", () => {
  it("uses fixed inside counts plus two labeled covers and correct facing pages", () => {
    for (const n of [40, 60, 80]) {
      const b = validateBook(newBook(n));
      expect(b.pages).toHaveLength(n + 2);
      expect(b.pages[0].kind).toBe("front");
      expect(b.pages.at(-1).kind).toBe("back");
      const s = spreads(b);
      expect(s[0]).toEqual([n + 1, 0]);
      expect(s[1]).toEqual([null, 1]);
      expect(s[2]).toEqual([2, 3]);
      expect(s.at(-1)).toEqual([n, null]);
      expect(
        s
          .slice(1)
          .flat()
          .filter((v) => v !== null),
      ).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
    expect(() => newBook(20)).toThrow();
  });
  it("migrates all legacy pages without turning the first page into a cover", () => {
    const old = {
      ...demoBook(),
      version: 1,
      pages: [
        {
          ...newPage(),
          layout: "pair",
          photos: ["demo-0"],
          focus: { x: 20, y: 30 },
          caption: "თბილისი Москва",
        },
      ],
    };
    const b = validateBook(old);
    expect(b.pageCount).toBe(40);
    expect(b.pages[1].caption).toBe("თბილისი Москва");
    expect(b.pages[1].photos).toEqual(["demo-0", null]);
    expect(b.pages[1].crops[0]).toEqual({ x: 20, y: 30, zoom: 1 });
    expect(b.pages[0].kind).toBe("front");
    expect(old.pages).toHaveLength(1);
  });
  it("keeps covers fixed when resizing or reordering and retains page styles", () => {
    const b = demoBook();
    b.pages[2].bold = true;
    const moved = reorderPage(b, 2, 7);
    expect(moved.pages[7]).toEqual(b.pages[2]);
    expect(moved.pages[0]).toEqual(b.pages[0]);
    expect(moved.pages.at(-1)).toEqual(b.pages.at(-1));
    expect(reorderPage(b, 0, 5)).toBe(b);
    const bigger = resizeBook(moved, 80);
    expect(bigger.pages).toHaveLength(82);
    expect(bigger.pages[7].bold).toBe(true);
    expect(resizeBook(bigger, 40).pages.at(-1)).toEqual(b.pages.at(-1));
  });
  it("copies photos and all page references without sharing book identifiers", () => {
    const b = demoBook(),
      copy = validateBook(forkBook(b));
    expect(copy.id).not.toBe(b.id);
    expect(copy.pages[0].photos[0]).toBe(copy.photos[0].id);
    expect(copy.pages[0].id).not.toBe(b.pages[0].id);
  });
  it("deletes an inside page, shifts content, appends one blank and preserves covers and photos", () => {
    for (const count of [40, 60, 80]) {
      const book = resizeBook(demoBook(), count);
      for (const index of [1, 3, count]) {
        const next = validateBook(deletePage(book, index));
        expect(next.pageCount).toBe(count);
        expect(next.pages).toHaveLength(count + 2);
        expect(next.pages[0]).toEqual(book.pages[0]);
        expect(next.pages.at(-1)).toEqual(book.pages.at(-1));
        expect(next.pages.slice(1, count)).toEqual(
          book.pages.slice(1, -1).filter((_, i) => i + 1 !== index),
        );
        expect(next.pages[count].caption).toBe("");
        expect(next.pages[count].photos).toEqual([null]);
        expect(book.pages.some((p) => p.id === next.pages[count].id)).toBe(
          false,
        );
        expect(next.photos).toEqual(book.photos);
      }
      expect(deletePage(book, 0)).toBe(book);
      expect(deletePage(book, count + 1)).toBe(book);
    }
  });
  it("rejects unsafe photo sources, broken references and style data", () => {
    const b = demoBook();
    expect(validateBook(b).pages).toHaveLength(42);
    for (const change of [
      (p) => (p.photos[0] = "unknown"),
      (p) => (p.fontSize = NaN),
      (p) => (p.crops[0].zoom = 20),
      (p) => (p.textColor = "url(x)"),
    ]) {
      const next = structuredClone(b);
      change(next.pages[0]);
      expect(() => validateBook(next)).toThrow();
    }
    expect(() =>
      validateBook({
        ...b,
        photos: [{ ...b.photos[0], src: "https://example.com/photo.jpg" }],
      }),
    ).toThrow();
  });
});
describe("photo crop and print warnings", () => {
  it("always fills the frame and adjusts print quality for zoom", () => {
    const photo = { width: 3000, height: 2000 },
      slot = { w: 100, h: 150 };
    expect(effectiveDpi(photo, slot)).toBeCloseTo(338.67, 1);
    expect(effectiveDpi(photo, slot, { x: 20, y: 40, zoom: 2 })).toBeCloseTo(
      169.33,
      1,
    );
    const fit = imageRect(photo, slot, { x: 50, y: 50, zoom: 0.1 });
    expect(fit.w).toBeCloseTo(225);
    expect(fit.h).toBeCloseTo(150);
    expect(fit.y).toBe(0);
    const zoomed = imageRect(photo, slot, { x: 0, y: 100, zoom: 2 });
    expect(zoomed.x).toBeCloseTo(0);
    expect(zoomed.y + zoomed.h).toBeCloseTo(slot.h);
  });
  it("cannot expose blank space for any template, orientation, zoom or pan position", () => {
    for (const layout of [
      "editorial",
      "full",
      "pair",
      "diptych",
      "grid",
      "gallery",
    ])
      for (const slot of slots(layout))
        for (const photo of [
          { width: 3000, height: 2000 },
          { width: 2000, height: 3000 },
          { width: 2000, height: 2000 },
        ])
          for (const zoom of [0.1, 1, 2, 5, 10])
            for (const x of [-20, 0, 50, 100, 120]) {
              const rect = imageRect(photo, slot, { zoom, x, y: x });
              expect(rect.x).toBeLessThanOrEqual(0);
              expect(rect.y).toBeLessThanOrEqual(0);
              expect(rect.x + rect.w + 1e-9).toBeGreaterThanOrEqual(slot.w);
              expect(rect.y + rect.h + 1e-9).toBeGreaterThanOrEqual(slot.h);
            }
    const old = demoBook();
    old.pages[0].crops[0].zoom = 0.2;
    expect(validateBook(old).pages[0].crops[0].zoom).toBe(1);
  });
  it("preflights the requested pages including the front cover", () => {
    const b = newBook();
    expect(issues(b, "interior")).toHaveLength(40);
    expect(issues(b, "covers")).toEqual([{ page: 0, type: "empty" }]);
    expect(
      issues(demoBook()).some((w) => w.type === "resolution" && w.page === 0),
    ).toBe(true);
  });
  it("keeps photo frames within A5", () => {
    for (const l of [
      "editorial",
      "full",
      "pair",
      "diptych",
      "grid",
      "gallery",
      "text",
    ])
      for (const s of slots(l)) {
        expect(s.x + s.w).toBeLessThanOrEqual(148);
        expect(s.y + s.h).toBeLessThanOrEqual(210);
      }
  });
});
