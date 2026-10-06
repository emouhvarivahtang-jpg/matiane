export const uid = () => crypto.randomUUID();
export const COLORS = ['#FAF8F3', '#FFFFFF', '#EBDCCD', '#E5E9DF', '#DCE6E9', '#E8D5D3', '#34443C', '#292A28'];
export const LAYOUTS = ['editorial', 'full', 'pair', 'diptych', 'grid', 'gallery'];
export const CAPACITY = { editorial: 1, full: 1, pair: 2, diptych: 2, grid: 4, gallery: 1 };
export const newPage = (photoId = null) => ({ id: uid(), layout: 'editorial', color: COLORS[0], photos: [photoId], caption: '', font: 'serif', fontSize: 14, align: 'center', focus: { x: 50, y: 50 } });
export const newBook = () => ({ version: 1, title: 'Somewhere, together', photos: [], pages: [newPage()], language: 'en' });
export function demoBook() {
  const book = newBook();
  book.photos = ['mountains', 'lake', 'coast', 'forest', 'road', 'sea'].map((name, i) => ({ id: 'demo-' + i, name: `Italy · ${i + 1}`, src: `/photos/${name}.jpg`, width: 640, height: 480, demo: true }));
  const captions = ['The places we carry with us.', 'A little further. A little slower.', 'Days made of sunlight.', '', '', 'Until the next adventure.'];
  book.pages = book.photos.map((p, i) => ({ ...newPage(p.id), caption: captions[i], layout: ['editorial', 'full', 'pair', 'gallery', 'grid', 'editorial'][i], photos: i === 2 ? [p.id, book.photos[3].id] : i === 4 ? book.photos.slice(0, 4).map(p => p.id) : [p.id] }));
  return book;
}
// Shared millimetre geometry: the editor and PDF use the same photo rectangles.
export function slots(layout) {
  switch (layout) {
    case 'full': return [{ x: 0, y: 0, w: 148, h: 210 }];
    case 'pair': return [{ x: 12, y: 14, w: 124, h: 76 }, { x: 12, y: 95, w: 124, h: 76 }];
    case 'diptych': return [{ x: 10, y: 22, w: 62, h: 145 }, { x: 76, y: 22, w: 62, h: 145 }];
    case 'grid': return [{ x: 12, y: 22, w: 60, h: 72 }, { x: 76, y: 22, w: 60, h: 72 }, { x: 12, y: 98, w: 60, h: 72 }, { x: 76, y: 98, w: 60, h: 72 }];
    case 'gallery': return [{ x: 24, y: 36, w: 100, h: 120 }];
    default: return [{ x: 12, y: 14, w: 124, h: 153 }];
  }
}
export const captionBox = () => ({ x: 12, y: 176, w: 124, h: 24 });
export function darkColor(hex) { return parseInt(hex.slice(1, 3), 16) * .299 + parseInt(hex.slice(3, 5), 16) * .587 + parseInt(hex.slice(5, 7), 16) * .114 < 130; }
export function effectiveDpi(photo, slot) { return Math.min(photo.width / (slot.w / 25.4), photo.height / (slot.h / 25.4)); }
export function issues(book) {
  const result = [];
  book.pages.forEach((page, index) => slots(page.layout).forEach((slot, i) => {
    const photo = book.photos.find(p => p.id === page.photos[i]);
    if (!photo) result.push({ page: index + 1, type: 'empty' });
    else if (effectiveDpi(photo, slot) < 150) result.push({ page: index + 1, type: 'resolution', dpi: Math.round(effectiveDpi(photo, slot)) });
  }));
  return result;
}
export function validateBook(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > 80 || !Array.isArray(value.photos) || value.photos.length > 200 || typeof value.title !== 'string' || value.title.length > 100) throw new Error('Invalid project');
  const ids = new Set();
  for (const p of value.photos) {
    if (!p || typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string' || p.name.length > 500 || !Number.isFinite(p.width) || !Number.isFinite(p.height) || p.width <= 0 || p.height <= 0 || typeof p.src !== 'string' || !(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(p.src) || /^\/photos\/(mountains|lake|coast|forest|road|sea)\.jpg$/.test(p.src))) throw new Error('Invalid photo');
    ids.add(p.id);
  }
  const pageIds = new Set();
  for (const p of value.pages) {
    if (!p || typeof p.id !== 'string' || pageIds.has(p.id) || !LAYOUTS.includes(p.layout) || !/^#[0-9a-fA-F]{6}$/.test(p.color) || !Array.isArray(p.photos) || p.photos.length > 4 || p.photos.some(id => id !== null && !ids.has(id)) || typeof p.caption !== 'string' || p.caption.length > 300 || !['serif', 'sans'].includes(p.font) || !Number.isFinite(p.fontSize) || p.fontSize < 8 || p.fontSize > 22 || !['left', 'center', 'right'].includes(p.align) || !p.focus || [p.focus.x, p.focus.y].some(v => !Number.isFinite(v) || v < 0 || v > 100)) throw new Error('Invalid page');
    pageIds.add(p.id);
  }
  return { ...value, language: value.language === 'ka' ? 'ka' : 'en' };
}
export async function readPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('format');
  if (file.size > 30 * 1024 * 1024) throw new Error('size');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 5000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return { id: uid(), name: file.name, src: canvas.toDataURL('image/jpeg', .95), width: canvas.width, height: canvas.height };
}
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('matiane', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function loadBook() {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('projects').objectStore('projects').get('current');
    request.onsuccess = () => resolve(request.result ? validateBook(request.result) : null); request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function saveBook(book) {
  const db = await database();
  try { await new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(book, 'current');
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
