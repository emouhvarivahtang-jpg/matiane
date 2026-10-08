// Reader spreads are adjacent facing pages, never a binding-specific imposition.
// First/last interior pages stand alone; virtual inside covers are not exported.
export function pdfSheets(book, { scope = "all", layout = "pages" } = {}) {
  if (
    !["all", "interior", "covers"].includes(scope) ||
    !["pages", "spreads"].includes(layout)
  )
    throw new Error("Invalid PDF selection");
  if (layout === "pages") {
    const pages =
      scope === "interior"
        ? book.pages.slice(1, -1)
        : scope === "covers"
          ? [book.pages[0], book.pages.at(-1)]
          : book.pages;
    return pages.map((page) => [page]);
  }
  const covers = [[book.pages.at(-1), book.pages[0]]];
  const interior = [[book.pages[1]]];
  for (let index = 2; index <= book.pageCount; index += 2) {
    interior.push(
      book.pages.slice(index, Math.min(index + 2, book.pageCount + 1)),
    );
  }
  return scope === "covers"
    ? covers
    : scope === "interior"
      ? interior
      : [...covers, ...interior];
}
