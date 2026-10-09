import { it, expect } from "vitest";
import fs from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { FONT_CATALOG, fontName, fallbackFontName } from "./fonts";
const load = (name) =>
  fontkit.create(
    new Uint8Array(
      fs.readFileSync(new URL(`../public/fonts/${name}.ttf`, import.meta.url)),
    ),
  );
it("provides at least eight real licensed families with Georgian, Russian and Latin glyphs in both weights", () => {
  const distinct = FONT_CATALOG.filter((f) => f.id !== "compact");
  expect(new Set(distinct.map((f) => f.name)).size).toBeGreaterThanOrEqual(8);
  for (const font of FONT_CATALOG)
    for (const bold of [false, true])
      for (const [georgian, text] of [
        [
          false,
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя",
        ],
        [true, "აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ"],
      ]) {
        const face = load(fontName(font.id, bold, georgian));
        for (const char of text)
          expect(
            face.hasGlyphForCodePoint(char.codePointAt(0)),
            `${font.name} ${bold ? "bold" : "regular"}: ${char}`,
          ).toBe(true);
      }
});
it("has an embeddable Georgian Mtavruli fallback for every family in both weights", () => {
  for (const font of FONT_CATALOG)
    for (const bold of [false, true]) {
      const face = load(fallbackFontName(font.id, bold, true));
      for (let cp = 0x1c90; cp <= 0x1cb0; cp++)
        expect(face.hasGlyphForCodePoint(cp)).toBe(true);
    }
});

it("supplies ten distinct Georgian designs, independently of the Latin choice", async () => {
  const { GEORGIAN_FONT_CATALOG } = await import("./fonts");
  expect(GEORGIAN_FONT_CATALOG).toHaveLength(10);
  const shapes = new Set();
  for (const font of GEORGIAN_FONT_CATALOG) {
    const face = load(font.regular);
    for (const char of "აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ")
      expect(
        face.hasGlyphForCodePoint(char.codePointAt(0)),
        font.name + ": " + char,
      ).toBe(true);
    shapes.add(
      ["თ", "მ", "გ", "ლ"]
        .map((c) => face.glyphForCodePoint(c.codePointAt(0)).path.toSVG())
        .join(""),
    );
    for (const latin of FONT_CATALOG)
      expect(fontName(latin.id, false, true, false, font.id)).toBe(
        font.regular,
      );
  }
  expect(shapes.size).toBe(10);
});
it("uses original italic faces for the serif and Montserrat choices and retains legacy fonts", async () => {
  const { LEGACY_FONT_CATALOG } = await import("./fonts");
  for (const f of FONT_CATALOG.filter((f) => f.regularItalic))
    expect(fontName(f.id, false, false, true)).not.toBe(
      fontName(f.id, false, false, false),
    );
  for (const f of LEGACY_FONT_CATALOG)
    expect(load(fontName(f.id, false, true)).hasGlyphForCodePoint(0x10d0)).toBe(
      true,
    );
});
it("preserves actual outlines when embedding every current font and italic face as a PDF subset", async () => {
  const { GEORGIAN_FONT_CATALOG } = await import("./fonts");
  const assets = new Set([
    ...FONT_CATALOG.flatMap((f) =>
      [f.regular, f.bold, f.regularItalic, f.boldItalic].filter(Boolean),
    ),
    ...GEORGIAN_FONT_CATALOG.map((f) => f.regular),
  ]);
  for (const asset of assets) {
    const original = load(asset),
      subset = original.createSubset();
    const samples = [..."Our story Москва თბილისი"].filter(
      (c) => c !== " " && original.hasGlyphForCodePoint(c.codePointAt(0)),
    );
    const mapping = samples.map((char) => {
      const glyph = original.glyphForCodePoint(char.codePointAt(0));
      return { char, glyph, id: subset.includeGlyph(glyph) };
    });
    const data = await new Promise((resolve, reject) => {
      const chunks = [],
        stream = subset.encodeStream();
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
    const embedded = fontkit.create(new Uint8Array(data));
    for (const { char, glyph, id } of mapping)
      expect(embedded.getGlyph(id).path.toSVG(), asset + ": " + char).toBe(
        glyph.path.toSVG(),
      );
  }
});
