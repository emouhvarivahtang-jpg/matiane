import { describe, it, expect } from 'vitest';
import { newBook, demoBook, validateBook, slots, effectiveDpi, issues } from './model';
describe('project and print preflight', () => {
  it('rejects external image URLs and broken page references', () => {
    const book = demoBook();
    expect(validateBook(book).pages).toHaveLength(6);
    expect(() => validateBook({ ...book, photos: [{ ...book.photos[0], src: 'https://example.com/image.jpg' }] })).toThrow();
    expect(() => validateBook({ ...book, pages: [{ ...book.pages[0], photos: ['unknown'] }] })).toThrow();
    expect(() => validateBook({ ...book, pages: [{ ...book.pages[0], fontSize: NaN }] })).toThrow();
  });
  it('calculates resolution after cover cropping and detects empty frames', () => {
    expect(effectiveDpi({ width: 3000, height: 2000 }, { w: 100, h: 150 })).toBeCloseTo(338.67, 1);
    expect(issues(newBook())).toEqual([{ page: 1, type: 'empty' }]);
    expect(issues(demoBook()).some(w => w.type === 'resolution')).toBe(true);
  });
  it('keeps every layout inside A5 trim dimensions', () => {
    for (const layout of ['editorial', 'full', 'pair', 'diptych', 'grid', 'gallery']) {
      for (const slot of slots(layout)) { expect(slot.x).toBeGreaterThanOrEqual(0); expect(slot.y).toBeGreaterThanOrEqual(0); expect(slot.x + slot.w).toBeLessThanOrEqual(148); expect(slot.y + slot.h).toBeLessThanOrEqual(210); }
    }
  });
});
