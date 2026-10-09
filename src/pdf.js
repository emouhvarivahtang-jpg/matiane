import pdfLibUrl from "pdf-lib/dist/pdf-lib.min.js?url";
import fontkitUrl from "@pdf-lib/fontkit/dist/fontkit.umd.min.js?url";
import { slots, captionBox, imageRect, textColor } from "./model";
import { fitCaption } from "./text";
import { fontName, fontAssets, fallbackFontName, isGeorgian } from "./fonts";
import { pdfSheets } from "./pdf-layout";
import { pdfImagePlan, pdfPhotoSlot, preparePdfImage } from "./pdf-images";
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
  { bleed = true, scope = "all", layout = "pages", quality = "source" } = {},
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
  doc.setSubject(
    layout === "spreads"
      ? "A5 photo book • reader spreads • RGB • no imposition or spine"
      : "A5 photo book • individual pages • 148 × 210 mm • RGB",
  );
  const sheets = pdfSheets(book, { scope, layout });
  const sources = sheets.flat();
  const names = [
    ...new Set(
      sources
        .filter((p) => p.caption.trim())
        .flatMap((p) => fontAssets(p.font, p.bold)),
    ),
  ];
  const fontData = new Map(
    await Promise.all(
      names.map(async (name) => {
        const data = await bytes(`/fonts/${name}.ttf`);
        const face = fontkit.create(data);
        return [name, { data, characters: new Set(face.characterSet) }];
      }),
    ),
  );
  const nameFor = (source, char) => {
    const georgian = isGeorgian(char),
      primary = fontName(source.font, source.bold, georgian),
      fallback = fallbackFontName(source.font, source.bold, georgian);
    const name = fontData.get(primary).characters.has(char.codePointAt(0))
      ? primary
      : fallback;
    if (!fontData.get(name).characters.has(char.codePointAt(0)))
      throw new Error("Unsupported text character");
    return name;
  };
  const usedNames = new Set(
    sources
      .filter((source) => source.caption.trim())
      .flatMap((source) =>
        [...source.caption]
          .filter((char) => char !== "\n")
          .map((char) => nameFor(source, char)),
      ),
  );
  const fonts = new Map(
    await Promise.all(
      [...usedNames].map(async (name) => [
        name,
        await doc.embedFont(fontData.get(name).data, { subset: true }),
      ]),
    ),
  );
  const imagePlan = pdfImagePlan(book, sheets, { bleed, quality });
  const imageCache = new Map();
  const b = bleed ? 3 : 0,
    height = mm(210 + b * 2);
  let completed = 0;
  for (const sheet of sheets) {
    const width = mm(148 * sheet.length + b * 2);
    const page = doc.addPage([width, height]);
    page.setTrimBox(mm(b), mm(b), mm(148 * sheet.length), mm(210));
    page.setBleedBox(0, 0, width, height);
    for (const [leaf, source] of sheet.entries()) {
      const offset = 148 * leaf + b,
        leftBleed = leaf === 0 ? b : 0,
        rightBleed = leaf === sheet.length - 1 ? b : 0;
      page.drawRectangle({
        x: mm(offset - leftBleed),
        y: 0,
        width: mm(148 + leftBleed + rightBleed),
        height,
        color: color(source.color, rgb),
      });
      for (const [i, originalSlot] of slots(source.layout).entries()) {
        const photo = book.photos.find((p) => p.id === source.photos[i]);
        if (!photo) continue;
        if (!imageCache.has(photo.src)) {
          const plan = imagePlan.get(photo.src);
          const prepared = await preparePdfImage(await bytes(photo.src), plan);
          const data = prepared.data;
          imageCache.set(photo.src, {
            area: {
              x: prepared.area.x / plan.photo.width,
              y: prepared.area.y / plan.photo.height,
              w: prepared.area.w / plan.photo.width,
              h: prepared.area.h / plan.photo.height,
            },
            image:
              data[0] === 137
                ? await doc.embedPng(data)
                : await doc.embedJpg(data),
          });
        }
        const { image, area } = imageCache.get(photo.src);
        const slot = pdfPhotoSlot(
          source,
          originalSlot,
          leaf,
          sheet.length,
          bleed,
        );
        const x = mm(slot.x + offset),
          y = height - mm(slot.y + b + slot.h),
          w = mm(slot.w),
          h = mm(slot.h);
        const drawingSlot = slot;
        const rect = imageRect(photo, drawingSlot, source.crops[i]);
        const imageWidth = mm(area.w * rect.w),
          imageHeight = mm(area.h * rect.h);
        page.pushOperators(
          pushGraphicsState(),
          rectangle(x, y, w, h),
          clip(),
          endPath(),
        );
        page.drawImage(image, {
          x: mm(drawingSlot.x + offset + rect.x + area.x * rect.w),
          y:
            height -
            mm(drawingSlot.y + b + rect.y + (area.y + area.h) * rect.h),
          width: imageWidth,
          height: imageHeight,
        });
        page.pushOperators(popGraphicsState());
      }
      if (source.caption.trim()) {
        const fontFor = (char) => fonts.get(nameFor(source, char));
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
            x: mm(box.x + offset - 4),
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
            mm(box.x + offset) +
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
      onProgress(++completed / sources.length);
    }
  }
  return doc.save();
}
