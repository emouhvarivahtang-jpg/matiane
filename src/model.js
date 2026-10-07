export const uid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((v) => v.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};
export const PAGE_COUNTS = [40, 60, 80];
export const COLORS = [
  "#FAF8F3",
  "#FFFFFF",
  "#EBDCCD",
  "#E5E9DF",
  "#DCE6E9",
  "#E8D5D3",
  "#34443C",
  "#292A28",
];
export const LAYOUTS = [
  "editorial",
  "full",
  "pair",
  "diptych",
  "grid",
  "gallery",
  "text",
];
export const CAPACITY = {
  editorial: 1,
  full: 1,
  pair: 2,
  diptych: 2,
  grid: 4,
  gallery: 1,
  text: 0,
};
export const FONTS = ["serif", "sans", "compact"];
export const defaultCrop = () => ({ x: 50, y: 50, zoom: 1 });
export const newCrop = defaultCrop;
export const newPage = (photoId = null, kind = "page") => ({
  id: uid(),
  kind,
  layout: "editorial",
  color: COLORS[0],
  photos: [photoId],
  crops: [defaultCrop()],
  caption: "",
  font: "serif",
  fontSize: kind === "front" ? 26 : 14,
  align: "center",
  textColor: null,
  bold: false,
  italic: false,
  underline: false,
});
export function newBook(
  pageCount = 40,
  title = "Untitled memories",
  language = "en",
) {
  if (!PAGE_COUNTS.includes(pageCount)) throw new Error("Invalid page count");
  const front = { ...newPage(null, "front"), caption: title };
  const back = {
    ...newPage(null, "back"),
    layout: "text",
    photos: [],
    crops: [],
  };
  return {
    id: uid(),
    version: 2,
    title,
    pageCount,
    photos: [],
    pages: [front, ...Array.from({ length: pageCount }, () => newPage()), back],
    language,
  };
}
export function demoBook(language = "en") {
  const book = newBook(40, "Somewhere, together", language);
  book.photos = ["mountains", "lake", "coast", "forest", "road", "sea"].map(
    (name, i) => ({
      id: "demo-" + i,
      name: "Italy · " + (i + 1),
      src: "/photos/" + name + ".jpg",
      width: 640,
      height: 480,
      demo: true,
    }),
  );
  const captions = [
    "The places we carry with us.",
    "A little further. A little slower.",
    "Days made of sunlight.",
    "",
    "",
    "Until the next adventure.",
  ];
  book.pages.splice(
    1,
    6,
    ...book.photos.map((p, i) => ({
      ...newPage(p.id),
      caption: captions[i],
      layout: ["editorial", "full", "pair", "gallery", "grid", "editorial"][i],
      photos:
        i === 2
          ? [p.id, book.photos[3].id]
          : i === 4
            ? book.photos.slice(0, 4).map((p) => p.id)
            : [p.id],
      crops: Array.from({ length: i === 2 ? 2 : i === 4 ? 4 : 1 }, defaultCrop),
    })),
  );
  book.pages[0].photos = [book.photos[0].id];
  return book;
}
export function slots(layout) {
  switch (layout) {
    case "full":
      return [{ x: 0, y: 0, w: 148, h: 210 }];
    case "pair":
      return [
        { x: 12, y: 14, w: 124, h: 76 },
        { x: 12, y: 95, w: 124, h: 76 },
      ];
    case "diptych":
      return [
        { x: 10, y: 22, w: 62, h: 145 },
        { x: 76, y: 22, w: 62, h: 145 },
      ];
    case "grid":
      return [
        { x: 12, y: 22, w: 60, h: 72 },
        { x: 76, y: 22, w: 60, h: 72 },
        { x: 12, y: 98, w: 60, h: 72 },
        { x: 76, y: 98, w: 60, h: 72 },
      ];
    case "gallery":
      return [{ x: 24, y: 36, w: 100, h: 120 }];
    case "text":
      return [];
    default:
      return [{ x: 12, y: 14, w: 124, h: 153 }];
  }
}
export const captionBox = (page) =>
  page?.layout === "text"
    ? { x: 15, y: 60, w: 118, h: 90 }
    : { x: 12, y: 176, w: 124, h: 24 };
export function darkColor(hex) {
  return (
    parseInt(hex.slice(1, 3), 16) * 0.299 +
      parseInt(hex.slice(3, 5), 16) * 0.587 +
      parseInt(hex.slice(5, 7), 16) * 0.114 <
    130
  );
}
export const textColor = (page) =>
  page.textColor ||
  (page.layout === "full" || darkColor(page.color) ? "#FFFFFF" : "#30332D");
// Millimetre geometry shared by canvas, DPI warnings and PDF. x/y anchor the
// image within the frame; contain mode leaves the selected paper color visible.
export function imageRect(photo, slot, crop = defaultCrop()) {
  const cover = Math.max(slot.w / photo.width, slot.h / photo.height);
  const contain = Math.min(slot.w / photo.width, slot.h / photo.height);
  const zoom = Math.max(contain / cover, Math.min(5, crop.zoom));
  const w = photo.width * cover * zoom,
    h = photo.height * cover * zoom;
  return {
    x: ((slot.w - w) * crop.x) / 100,
    y: ((slot.h - h) * crop.y) / 100,
    w,
    h,
    zoom,
    minZoom: contain / cover,
    scale: cover * zoom,
  };
}
export const effectiveDpi = (photo, slot, crop) =>
  25.4 / imageRect(photo, slot, crop).scale;
export function issues(book, selection = "all") {
  const result = [];
  book.pages.forEach((page, index) => {
    if (
      (selection === "interior" && page.kind !== "page") ||
      (selection === "covers" && page.kind === "page")
    )
      return;
    slots(page.layout).forEach((slot, i) => {
      const photo = book.photos.find((p) => p.id === page.photos[i]);
      if (!photo) result.push({ page: index, type: "empty" });
      else {
        const dpi = effectiveDpi(photo, slot, page.crops[i]);
        if (dpi < 300)
          result.push({
            page: index,
            type: "resolution",
            dpi: Math.round(dpi),
          });
      }
    });
  });
  return result;
}
export const pageLabel = (page, index, t) =>
  page.kind === "front"
    ? t.frontCover
    : page.kind === "back"
      ? t.backCover
      : t.page + " " + index;
export function spreads(book) {
  const result = [
    [book.pages.length - 1, 0],
    [null, 1],
  ];
  for (let i = 2; i <= book.pageCount; i += 2)
    result.push([i, i + 1 <= book.pageCount ? i + 1 : null]);
  return result;
}
export function resizeBook(book, pageCount) {
  if (!PAGE_COUNTS.includes(pageCount)) throw new Error("Invalid page count");
  const interior = book.pages.slice(1, -1).slice(0, pageCount);
  while (interior.length < pageCount) interior.push(newPage());
  return {
    ...book,
    pageCount,
    pages: [book.pages[0], ...interior, book.pages.at(-1)],
  };
}
export function reorderPage(book, from, to) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    to < 1 ||
    from > book.pageCount ||
    to > book.pageCount
  )
    return book;
  const pages = [...book.pages];
  const [page] = pages.splice(from, 1);
  pages.splice(to, 0, page);
  return { ...book, pages };
}
export function forkBook(book, title = book.title) {
  const photoIds = new Map(book.photos.map((p) => [p.id, uid()]));
  return {
    ...structuredClone(book),
    id: uid(),
    title: title.slice(0, 100),
    photos: book.photos.map((p) => ({ ...p, id: photoIds.get(p.id) })),
    pages: book.pages.map((p) => ({
      ...structuredClone(p),
      id: uid(),
      photos: p.photos.map((id) => (id ? photoIds.get(id) : null)),
    })),
  };
}
const hex = (value) => /^#[0-9a-fA-F]{6}$/.test(value);
const idString = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 100;
export function validateBook(value, { allowCloud = false } = {}) {
  if (value?.version === 1) {
    if (
      typeof value.title !== "string" ||
      !Array.isArray(value.pages) ||
      value.pages.length < 1 ||
      value.pages.length > 80
    )
      throw new Error("Invalid legacy project");
    const count = PAGE_COUNTS.find((n) => n >= value.pages.length);
    const migrated = newBook(count, value.title, value.language);
    migrated.photos = value.photos;
    migrated.pages.splice(
      1,
      value.pages.length,
      ...value.pages.map((p) => ({
        ...newPage(),
        ...p,
        kind: "page",
        photos: Array.from(
          { length: CAPACITY[p.layout] ?? 1 },
          (_, i) => p.photos?.[i] || null,
        ),
        crops: Array.from({ length: CAPACITY[p.layout] ?? 1 }, () => ({
          ...defaultCrop(),
          ...p.focus,
        })),
      })),
    );
    return validateBook(migrated, { allowCloud });
  }
  if (
    !value ||
    value.version !== 2 ||
    !idString(value.id) ||
    !PAGE_COUNTS.includes(value.pageCount) ||
    !Array.isArray(value.pages) ||
    value.pages.length !== value.pageCount + 2 ||
    !Array.isArray(value.photos) ||
    value.photos.length > 200 ||
    typeof value.title !== "string" ||
    value.title.length > 100
  )
    throw new Error("Invalid project");
  const ids = new Set();
  const photos = value.photos.map((p) => {
    const validSource =
      typeof p?.src === "string" &&
      (/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(p.src) ||
        /^\/photos\/(mountains|lake|coast|forest|road|sea)\.jpg$/.test(p.src) ||
        (allowCloud && /^\/api\/photos\/[a-f0-9]{64}$/.test(p.src)));
    if (
      !p ||
      !idString(p.id) ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      p.name.length > 500 ||
      !Number.isInteger(p.width) ||
      !Number.isInteger(p.height) ||
      p.width < 1 ||
      p.height < 1 ||
      p.width > 5000 ||
      p.height > 5000 ||
      !validSource
    )
      throw new Error("Invalid photo");
    ids.add(p.id);
    return {
      id: p.id,
      name: p.name,
      src: p.src,
      width: p.width,
      height: p.height,
      demo: !!p.demo,
      ...(typeof p.thumbnail === "string" &&
      p.thumbnail.length < 200000 &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.thumbnail)
        ? { thumbnail: p.thumbnail }
        : {}),
    };
  });
  const pageIds = new Set();
  const pages = value.pages.map((p, index) => {
    const kind =
      index === 0
        ? "front"
        : index === value.pages.length - 1
          ? "back"
          : "page";
    if (
      !p ||
      !idString(p.id) ||
      pageIds.has(p.id) ||
      p.kind !== kind ||
      !LAYOUTS.includes(p.layout) ||
      !hex(p.color) ||
      !Array.isArray(p.photos) ||
      p.photos.length !== CAPACITY[p.layout] ||
      p.photos.some((id) => id !== null && !ids.has(id)) ||
      typeof p.caption !== "string" ||
      p.caption.length > 1000 ||
      !FONTS.includes(p.font) ||
      !Number.isFinite(p.fontSize) ||
      p.fontSize < 8 ||
      p.fontSize > 44 ||
      !["left", "center", "right"].includes(p.align) ||
      (p.textColor !== null && !hex(p.textColor)) ||
      ["bold", "italic", "underline"].some((k) => typeof p[k] !== "boolean") ||
      !Array.isArray(p.crops) ||
      p.crops.length !== p.photos.length ||
      p.crops.some(
        (c) =>
          !c ||
          [c.x, c.y].some((v) => !Number.isFinite(v) || v < 0 || v > 100) ||
          !Number.isFinite(c.zoom) ||
          c.zoom <= 0 ||
          c.zoom > 5,
      )
    )
      throw new Error("Invalid page");
    pageIds.add(p.id);
    return {
      id: p.id,
      kind,
      layout: p.layout,
      color: p.color,
      photos: p.photos,
      crops: p.crops.map((c) => ({ x: c.x, y: c.y, zoom: c.zoom })),
      caption: p.caption,
      font: p.font,
      fontSize: p.fontSize,
      align: p.align,
      textColor: p.textColor,
      bold: p.bold,
      italic: p.italic,
      underline: p.underline,
    };
  });
  return {
    id: value.id,
    version: 2,
    title: value.title,
    pageCount: value.pageCount,
    photos,
    pages,
    language: ["en", "ka", "ru"].includes(value.language)
      ? value.language
      : "en",
  };
}
export async function readPhoto(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error("size");
  let source = file;
  if (
    /\.(heic|heif)$/i.test(file.name) ||
    /image\/(heic|heif)/i.test(file.type)
  ) {
    const { heicTo } = await import("heic-to/csp");
    source = await heicTo({ blob: file, type: "image/jpeg", quality: 0.95 });
  } else if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("format");
  const bitmap = await createImageBitmap(source, {
    imageOrientation: "from-image",
  });
  try {
    const scale = Math.min(1, 5000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const thumb = document.createElement("canvas"),
      ratio = Math.min(1, 320 / Math.max(canvas.width, canvas.height));
    thumb.width = Math.max(1, Math.round(canvas.width * ratio));
    thumb.height = Math.max(1, Math.round(canvas.height * ratio));
    thumb.getContext("2d").drawImage(canvas, 0, 0, thumb.width, thumb.height);
    return {
      id: uid(),
      name: file.name,
      thumbnail: thumb.toDataURL("image/jpeg", 0.78),
      src: canvas.toDataURL("image/jpeg", 0.95),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}
export async function portableBook(book) {
  const photos = await Promise.all(
    book.photos.map(async (p) => {
      if (p.src.startsWith("data:")) return p;
      const response = await fetch(p.src);
      if (!response.ok) throw new Error("photo");
      const blob = await response.blob();
      const src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { ...p, src };
    }),
  );
  return { ...book, photos };
}
export function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("matiane", 2);
    request.onupgradeneeded = () => {
      for (const name of ["projects", "books", "photos"])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const knownPhotos = new Map();
function transaction(db, stores, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const result = action(tx);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function localSaveBook(book, owner = "guest", cloud = null) {
  const db = await database();
  const changed = book.photos.filter(
    (p) => knownPhotos.get(owner + ":" + p.id) !== p.src,
  );
  try {
    await transaction(db, ["books", "photos"], "readwrite", (tx) => {
      for (const photo of changed)
        tx.objectStore("photos").put(photo, owner + ":" + photo.id);
      tx.objectStore("books").put(
        {
          id: book.id,
          owner,
          cloud,
          updatedAt: new Date().toISOString(),
          book: {
            ...book,
            photos: book.photos.map(({ thumbnail, ...p }) => ({
              ...p,
              src: "local:" + p.id,
            })),
          },
        },
        owner + ":" + book.id,
      );
    });
    for (const photo of changed)
      knownPhotos.set(owner + ":" + photo.id, photo.src);
  } finally {
    db.close();
  }
}
export async function localListBooks(owner = "guest") {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["books", "photos"]),
        req = tx.objectStore("books").getAll();
      req.onsuccess = () => {
        const records = req.result
          .filter((r) => r.owner === owner)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        let pending = records.length;
        if (!pending) return resolve(records);
        for (const record of records) {
          const photoId =
            record.book.pages[0].photos.find(Boolean) ||
            record.book.pages.flatMap((p) => p.photos).find(Boolean);
          if (!photoId) {
            if (--pending === 0) resolve(records);
            continue;
          }
          const photo = tx.objectStore("photos").get(owner + ":" + photoId);
          photo.onerror = () => reject(photo.error);
          photo.onsuccess = () => {
            const p = photo.result;
            record.cover =
              p?.thumbnail ||
              (p?.src.startsWith("/api/photos/")
                ? p.src + "?thumbnail=1"
                : p?.src);
            if (--pending === 0) resolve(records);
          };
        }
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function localLoadBook(id, owner = "guest") {
  const db = await database();
  try {
    const tx = db.transaction(["books", "photos"]);
    return await new Promise((resolve, reject) => {
      const req = tx.objectStore("books").get(owner + ":" + id);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const record = req.result;
        if (!record) return resolve(null);
        const photos = Array(record.book.photos.length);
        let pending = photos.length;
        if (!pending)
          return resolve({
            ...record,
            book: validateBook(record.book, { allowCloud: true }),
          });
        record.book.photos.forEach((p, index) => {
          const photo = tx.objectStore("photos").get(owner + ":" + p.id);
          photo.onerror = () => reject(photo.error);
          photo.onsuccess = () => {
            if (!photo.result) return reject(new Error("Missing local photo"));
            photos[index] = photo.result;
            knownPhotos.set(owner + ":" + p.id, photo.result.src);
            if (--pending === 0)
              resolve({
                ...record,
                book: validateBook(
                  { ...record.book, photos },
                  { allowCloud: true },
                ),
              });
          };
        });
      };
    });
  } finally {
    db.close();
  }
}
export async function localDeleteBook(id, owner = "guest") {
  const db = await database();
  try {
    await transaction(db, ["books"], "readwrite", (tx) =>
      tx.objectStore("books").delete(owner + ":" + id),
    );
  } finally {
    db.close();
  }
}
export async function migrateLocalBook() {
  if ((await localListBooks()).length) return;
  const db = await database();
  let legacy;
  try {
    legacy = await new Promise((resolve, reject) => {
      const r = db
        .transaction("projects")
        .objectStore("projects")
        .get("current");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
  if (legacy) await localSaveBook(validateBook(legacy)); // Keep original v1 record intact.
}
