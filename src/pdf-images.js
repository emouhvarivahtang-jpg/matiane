import { slots, imageRect } from "./model";
import { sheetGeometry } from "./format";

export function pdfPhotoSlot(source, original, leaf, count, bleed) {
  const b = bleed ? 3 : 0;
  if (source.layout !== "full") return original;
  const left = leaf === 0 ? b : 0,
    right = leaf === count - 1 ? b : 0;
  return {
    x: left ? -left : 0,
    y: b ? -b : 0,
    w: 148 + left + right,
    h: 210 + b * 2,
  };
}

// Keep one image per source, at the resolution required by its most demanding
// placement. Include bleed and zoom; never enlarge low-resolution photographs.
export function pdfImagePlan(
  book,
  sheets,
  { bleed = true, quality = "source" } = {},
) {
  if (!["source", "print300"].includes(quality))
    throw new Error("Invalid image quality");
  const photos = new Map(book.photos.map((photo) => [photo.id, photo]));
  const images = new Map();
  for (const sheet of sheets)
    for (const panel of sheetGeometry(book, sheet, bleed).panels) {
      const page = panel.source;
      for (const [index, original] of slots(
        page.layout,
        panel.size,
      ).entries()) {
        const photo = photos.get(page.photos[index]);
        if (!photo) continue;
        const slot = page.layout === "full" ? panel.full : original;
        const rect = imageRect(photo, slot, page.crops[index]);
        const ratio =
          quality === "source" ? 1 : Math.min(1, (300 * rect.scale) / 25.4);
        const visible = {
          x: Math.max(0, -rect.x / rect.scale),
          y: Math.max(0, -rect.y / rect.scale),
          right: Math.min(photo.width, (slot.w - rect.x) / rect.scale),
          bottom: Math.min(photo.height, (slot.h - rect.y) / rect.scale),
        };
        const previous = images.get(photo.src);
        const scale = previous
          ? previous.photo.width === photo.width &&
            previous.photo.height === photo.height
            ? Math.max(previous.ratio, ratio)
            : 1
          : ratio;
        const area = previous
          ? {
              x: Math.min(previous.area.x, visible.x),
              y: Math.min(previous.area.y, visible.y),
              right: Math.max(previous.area.right, visible.right),
              bottom: Math.max(previous.area.bottom, visible.bottom),
            }
          : visible;
        images.set(photo.src, { photo, ratio: scale, area });
      }
    }
  return images;
}

export async function preparePdfImage(original, { photo, ratio, area }) {
  const unchanged = {
    data: original,
    area: { x: 0, y: 0, w: photo.width, h: photo.height },
  };
  // Avoid a lossy encode for a negligible reduction, and for photos already
  // below the requested print resolution. The source mode always keeps bytes.
  if (ratio >= 0.99) return unchanged;
  const png = original[0] === 137;
  const bitmap = await createImageBitmap(new Blob([original]), {
    imageOrientation: "from-image",
  });
  const canvas = document.createElement("canvas");
  try {
    if (bitmap.width !== photo.width || bitmap.height !== photo.height)
      return unchanged;
    // Retain a small sampling margin beyond the visible area. Multiple crops of
    // the same photo use their union, preserving every frame while embedding once.
    const pad = Math.ceil(3 / ratio);
    const x = Math.max(0, Math.floor(area.x) - pad),
      y = Math.max(0, Math.floor(area.y) - pad),
      right = Math.min(photo.width, Math.ceil(area.right) + pad),
      bottom = Math.min(photo.height, Math.ceil(area.bottom) + pad);
    const crop = { x, y, w: right - x, h: bottom - y };
    canvas.width = Math.min(crop.w, Math.ceil(crop.w * ratio));
    canvas.height = Math.min(crop.h, Math.ceil(crop.h * ratio));
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Image unavailable")),
        png ? "image/png" : "image/jpeg",
        0.95,
      ),
    );
    const smaller = new Uint8Array(await blob.arrayBuffer());
    return smaller.length < original.length
      ? { data: smaller, area: crop }
      : unchanged;
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
