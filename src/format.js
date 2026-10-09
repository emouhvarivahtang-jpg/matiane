export const FORMATS = {
  portrait: { w: 190, h: 240, coverW: 195, coverH: 245, label: "19 × 24 cm" },
  a5: { w: 148, h: 210, coverW: 148, coverH: 210, label: "A5 · 148 × 210 mm" },
};
export const bookFormat = (book) => FORMATS[book?.format] || FORMATS.a5;
export const pageSize = (book, page) => {
  const format = bookFormat(book);
  return page.kind === "page"
    ? { w: format.w, h: format.h }
    : { w: format.coverW, h: format.coverH };
};
export const coverSize = (book) => {
  const format = bookFormat(book),
    wrap = book.cover?.wrap || 0,
    spine = book.cover?.spineWidth || 0;
  return {
    w: format.coverW * 2 + spine + wrap * 2,
    h: format.coverH + wrap * 2,
    panelW: format.coverW,
    panelH: format.coverH,
    spine,
    wrap,
  };
};
export function sheetGeometry(book, sheet, bleed = true) {
  const b = bleed ? 3 : 0,
    f = bookFormat(book),
    cover = sheet.cover ? coverSize(book) : null;
  const size = cover ? { w: f.coverW, h: f.coverH } : pageSize(book, sheet[0]);
  const wrap = cover?.wrap || 0;
  return {
    w: (cover?.w ?? size.w * sheet.length) + b * 2,
    h: (cover?.h ?? size.h) + b * 2,
    trimW: cover?.w ?? size.w * sheet.length,
    trimH: cover?.h ?? size.h,
    b,
    panels: sheet.map((source, leaf) => {
      const left = leaf === 0 ? b + wrap : 0,
        right = leaf === sheet.length - 1 ? b + wrap : 0;
      return {
        source,
        size,
        x: b + wrap + size.w * leaf + (cover && leaf === 1 ? cover.spine : 0),
        y: b + wrap,
        full: {
          x: left ? -left : 0,
          y: -(b + wrap),
          w: size.w + left + right,
          h: size.h + (b + wrap) * 2,
        },
      };
    }),
    spine: cover
      ? { x: b + wrap + f.coverW, y: b + wrap, w: cover.spine, h: f.coverH }
      : null,
  };
}
// Use the largest single-page bleed extent for conservative on-canvas warnings.
export function fullPhotoSlot(book, page, bleed = true) {
  const size = pageSize(book, page),
    b = bleed ? 3 : 0;
  const wrap = page.kind === "page" ? 0 : book.cover?.wrap || 0;
  const left = page.kind === "front" ? 0 : b + wrap;
  const right = page.kind === "back" ? 0 : b + wrap;
  return {
    x: left ? -left : 0,
    y: -(b + wrap),
    w: size.w + left + right,
    h: size.h + (b + wrap) * 2,
  };
}
export function spineTextBox(book) {
  const cover = coverSize(book),
    inset = Math.min(1, cover.spine / 4);
  return {
    w: cover.panelH - 20,
    h: Math.max(0.1, cover.spine - inset * 2),
    inset,
  };
}
