import React, { useEffect, useState } from "react";
import { ORIGINAL_THEMES, LANDING_REFINEMENTS } from "./landing-theme-catalog";
import { initialLandingLanguage } from "./landing-language";
import "./landing-designs.css";

const copy = {
  ru: { title: "verso: шрифт и характер", intro: "Четыре новых сочетания Folio, Signal и Bloom. Спокойнее цвет, выразительнее типографика. Тексты, фотографии и цены — прежние.", open: "Открыть вариант", original: "Текущий лендинг", language: "Язык", brand: "Логотипы и стиль", next: "02 / Новая серия", earlier: "01 / Первые пять вариантов", earlierHint: "Открыть для сравнения" },
  en: { title: "verso: type and character", intro: "Four new combinations of Folio, Signal and Bloom. Quieter colors, more expressive typography. The same copy, photographs and prices.", open: "Explore design", original: "Current landing", language: "Language", brand: "Logos & identity", next: "02 / New directions", earlier: "01 / The first five designs", earlierHint: "Open to compare" },
  ka: { title: "verso: შრიფტი და ხასიათი", intro: "Folio-ს, Signal-ისა და Bloom-ის ოთხი ახალი კომბინაცია. უფრო მშვიდი ფერები, უფრო გამოკვეთილი ტიპოგრაფია. ტექსტები, ფოტოები და ფასები უცვლელია.", open: "ვარიანტის ნახვა", original: "მიმდინარე გვერდი", language: "ენა", brand: "ლოგოები და სტილი", next: "02 / ახალი სერია", earlier: "01 / პირველი ხუთი ვარიანტი", earlierHint: "გახსენით შესადარებლად" },
};
function DesignCards({ themes, language, open }) {
  return <div className="design-gallery-grid">{themes.map((theme, index) => (
    <a className="design-gallery-card" key={theme.id} href={`/designs/${theme.id}?lang=${language}`} target="_blank" rel="noopener" style={{ "--card-paper": theme.colors[0] }}>
      <div className="design-gallery-preview"><img src={`/landing/designs/${theme.id}-${language}.webp`} alt={theme.name} width="1440" height="1000" loading="lazy" /></div>
      <div className="design-gallery-card-body">
        <div className="design-gallery-title"><span className="design-gallery-number">0{index + 1}</span><h2>{theme.name}</h2><span className="design-gallery-swatches" aria-hidden="true">{theme.colors.map(color => <i key={color} style={{ background: color }} />)}</span></div>
        <p>{theme.subtitle[language]}</p>
        <span className="design-gallery-open">{open}<span aria-hidden="true">↗</span></span>
      </div>
    </a>
  ))}</div>;
}
export default function LandingDesigns() {
  const [language, setLanguage] = useState(initialLandingLanguage);
  const t = copy[language];
  useEffect(() => { document.documentElement.lang = language; document.title = t.title; }, [language, t]);
  function changeLanguage(value) {
    setLanguage(value);
    const url = new URL(location.href); url.searchParams.set("lang", value);
    history.replaceState(null, "", url.pathname + url.search);
    try { localStorage.setItem("matiane-language", value); } catch {}
  }
  return <div className="design-gallery" data-language={language}>
    <header className="design-gallery-header">
      <a className="design-gallery-logo" href={`/?lang=${language}`} aria-label="verso">verso</a>
      <div><a className="design-gallery-brand-link" href={`/brand?lang=${language}`}>{t.brand} ↗</a><select aria-label={t.language} value={language} onChange={event => changeLanguage(event.target.value)}><option value="ka">ქარ</option><option value="en">EN</option><option value="ru">RU</option></select></div>
    </header>
    <main>
      <div className="design-gallery-intro"><span className="design-gallery-kicker">{t.next}</span><h1>{t.title}</h1><p>{t.intro}</p></div>
      <DesignCards themes={LANDING_REFINEMENTS} language={language} open={t.open} />
      <details className="design-gallery-archive"><summary><span>{t.earlier}</span><small>{t.earlierHint}</small></summary><DesignCards themes={ORIGINAL_THEMES} language={language} open={t.open} /></details>
    </main>
    <footer><span>verso · {new Date().getFullYear()}</span><a href={`/?lang=${language}`}>{t.original} ↗</a></footer>
  </div>;
}
