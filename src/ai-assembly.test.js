import { describe, it, expect } from "vitest";
import { newBook, imageRect, slots } from "./model.js";
import { assembleBook } from "./ai-assembly.js";
const make = (n, count = 40, language = "en") => {
  const book = newBook(count, "Our story", language);
  book.photos = Array.from({ length: n }, (_, i) => ({
    id: `photo-${i}`,
    name: `Photo ${i}`,
    src: "/photos/mountains.jpg",
    width: i % 2 ? 2400 : 3600,
    height: i % 2 ? 3600 : 2400,
    demo: false,
  }));
  return book;
};
describe("AI book assembly", () => {
  it("repairs unknown, missing and repeated photo IDs while preserving every source and designed cover", () => {
    const book = make(8);
    book.pages[0].photos[0] = "photo-7";
    book.pages[0].caption = "My own cover";
    const before = structuredClone(book);
    const result = assembleBook(book, [], {
      pages: [
        {
          layout: "made-up",
          photoIds: ["fake", "photo-0", "photo-0"],
          caption: "A warm day",
        },
        { layout: "pair", photoIds: ["photo-1", "photo-2"] },
      ],
    });
    const ids = result.pages
      .slice(1, -1)
      .flatMap((p) => p.photos)
      .filter(Boolean);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect(result.photos).toEqual(book.photos);
    expect(result.pages[0]).toEqual(book.pages[0]);
    expect(book).toEqual(before);
  });
  it("fits all 200 photos by increasing a 40-page book to 60 without losing a photo", () => {
    const book = make(200);
    const result = assembleBook(book);
    expect(result.pageCount).toBe(60);
    expect(result.pages).toHaveLength(62);
    const ids = result.pages
      .slice(1, -1)
      .flatMap((p) => p.photos)
      .filter(Boolean);
    expect(ids).toHaveLength(200);
    expect(new Set(ids).size).toBe(200);
    expect(result.pages.slice(1, -1).every((p) => p.photos.some(Boolean))).toBe(
      true,
    );
    expect(book.pageCount).toBe(40);
  });
  it("makes varied compatible templates and valid frame-filled crops for a dense album", () => {
    const book = make(100),
      analyses = book.photos.map((p) => ({
        id: p.id,
        subjectCenter: [0.99, 0.01],
        group: "travel",
      }));
    const result = assembleBook(book, analyses);
    expect(
      new Set(result.pages.slice(1, -1).map((p) => p.layout)).size,
    ).toBeGreaterThan(1);
    expect(
      result.pages
        .slice(1, -1)
        .some((p) => p.photos.filter(Boolean).length === 1),
    ).toBe(true);
    for (const page of result.pages.slice(1, -1))
      for (const [i, slot] of slots(page.layout, {
        w: 190,
        h: 240,
      }).entries()) {
        const photo = result.photos.find((p) => p.id === page.photos[i]);
        if (!photo) continue;
        const rect = imageRect(photo, slot, page.crops[i]);
        expect(rect.x).toBeLessThanOrEqual(0);
        expect(rect.y).toBeLessThanOrEqual(0);
        expect(rect.x + rect.w).toBeGreaterThanOrEqual(slot.w - 0.001);
        expect(rect.y + rect.h).toBeGreaterThanOrEqual(slot.h - 0.001);
      }
  });
  it("rejects empty books and substitutes target-language captions for malformed provider data", () => {
    expect(() => assembleBook(make(0))).toThrow("ai_no_photos");
    const ru = assembleBook(make(4, 40, "ru"), [
      { id: "photo-0", caption: "A happy day" },
    ]);
    expect(ru.pages[1].caption).toMatch(/[А-Яа-я]/);
    const ka = assembleBook(make(4, 40, "ka"));
    expect(ka.pages[1].caption).toMatch(/[\u10a0-\u10ff]/);
  });
  it("fills compatible frames for odd dense albums instead of leaving a partial grid", () => {
    const result = assembleBook(make(147));
    const interiors = result.pages.slice(1, -1);
    expect(interiors.flatMap((p) => p.photos).filter(Boolean)).toHaveLength(
      147,
    );
    expect(interiors.every((p) => p.photos.filter(Boolean).length !== 3)).toBe(
      true,
    );
    expect(
      interiors
        .filter((p) => p.layout === "full")
        .every((p) => p.caption === ""),
    ).toBe(true);
  });
});
