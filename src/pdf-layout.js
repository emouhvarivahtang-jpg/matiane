// Reader spreads are adjacent facing pages, never a binding-specific imposition.
// First/last interior pages stand alone; virtual inside covers are not exported.
export function pdfSheets(book, { scope = "all", layout = "pages" } = {}) {
  if (
    !["all", "interior", "covers"].includes(scope) ||
    !["pages", "spreads"].includes(layout)
  )
    throw new Error("Invalid PDF selection");
  if (layout === "pages") {
    const interior = book.pages.slice(1, -1).map((page) => [page]);
    return scope === "covers"
      ? [coverSheet(book)]
      : scope === "interior"
        ? interior
        : [coverSheet(book), ...interior];
  }
  const covers = [coverSheet(book)];
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
function coverSheet(book) {
  const sheet = [book.pages.at(-1), book.pages[0]];
  sheet.cover = true;
  return sheet;
}
