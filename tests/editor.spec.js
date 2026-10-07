import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs/promises';

test('creates and saves a book on an insecure HTTP origin', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Serve real application bytes from the local build under a non-localhost HTTP origin.
  // This exercises actual browser API availability without needing external DNS/networking.
  const localOrigin = process.env.MATIANE_TEST_URL || 'http://127.0.0.1:5173';
  const target = new URL(localOrigin);
  const useRealHttpOrigin = target.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  if (!useRealHttpOrigin) {
    await page.route('http://matiane.test/**', async route => {
      const url = new URL(route.request().url());
      const response = await page.request.get(new URL(url.pathname + url.search, localOrigin).href);
      await route.fulfill({ response });
    });
  }
  await page.goto(useRealHttpOrigin ? localOrigin : 'http://matiane.test/');
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.getByRole('button', { name: 'New book', exact: true }).click();
  await expect(page.locator('.page-thumb')).toHaveCount(1);
  await page.locator('input[type=file]').first().setInputFiles('public/photos/mountains.jpg');
  await page.getByRole('button', { name: 'Your photographs: mountains.jpg', exact: true }).click();
  await expect(page.locator('.page-wrapper img')).toBeVisible();
  await expect(page.locator('.save-indicator')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('.page-thumb')).toHaveCount(1);
  await expect(page.locator('.page-wrapper img')).toBeVisible();
  await page.getByRole('tab', { name: 'Caption', exact: true }).click();
  await page.getByLabel('Your words').fill('თბილისი — memories');
  await page.getByRole('button', { name: 'Export book', exact: true }).click();
  await page.getByLabel('I have reviewed these warnings and want to export anyway.').check();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download print PDF' }).click();
  const download = await downloading;
  const pdf = await PDFDocument.load(await fs.readFile(await download.path()));
  expect(pdf.getPageCount()).toBe(1);
  await page.unrouteAll({ behavior: 'wait' });
  expect(errors).toEqual([]);
});

test('uploads, edits, saves locally, and switches languages', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your photographs' })).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles('public/photos/mountains.jpg');
  await expect(page.locator('.library-heading span')).toHaveText('7');
  await page.getByRole('button', { name: 'Your photographs: mountains.jpg', exact: true }).click();
  await page.getByRole('tab', { name: 'Caption', exact: true }).click();
  await page.getByLabel('Your words').fill('თბილისი — our summer, 2026');
  await page.getByRole('button', { name: 'ქარ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'თქვენი ფოტოები' })).toBeVisible();
  await expect(page.locator('.save-indicator')).toHaveText('შენახულია ამ მოწყობილობაზე');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'თქვენი ფოტოები' })).toBeVisible();
  await page.getByRole('tab', { name: 'წარწერა', exact: true }).click();
  await expect(page.getByLabel('თქვენი სიტყვები')).toHaveValue('თბილისი — our summer, 2026');
  await expect(page.locator('.library-heading span')).toHaveText('7');
  expect(errors).toEqual([]);
});

test('layout, color, pages, undo, and preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Four stories', exact: true }).click();
  await expect(page.locator('.page-wrapper .photo-frame')).toHaveCount(4);
  await page.getByRole('button', { name: 'Paper color #34443C', exact: true }).click();
  await expect(page.locator('.page-wrapper .book-page')).toHaveCSS('background-color', 'rgb(52, 68, 60)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.page-wrapper .book-page')).toHaveCSS('background-color', 'rgb(250, 248, 243)');
  await page.getByRole('button', { name: 'Duplicate page', exact: true }).click();
  await expect(page.locator('.page-thumb')).toHaveCount(7);
  await page.getByRole('button', { name: 'Move page earlier', exact: true }).click();
  await page.getByRole('button', { name: 'Delete page', exact: true }).click();
  await expect(page.locator('.page-thumb')).toHaveCount(6);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('exports a real A5 PDF with bleed, fonts, and six pages', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Caption', exact: true }).click();
  await page.getByLabel('Your words').fill('თბილისი — our summer, 2026');
  await page.getByRole('button', { name: 'Export book', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download print PDF' })).toBeDisabled();
  await page.getByLabel('I have reviewed these warnings and want to export anyway.').check();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download print PDF' }).click();
  const file = await downloading; const path = testInfo.outputPath('book.pdf'); await file.saveAs(path);
  const pdf = await PDFDocument.load(await fs.readFile(path));
  expect(pdf.getPageCount()).toBe(6);
  const first = pdf.getPage(0);
  expect(first.getWidth()).toBeCloseTo(154 * 72 / 25.4, 3);
  expect(first.getHeight()).toBeCloseTo(216 * 72 / 25.4, 3);
  expect(first.getTrimBox().width).toBeCloseTo(148 * 72 / 25.4, 3);
  expect(first.getTrimBox().height).toBeCloseTo(210 * 72 / 25.4, 3);
  expect(first.getTrimBox().x).toBeCloseTo(3 * 72 / 25.4, 3);
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('project download and import round trip', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Book title').fill('My saved journey');
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project', exact: true }).click();
  const download = await downloading; const data = await fs.readFile(await download.path());
  const project = JSON.parse(data.toString());
  expect(project.title).toBe('My saved journey');
  expect(project.photos.every(p => p.src.startsWith('data:image/jpeg;base64,'))).toBe(true);
  await page.getByLabel('Book title').fill('Changed title');
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'saved.matiane.json', mimeType: 'application/json', buffer: data });
  await expect(page.getByLabel('Book title')).toHaveValue('My saved journey');
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1}') });
  await expect(page.getByRole('status')).toContainText('This project could not be opened');
  await expect(page.getByLabel('Book title')).toHaveValue('My saved journey');
});

test('mobile studio fits viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make it yours' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'ქარ', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});

test('desktop presentation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.page-wrapper img')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
});

test('exports without bleed and keeps a long Georgian caption inside the page', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Caption', exact: true }).click();
  await page.getByLabel('Your words').fill('თბილისი და ჩვენი მოგონებები. '.repeat(10).slice(0, 300));
  await page.getByLabel('Text size').press('End');
  await expect(page.locator('.page-wrapper .page-caption')).toBeVisible();
  const fits = await page.locator('.page-wrapper .page-caption').evaluate(e => e.scrollHeight <= e.clientHeight + 1);
  expect(fits).toBe(true);
  await page.getByRole('button', { name: 'Export book', exact: true }).click();
  await page.getByLabel('Include 3 mm bleed').uncheck();
  await page.getByLabel('I have reviewed these warnings and want to export anyway.').check();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download print PDF' }).click();
  const file = await downloading; const path = testInfo.outputPath('no-bleed.pdf'); await file.saveAs(path);
  const pdf = await PDFDocument.load(await fs.readFile(path));
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(148 * 72 / 25.4, 3);
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(210 * 72 / 25.4, 3);
  expect(pdf.getPage(0).getTrimBox().x).toBe(0);
});
