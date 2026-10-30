// Public, user-supplied book prices in Georgian lari. The studio is independent.
export const BOOK_PRICES = Object.freeze({
  soft: Object.freeze({ 40: 80, 60: 110, 80: 150 }),
  hard: Object.freeze({ 40: 100, 60: 140, 80: 190 }),
});
export const BOOK_PAGE_OPTIONS = [40, 60, 80];

export function bookPrice(cover, pages) {
  const price = BOOK_PRICES[cover]?.[pages];
  if (price === undefined) throw new RangeError("Unsupported book option");
  return price;
}
