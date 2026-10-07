import pdfLibUrl from "pdf-lib/dist/pdf-lib.min.js?url";
import fontkitUrl from "@pdf-lib/fontkit/dist/fontkit.umd.min.js?url";
import { slots, captionBox, imageRect, textColor } from "./model";
import { fitCaption, fontName } from "./text";
const libraries = new Map();
function loadLibrary(url, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!libraries.has(globalName))
    libraries.set(
      globalName,
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.onload = () => {
          if (window[globalName]) resolve(window[globalName]);
          else {
            libraries.delete(globalName);
            script.remove();
            reject(new Error("Library unavailable"));
          }
        };
        script.onerror = () => {
          libraries.delete(globalName);
          script.remove();
          reject(new Error("Library unavailable"));
        };
        document.head.append(script);
      }),
    );
  return libraries.get(globalName);
}
const mm = (n) => (n * 72) / 25.4;
const color = (hex, rgb) =>
  rgb(...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
const bytes = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset unavailable: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};
export async function exportPdf(
  book,
  { bleed = true, scope = "all" } = {},
  onProgress = () => {},
) {
  const [pdfLib, fontkit] = await Promise.all([
    loadLibrary(pdfLibUrl, "PDFLib"),
    loadLibrary(fontkitUrl, "fontkit"),
  ]);
  const {
    PDFDocument,
    rgb,
    pushGraphicsState,
    popGraphicsState,
    rectangle,
    clip,
    endPath,
    degrees,
  } = pdfLib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(book.title);
  doc.setAuthor("Matiane");
  doc.setSubject("A5 photo book • 148 × 210 mm");
  const sources =
    scope === "interior"
      ? book.pages.slice(1, -1)
      : scope === "covers"
        ? [book.pages[0], book.pages.at(-1)]
        : book.pages;
  const names = [
    ...new Set(
      sources
        .filter((p) => p.caption.trim())
        .flatMap((p) => [
          fontName(p.font, p.bold, false),
          fontName(p.font, p.bold, true),
        ]),
    ),
  ];
  const fonts = new Map(
    await Promise.all(
      names.map(async (name) => [
        name,
        await doc.embedFont(await bytes(`/fonts/${name}.ttf`), {
          subset: true,
        }),
      ]),
    ),
  );
  const imageCache = new Map();
  const b = bleed ? 3 : 0,
    width = mm(148 + b * 2),
    height = mm(210 + b * 2);
  for (const [index, source] of sources.entries()) {
    const page = doc.addPage([width, height]);
    page.setTrimBox(mm(b), mm(b), mm(148), mm(210));
    page.setBleedBox(0, 0, width, height);
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: color(source.color, rgb),
    });
    for (const [i, originalSlot] of slots(source.layout).entries()) {
      const photo = book.photos.find((p) => p.id === source.photos[i]);
      if (!photo) continue;
      if (!imageCache.has(photo.id)) {
        const data = await bytes(photo.src);
        imageCache.set(
          photo.id,
          data[0] === 137 ? await doc.embedPng(data) : await doc.embedJpg(data),
        );
      }
      const image = imageCache.get(photo.id);
      const slot =
        source.layout === "full"
          ? { x: -b, y: -b, w: 148 + b * 2, h: 210 + b * 2 }
          : originalSlot;
      const x = mm(slot.x + b),
        y = height - mm(slot.y + b + slot.h),
        w = mm(slot.w),
        h = mm(slot.h);
      const drawingSlot =
        source.layout === "full" && source.crops[i].zoom >= 1
          ? slot
          : originalSlot;
      const rect = imageRect(photo, drawingSlot, source.crops[i]);
      const imageWidth = mm(rect.w),
        imageHeight = mm(rect.h);
      page.pushOperators(
        pushGraphicsState(),
        rectangle(x, y, w, h),
        clip(),
        endPath(),
      );
      page.drawImage(image, {
        x: mm(drawingSlot.x + b + rect.x),
        y: height - mm(drawingSlot.y + b + rect.y + rect.h),
        width: imageWidth,
        height: imageHeight,
      });
      page.pushOperators(popGraphicsState());
    }
    if (source.caption.trim()) {
      const fontFor = (char) =>
        fonts.get(
          fontName(
            source.font,
            source.bold,
            /[\u10A0-\u10FF\u1C90-\u1CBF]/.test(char),
          ),
        );
      const box = captionBox(source),
        textWidth = mm(box.w);
      const { size, lines } = fitCaption(
        source.caption,
        source.fontSize,
        (char, size) => fontFor(char).widthOfTextAtSize(char, size),
        box,
      );
      const ink = color(textColor(source), rgb);
      if (source.layout === "full")
        page.drawRectangle({
          x: mm(box.x + b - 4),
          y: height - mm(box.y + b + box.h + 2),
          width: mm(box.w + 8),
          height: mm(box.h + 4),
          color: rgb(0, 0, 0),
          opacity: 0.35,
        });
      let baseline = height - mm(box.y + b) - size;
      for (const line of lines) {
        const lineWidth = [...line].reduce(
          (sum, c) => sum + fontFor(c).widthOfTextAtSize(c, size),
          0,
        );
        let x =
          mm(box.x + b) +
          (source.align === "center"
            ? (textWidth - lineWidth) / 2
            : source.align === "right"
              ? textWidth - lineWidth
              : 0);
        const startX = x;
        // Draw contiguous runs so Georgian and Latin can coexist with embedded fonts.
        let run = "",
          font = null;
        const drawRun = () => {
          if (run) {
            page.drawText(run, {
              x,
              y: baseline,
              size,
              font,
              color: ink,
              ySkew: source.italic ? degrees(12) : degrees(0),
            });
            x += font.widthOfTextAtSize(run, size);
          }
        };
        for (const c of line) {
          const next = fontFor(c);
          if (font && next !== font) {
            drawRun();
            run = "";
          }
          font = next;
          run += c;
        }
        drawRun();
        if (source.underline && lineWidth)
          page.drawLine({
            start: { x: startX, y: baseline - size * 0.15 },
            end: { x: startX + lineWidth, y: baseline - size * 0.15 },
            thickness: Math.max(0.4, size * 0.05),
            color: ink,
          });
        baseline -= size * 1.45;
      }
    }
    onProgress((index + 1) / sources.length);
  }
  return doc.save();
}
