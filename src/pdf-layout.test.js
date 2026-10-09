import { it, expect } from "vitest";
import { newBook } from "./model";
import { pdfSheets } from "./pdf-layout";
it("exports every selected physical page once, in facing-page order, without adding inside covers", () => {
  for (const count of [40, 60, 80]) {
    const book = newBook(count);
    for (const scope of ["all", "interior", "covers"]) {
      const pages = pdfSheets(book, { scope });
      const spreads = pdfSheets(book, { scope, layout: "spreads" });
      expect(
        spreads
          .flat()
          .map((p) => p.id)
          .sort(),
      ).toEqual(
        pages
          .flat()
          .map((p) => p.id)
          .sort(),
      );
      expect(spreads).toHaveLength(
        scope === "covers" ? 1 : count / 2 + (scope === "all" ? 2 : 1),
      );
      if (scope !== "interior")
        expect(Array.from(spreads[0])).toEqual([book.pages.at(-1), book.pages[0]]);
      if (scope !== "covers") {
        const interior = scope === "all" ? spreads.slice(1) : spreads;
        expect(interior[0]).toEqual([book.pages[1]]);
        expect(interior[1]).toEqual([book.pages[2], book.pages[3]]);
        expect(interior.at(-1)).toEqual([book.pages[count]]);
      }
    }
  }
});
