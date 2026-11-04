import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';

test.use({ signedIn: false });
const concepts = ['turn', 'index', 'frame', 'tact', 'imprint'];
async function settle(page) {
  await page.evaluate(async () => {
    await Promise.all([...document.images].map(image => image.decode()));
    await document.fonts.ready;
  });
}

test('the identity page compares five real SVG systems in three languages and exports the selected treatment', async ({ page }, info) => {
  test.setTimeout(process.env.MATIANE_TEST_URL ? 120000 : 60000);
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto('/brand');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ka');
  await expect(page.locator('html')).toHaveAttribute('data-landing-version', 'brand');
  await expect(page.locator('.identity-card')).toHaveCount(5);
  for (const language of ['ka', 'en', 'ru']) {
    await page.locator('select').selectOption(language);
    await expect(page).toHaveURL(new RegExp(`/brand\\?lang=${language}`));
    await settle(page);
    for (const width of [1440, 1024, 740, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    for (const id of concepts) {
      await expect(page.locator(`#${id} .identity-related`)).toHaveAttribute('href', new RegExp(`lang=${language}$`));
      await expect(page.locator(`#${id} .identity-site-sample > a`)).toHaveAttribute('href', `/studio?lang=${language}&auth=register`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [index, mode] of ['color', 'dark', 'mono'].entries()) {
    const control = page.locator('.brand-review-controls button').nth(index);
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    for (const id of concepts) await expect(page.locator(`#${id} .identity-logo-stage`)).toHaveAttribute('data-mode', mode);
    await page.locator('#turn .identity-logo-stage').screenshot({ path: info.outputPath(`logo-${mode}.png`) });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#turn .identity-downloads a').first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`verso-turn-logo${mode === 'color' ? '' : '-'+mode}.svg`);
    const data = await readFile(await download.path(), 'utf8');
    expect(data).toContain('<svg');
    expect(data).toContain('<path');
    expect(data).not.toMatch(/<(?:text|image|script|use)\b/);
    if (mode === 'dark') expect(data).toContain('#ffffff');
    if (mode === 'mono') expect(data).toContain('#202320');
  }
  await page.locator('.brand-review-controls button').first().click();
  await page.evaluate(() => scrollTo(0,0));
  await page.screenshot({ path: info.outputPath('brand-desktop.png'), fullPage: true });
  await page.setViewportSize({ width:390, height:844 });
  await page.screenshot({ path: info.outputPath('brand-phone.png'), fullPage:true });
  expect(errors).toEqual([]);
  expect(requests.filter(url => new URL(url).pathname.startsWith('/api/'))).toEqual([]);
});

test('the identity page keeps its geometry when all other surface styles are injected', async ({ page }) => {
  await page.goto('/brand?lang=ka');
  await expect(page.locator('.brand-review')).toBeVisible();
  await settle(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const metrics = () => page.evaluate(() => ['.brand-review','h1','.identity-card','.identity-logo-stage','.identity-site-sample h3'].map(selector => {
    const element=document.querySelector(selector), rect=element.getBoundingClientRect(), style=getComputedStyle(element);
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,font:style.font,color:style.color,background:style.backgroundColor};
  }));
  const before = await metrics(), other = await page.context().newPage();
  for (const [path, selector] of [['/studio', '.site-header'], ['/designs', '.design-gallery'], ['/designs/folio-sans', '.lp-hero'], ['/landing-archive', '.lp-hero']]) {
    await other.goto(path+'?lang=ka');
    await expect(other.locator(selector)).toBeVisible();
    const styles=await other.evaluate(() => [...document.styleSheets].flatMap(sheet=>[...sheet.cssRules].map(rule=>rule.cssText)).join('\n'));
    await page.addStyleTag({content:styles});
    await settle(page);
    expect(await metrics()).toEqual(before);
  }
  await other.close();
});
