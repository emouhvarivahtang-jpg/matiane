// Run against the local Vite server after changing the visual directions.
// The gallery previews are actual browser captures, in all supported languages.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { LANDING_THEMES } from '../src/landing-theme-catalog.js';
await mkdir('public/landing/designs', {recursive:true});
await mkdir('work/verso', {recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.on('pageerror',error=>{throw error;});
 for(const {id} of LANDING_THEMES.filter(theme => !process.argv.includes('--round=2') || theme.round === 2)) for(const language of ['ka','en','ru']) {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`http://127.0.0.1:5173/designs/${id}?lang=${language}`);
  await page.locator('.lp-hero').waitFor();
  await page.evaluate(async()=>{for(const i of document.images)i.loading='eager';await Promise.all([...document.images].map(i=>i.decode()));await document.fonts.ready;});
  const screenshot=await page.screenshot({path:`work/verso/${id}-${language}-desktop.png`});
  await sharp(screenshot).webp({quality:86}).toFile(`public/landing/designs/${id}-${language}.webp`);
  if(language==='ru')await page.screenshot({path:`work/verso/${id}-full.png`,fullPage:true});
  for(const width of [1440,1024,390,320]) {
   await page.setViewportSize({width,height:width>740?1000:844});
   await page.evaluate(()=>document.fonts.ready);
   console.log(id,language,width,await page.evaluate(()=>{
    const art=document.querySelector('.v2-open-sample').getBoundingClientRect(),caption=document.querySelector('.lp-preview-caption').getBoundingClientRect();
    const choice=getComputedStyle(document.querySelector('.lp-choice input:checked + span'));
    return {overflow:document.documentElement.scrollWidth-innerWidth,captionGap:Math.round(caption.top-art.bottom),ctaBottom:Math.round(document.querySelector('.lp-hero .lp-cta').getBoundingClientRect().bottom),choice:[choice.color,choice.backgroundColor]};
   }));
   if(width===390&&language==='ru')await page.screenshot({path:`work/verso/${id}-mobile.png`,fullPage:true});
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('http://127.0.0.1:5173/designs?lang=ru');
 await page.locator('.design-gallery').waitFor();
 await page.evaluate(async()=>{for(const i of document.images)i.loading='eager';await Promise.all([...document.images].map(i=>i.decode()));await document.fonts.ready;});
 await page.screenshot({path:'work/verso/gallery-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'work/verso/gallery-mobile.png',fullPage:true});
} finally {await browser.close();}
