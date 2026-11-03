// Run after Blender has rendered all 18 localized variants.
import sharp from 'sharp';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
for (const binding of ['hard', 'soft']) for (const pages of [40, 60, 80]) for (const language of ['ka', 'en', 'ru']) {
  const name = `${binding}-${pages}-${language}`;
  await sharp(`${root}/work/book-3d/${name}.png`).resize(800, 688).webp({quality: 84, alphaQuality: 90}).toFile(`${root}/public/landing/models/${name}.webp`);
}
