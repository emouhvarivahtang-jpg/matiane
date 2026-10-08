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
