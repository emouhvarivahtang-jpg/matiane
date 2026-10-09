import pdfLibUrl from "pdf-lib/dist/pdf-lib.min.js?url";
import fontkitUrl from "@pdf-lib/fontkit/dist/fontkit.umd.min.js?url";
import { slots, captionBox, imageRect, textColor } from "./model";
import { fitCaption } from "./text";
import { fontName, fontAssets, fallbackFontName, isGeorgian } from "./fonts";
import { pdfSheets } from "./pdf-layout";
import { sheetGeometry, bookFormat, spineTextBox } from "./format";
import { pdfImagePlan, preparePdfImage } from "./pdf-images";
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
    concatTransformationMatrix,
    setTextRenderingMode,
    setLineWidth,
    setStrokingRgbColor,
  } = pdfLib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(book.title);
  doc.setAuthor("Matiane");
  const format = bookFormat(book);
  doc.setSubject(
    `${format.w} × ${format.h} mm photo book • ${layout} • RGB • separate full cover with spine`,
  );
  const sheets = pdfSheets(book, { scope, layout });
  const sources = sheets.flat();
  const textSources = [
    ...sources,
    ...(sheets.some((sheet) => sheet.cover) && book.cover.spineWidth > 0
      ? [book.cover.spine]
      : []),
  ];
  const names = [
    ...new Set(
      textSources
        .filter((p) => p.caption.trim())
        .flatMap((p) => fontAssets(p.font, p.bold, p.italic, p.georgianFont)),
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
      primary = fontName(
        source.font,
        source.bold,
        georgian,
        source.italic,
        source.georgianFont,
      ),
      fallback = fallbackFontName(source.font, source.bold, georgian);
    const name = fontData.get(primary).characters.has(char.codePointAt(0))
      ? primary
      : fallback;
    if (!fontData.get(name).characters.has(char.codePointAt(0)))
      throw new Error("Unsupported text character");
    return name;
  };
  const usedNames = new Set(
    textSources
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
  function drawCaption(page, source, box, offsetX, offsetY, height) {
    if (!source.caption.trim()) return;
    const fontFor = (char) => fonts.get(nameFor(source, char));
    const { size, lines } = fitCaption(
      source.caption,
      source.fontSize,
      (char, size) => fontFor(char).widthOfTextAtSize(char, size),
      box,
    );
    const ink = color(textColor(source), rgb),
      textWidth = mm(box.w);
    if (source.layout === "full")
      page.drawRectangle({
        x: mm(box.x + offsetX - 4),
        y: height - mm(box.y + offsetY + box.h + 2),
        width: mm(box.w + 8),
        height: mm(box.h + 4),
        color: rgb(0, 0, 0),
        opacity: 0.35,
      });
    let baseline = height - mm(box.y + offsetY) - size;
    for (const line of lines) {
      const lineWidth = [...line].reduce(
        (sum, char) => sum + fontFor(char).widthOfTextAtSize(char, size),
        0,
      );
      let x =
        mm(box.x + offsetX) +
        (source.align === "center"
          ? (textWidth - lineWidth) / 2
          : source.align === "right"
            ? textWidth - lineWidth
            : 0);
      const startX = x;
      let run = "",
        name = null;
      const drawRun = () => {
        if (!run) return;
        const font = fonts.get(name);
        const synthesizedBold =
          source.bold &&
          name ===
            fontName(
              source.font,
              false,
              isGeorgian(run[0]),
              source.italic,
              source.georgianFont,
            );
        page.pushOperators(pushGraphicsState());
        if (synthesizedBold)
          page.pushOperators(
            setTextRenderingMode(2),
            setLineWidth(size * 0.025),
            setStrokingRgbColor(ink.red, ink.green, ink.blue),
          );
        page.drawText(run, {
          x,
          y: baseline,
          size,
          font,
          color: ink,
          ySkew:
            source.italic && !name.includes("Italic")
              ? degrees(12)
              : degrees(0),
        });
        page.pushOperators(popGraphicsState());
        x += font.widthOfTextAtSize(run, size);
      };
      for (const char of line) {
        const next = nameFor(source, char);
        if (name && next !== name) {
          drawRun();
          run = "";
        }
        name = next;
        run += char;
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
  let completed = 0;
  for (const sheet of sheets) {
    const geometry = sheetGeometry(book, sheet, bleed),
      height = mm(geometry.h),
      width = mm(geometry.w);
    const page = doc.addPage([width, height]);
    page.setTrimBox(
      mm(geometry.b),
      mm(geometry.b),
      mm(geometry.trimW),
      mm(geometry.trimH),
    );
    page.setBleedBox(0, 0, width, height);
    if (sheet.cover)
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: color(book.cover.spine.color, rgb),
      });
    for (const panel of geometry.panels) {
      const { source, size, x: offsetX, y: offsetY, full } = panel;
      page.drawRectangle({
        x: mm(offsetX + full.x),
        y: 0,
        width: mm(full.w),
        height,
        color: color(source.color, rgb),
      });
      for (const [i, originalSlot] of slots(source.layout, size).entries()) {
        const photo = book.photos.find((p) => p.id === source.photos[i]);
        if (!photo) continue;
        if (!imageCache.has(photo.src)) {
          const plan = imagePlan.get(photo.src),
            prepared = await preparePdfImage(await bytes(photo.src), plan),
            data = prepared.data;
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
        const { image, area } = imageCache.get(photo.src),
          slot = source.layout === "full" ? full : originalSlot;
        const x = mm(slot.x + offsetX),
          y = height - mm(slot.y + offsetY + slot.h),
          w = mm(slot.w),
          h = mm(slot.h);
        const rect = imageRect(photo, slot, source.crops[i]);
        page.pushOperators(
          pushGraphicsState(),
          rectangle(x, y, w, h),
          clip(),
          endPath(),
        );
        page.drawImage(image, {
          x: mm(slot.x + offsetX + rect.x + area.x * rect.w),
          y:
            height - mm(slot.y + offsetY + rect.y + (area.y + area.h) * rect.h),
          width: mm(area.w * rect.w),
          height: mm(area.h * rect.h),
        });
        page.pushOperators(popGraphicsState());
      }
      drawCaption(
        page,
        source,
        captionBox(source, size),
        offsetX,
        offsetY,
        height,
      );
      onProgress(++completed / sources.length);
    }
    if (geometry.spine?.w > 0) {
      const spine = geometry.spine,
        box = spineTextBox(book);
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(
          0,
          1,
          -1,
          0,
          mm(spine.x + box.inset),
          height - mm(spine.y + spine.h - 10),
        ),
      );
      drawCaption(
        page,
        book.cover.spine,
        { x: 0, y: 0, w: box.w, h: box.h },
        0,
        0,
        0,
      );
      page.pushOperators(popGraphicsState());
    }
  }
  return doc.save();
}
