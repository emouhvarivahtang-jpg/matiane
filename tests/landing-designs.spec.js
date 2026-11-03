import { test, expect } from './fixtures';

test.use({ signedIn: false });
const themes = ['folio', 'grove', 'signal', 'noir', 'bloom'];
const languages = ['ka', 'en', 'ru'];

async function settle(page) {
  await page.evaluate(async () => {
    for (const image of document.images) image.loading = 'eager';
    await Promise.all([...document.images].map(image => image.decode()));
    await document.fonts.ready;
  });
}

for (const theme of themes) {
  test(`${theme} preserves approved copy and prices across languages and screen sizes`, async ({ page }, info) => {
    test.setTimeout(process.env.MATIANE_TEST_URL ? 180000 : 90000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const language of languages) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/?lang=${language}`);
      await expect(page.locator('.lp-hero')).toBeVisible();
      const approved = await page.locator('.landing').textContent();
      await page.goto(`/designs/${theme}?lang=${language}`);
      await expect(page.locator('.landing')).toHaveAttribute('data-design', theme);
      expect(await page.locator('.landing').textContent()).toBe(approved);
      await expect(page).toHaveTitle(/verso/);
      await expect(page.locator('.lp-header .lp-logotype')).toHaveText('verso');
      await expect(page.locator('.landing')).not.toContainText(/matiane|მატიანე/i);
      expect(await page.locator('.lp-header option').evaluateAll(options => options.map(o => o.value))).toEqual(languages);
      await settle(page);
      const action = await page.locator('.lp-hero .lp-cta').boundingBox();
      expect(action.y + action.height).toBeLessThanOrEqual(800);
      await expect(page.locator('.lp-hero .lp-cta')).toHaveAttribute('href', `/studio?lang=${language}&auth=register`);
      for (const width of [1280, 1024, 375, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        const art = await page.locator('.v2-open-sample').boundingBox();
        const caption = await page.locator('.lp-preview-caption').boundingBox();
        expect(caption.y - art.y - art.height).toBeGreaterThanOrEqual(4);
        if (width < 740) await expect(page.locator('.lp-hero .lp-cta')).toBeInViewport();
      }
      for (const [cover, prices] of [['hard', [100, 140, 190]], ['soft', [80, 110, 150]]]) {
        await page.locator(`[name="book-cover"][value="${cover}"]`).check();
        for (const [index, pages] of [40, 60, 80].entries()) {
          await page.locator(`[name="book-pages"][value="${pages}"]`).check();
          await expect(page.locator('#book-options output')).toHaveText(`${prices[index]} ₾`);
          await expect(page.locator('.lp-book-poster')).toHaveAttribute('src', `/landing/models/card-${cover}-${pages}-${language}.webp`);
        }
      }
      const colors = await page.locator('.lp-choice input:checked + span').first().evaluate(element => {
        const style = getComputedStyle(element);
        return [style.color, style.backgroundColor];
      });
      expect(colors[0]).not.toBe(colors[1]);
      await expect(page.locator('#book-options details, #book-options canvas, .lp-book-viewer button')).toHaveCount(0);
      await page.locator('.lp-header select').selectOption(language === 'ru' ? 'en' : 'ru');
      await expect(page).toHaveURL(new RegExp(`/designs/${theme}\\?lang=${language === 'ru' ? 'en' : 'ru'}`));
      await page.locator('.lp-header select').selectOption(language);
      if (language === 'ru') {
        await settle(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: info.outputPath('phone.png'), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({ path: info.outputPath('desktop.png'), fullPage: true });
      }
    }
    expect(errors).toEqual([]);
  });
}

test('the comparison gallery opens five localized designs with real previews', async ({ page }, info) => {
  await page.goto('/designs');
  await expect(page.locator('html')).toHaveAttribute('data-landing-version', 'designs');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ka');
  const cards = page.locator('.design-gallery-card');
  await expect(cards).toHaveCount(5);
  for (const language of languages) {
    await page.locator('select').selectOption(language);
    await settle(page);
    for (const [index, id] of themes.entries()) {
      await expect(cards.nth(index)).toHaveAttribute('href', `/designs/${id}?lang=${language}`);
      await expect(cards.nth(index)).toHaveAttribute('target', '_blank');
      await expect(cards.nth(index).locator('img')).toHaveAttribute('src', `/landing/designs/${id}-${language}.webp`);
    }
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: info.outputPath('gallery-phone.png'), fullPage: true });
});
