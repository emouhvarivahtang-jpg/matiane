import React, { useEffect, useState } from 'react';
import { initialLandingLanguage } from './landing-language';
import { landingText } from './landing-classic-text';
import { BRAND_CONCEPTS } from './landing-brand-catalog';
import './landing-brand.css';

const copy = {
  ru: { title:'Каким может быть verso', intro:'Пять логотипов и пять систем вокруг них. Спокойные цвета, выразительная типографика и примеры на обложке и экране.', kicker:'02 / Логотип и фирстиль', designs:'Варианты лендинга', language:'Язык', background:'Фон логотипа', modes:['На бумаге','На тёмном','Одним цветом'], palette:'Палитра', type:'Типографика', cover:'Обложка', screen:'На экране', scale:'В маленьком размере', logo:'SVG логотипа', mark:'SVG знака', related:'Близкий лендинг', footer:'Концепции для сравнения. Логотипы в SVG — буквы и знаки в контурах.', set:'Знаки рядом', tagline:'Бережно о том, что дорого.', book:'Наши счастливые дни' },
  en: { title:'What verso could look like', intro:'Five logos and five identities around them. Quiet colors, expressive type, and examples on the cover and screen.', kicker:'02 / Logo & identity', designs:'Landing designs', language:'Language', background:'Logo background', modes:['On paper','On dark','One color'], palette:'Palette', type:'Typography', cover:'Book cover', screen:'On screen', scale:'At small sizes', logo:'Logo SVG', mark:'Symbol SVG', related:'Related landing', footer:'Concepts for comparison. SVG letters and symbols are outlined paths.', set:'The symbols together', tagline:'For the things that matter.', book:'Our happy days' },
  ka: { title:'როგორი შეიძლება იყოს verso', intro:'ხუთი ლოგო და მათ გარშემო აგებული ხუთი სტილი. მშვიდი ფერები, გამოკვეთილი ტიპოგრაფია და მაგალითები ყდასა და ეკრანზე.', kicker:'02 / ლოგო და ბრენდის სტილი', designs:'ლენდინგის ვარიანტები', language:'ენა', background:'ლოგოს ფონი', modes:['ქაღალდზე','მუქ ფონზე','ერთი ფერით'], palette:'პალიტრა', type:'ტიპოგრაფია', cover:'წიგნის ყდა', screen:'ეკრანზე', scale:'მცირე ზომაში', logo:'ლოგოს SVG', mark:'ნიშნის SVG', related:'შესაბამისი ლენდინგი', footer:'კონცეფციები შესადარებლად. SVG ლოგოებში ასოები და ნიშნები კონტურებია.', set:'ნიშნები ერთად', tagline:'ზრუნვით იმაზე, რაც ძვირფასია.', book:'ჩვენი ბედნიერი დღეები' },
};
const modes = ['color', 'dark', 'mono'];
function Arrow({ down = false }) {
  return <svg className="brand-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d={down ? "M12 4v15m-6-6 6 6 6-6" : "M6 18 18 6M6 6h12v12"} /></svg>;
}
function Concept({ concept: c, language, t, mode, index }) {
  const suffix = mode === "color" ? "" : `-${mode}`;
  const assets = `/brand/concepts/${c.id}`, product = landingText[language];
  return <article className="identity-card" id={c.id} data-concept={c.id} data-type={c.type} style={{'--identity-paper':c.colors[0], '--identity-ink':c.colors[1], '--identity-accent':c.colors[2]}}>
    <header className="identity-card-heading"><span>0{index + 1}</span><h2>{c.name[language]}</h2><a href={`#${c.id}`} aria-label={c.name[language]}><Arrow /></a></header>
    <div className="identity-logo-stage" data-mode={mode}><img src={`${assets}/logo.svg`} alt={`verso — ${c.name[language]}`} width="1024" height="512" /></div>
    <div className="identity-card-content">
      <p className="identity-rationale">{c.idea[language]}</p>
      <div className="identity-palette" aria-label={t.palette}>{c.colors.map(color=><div key={color}><i style={{background:color}} /><code>{color.toUpperCase()}</code></div>)}</div>
      <div className="identity-samples">
        <figure className="identity-book-sample"><figcaption>{t.cover}</figcaption><div className="identity-book"><img className="identity-book-wordmark" src={`${assets}/wordmark.svg`} alt="verso" width="1024" height="512" /><img className="identity-book-photo" src="/landing/family.webp" alt="" width="900" height="720" /><span>{t.book}</span><img className="identity-book-mark" src={`${assets}/mark.svg`} alt="" width="512" height="512" /></div></figure>
        <div className="identity-site-sample"><span className="identity-label">{t.screen}</span><div className="identity-mini-nav"><img src={`${assets}/mark.svg`} alt="" width="512" height="512" /><span>verso</span></div><h3>{product.headline} {product.headlineEm}</h3><a href={`/studio?lang=${language}&auth=register`}>{product.navCreate}</a></div>
      </div>
      <div className="identity-type"><span>{t.type}</span><strong>{c.font}<small>KA · {c.type === "narrow" ? "Noto Sans Georgian Condensed Bold" : c.type === "serif" ? "Noto Serif Georgian" : "Noto Sans Georgian Bold"}</small></strong><p lang="ka">მოგონებები წიგნში</p><p lang="en">Memories in a book</p><p lang="ru">Воспоминания в книге</p></div>
      <div className="identity-size-check"><span>{t.scale}</span><div>{[64,32,16].map(size=><figure key={size}><img src={`${assets}/mark.svg`} width={size} height={size} alt={`${c.name[language]} ${size}px`} /><figcaption>{size} px</figcaption></figure>)}</div></div>
      <div className="identity-downloads"><a href={`${assets}/logo${suffix}.svg`} download={`verso-${c.id}-logo${suffix}.svg`}>{t.logo} <Arrow down /></a><a href={`${assets}/mark${suffix}.svg`} download={`verso-${c.id}-mark${suffix}.svg`}>{t.mark} <Arrow down /></a></div>
      <a className="identity-related" href={`/designs/${c.landing}?lang=${language}`} target="_blank" rel="noopener">{t.related}<Arrow /></a>
    </div>
  </article>;
}
export default function LandingBrand() {
  const [language, setLanguage] = useState(initialLandingLanguage), [mode,setMode] = useState('color');
  const t = copy[language];
  useEffect(()=>{ document.documentElement.lang=language; document.title=`verso — ${t.kicker.slice(5)}`; document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#f3f1eb'); },[language,t]);
  function changeLanguage(value) { setLanguage(value); const url=new URL(location.href);url.searchParams.set('lang',value);history.replaceState(null,'',url.pathname+url.search+url.hash);try{localStorage.setItem('matiane-language',value);}catch{} }
  return <div className="brand-review" data-language={language}>
    <header className="brand-review-header"><a className="brand-review-wordmark" href={`/designs?lang=${language}`}>verso<span> / </span></a><div><a href={`/designs?lang=${language}`}>{t.designs} <Arrow /></a><select aria-label={t.language} value={language} onChange={event=>changeLanguage(event.target.value)}><option value="ka">ქარ</option><option value="en">EN</option><option value="ru">RU</option></select></div></header>
    <main>
      <div className="brand-review-intro"><span>{t.kicker}</span><h1>{t.title}</h1><p>{t.intro}</p></div>
      <nav className="brand-review-index" aria-label={t.set}>{BRAND_CONCEPTS.map((c,i)=><a key={c.id} href={`#${c.id}`}><img src={`/brand/concepts/${c.id}/mark.svg`} alt="" width="512" height="512" /><span>0{i+1} / {c.name[language]}</span></a>)}</nav>
      <div className="brand-review-controls"><span id="logo-background">{t.background}</span><div role="group" aria-labelledby="logo-background">{modes.map((value,i)=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)}>{t.modes[i]}</button>)}</div></div>
      <div className="brand-review-grid">{BRAND_CONCEPTS.map((c,i)=><Concept key={c.id} concept={c} index={i} language={language} t={t} mode={mode} />)}</div>
    </main>
    <footer><span>verso · {new Date().getFullYear()}</span><p>{t.footer}</p><a href={`/designs?lang=${language}`}>{t.designs} <Arrow /></a></footer>
  </div>;
}
