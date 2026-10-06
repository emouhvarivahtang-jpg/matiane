import { it, expect } from 'vitest';
import { fitCaption, wrapText } from './text';
const measure = (char, size) => size * .5;
it('preserves explicit paragraphs and wraps words', () => {
  expect(wrapText('one two\nthree', 35, 10, measure)).toEqual(['one two', 'three']);
  expect(wrapText('one two three', 35, 10, measure)).toEqual(['one two', 'three']);
});
it('fits a long caption and an extreme multiline caption inside the caption area', () => {
  for (const caption of ['მოგონებები '.repeat(30), 'a\n'.repeat(150)]) {
    const result = fitCaption(caption, 22, measure);
    expect(result.lines.length * result.size * 1.45).toBeLessThanOrEqual(24 * 72 / 25.4);
    expect(result.size).toBeLessThan(22);
  }
});
