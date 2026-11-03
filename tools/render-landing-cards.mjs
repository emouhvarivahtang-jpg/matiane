// Start `npm run dev` first. All rendering stays local, using the Blender GLBs.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const preview = process.argv.includes('--preview');
const directory = `${root}/${preview ? 'work/book-card' : 'public/landing/models'}`;
await mkdir(directory, {recursive: true});
const browser = await chromium.launch({executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173/tools/landing-card-renderer.html');
  await page.waitForFunction(() => typeof window.renderCard === 'function');
  for (const binding of (preview ? ['hard'] : ['hard', 'soft'])) for (const pages of (preview ? [80] : [40,60,80])) for (const language of (preview ? ['ru'] : ['ka','en','ru'])) {
    const data = await page.evaluate(async ({binding,pages,language}) => window.renderCard(binding,pages,language), {binding,pages,language});
    const png = Buffer.from(data.split(',')[1], 'base64');
    const path = `${directory}/card-${binding}-${pages}-${language}.webp`;
    await sharp(png).resize(1000,1000).webp({quality: 90, alphaQuality: 95}).toFile(path);
    console.log(path);
  }
} finally { await browser.close(); }
