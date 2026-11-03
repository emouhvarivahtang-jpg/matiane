import React, { useEffect, useState } from "react";
import { LANDING_THEMES } from "./landing-theme-catalog";
import { initialLandingLanguage } from "./landing-language";
import "./landing-designs.css";

const copy = {
  ru: { title: "Пять направлений для verso", intro: "Те же фотографии, тексты и цены. Разные цвет, типографика и композиция.", open: "Открыть вариант", original: "Текущий лендинг", language: "Язык" },
  en: { title: "Five directions for verso", intro: "The same photographs, copy and prices. Different color, typography and composition.", open: "Explore design", original: "Current landing", language: "Language" },
  ka: { title: "ხუთი მიმართულება verso-სთვის", intro: "იგივე ფოტოები, ტექსტები და ფასები. განსხვავებული ფერი, ტიპოგრაფია და კომპოზიცია.", open: "ვარიანტის ნახვა", original: "მიმდინარე გვერდი", language: "ენა" },
};
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
  return (
    <div className="design-gallery" data-language={language}>
      <header className="design-gallery-header">
        <a className="design-gallery-logo" href={`/?lang=${language}`} aria-label="verso">verso</a>
        <div>
          <a href={`/?lang=${language}`}>{t.original}</a>
          <select aria-label={t.language} value={language} onChange={event => changeLanguage(event.target.value)}>
            <option value="ka">ქარ</option><option value="en">EN</option><option value="ru">RU</option>
          </select>
        </div>
      </header>
      <main>
        <div className="design-gallery-intro"><h1>{t.title}</h1><p>{t.intro}</p></div>
        <div className="design-gallery-grid">
          {LANDING_THEMES.map((theme, index) => (
            <a className="design-gallery-card" key={theme.id} href={`/designs/${theme.id}?lang=${language}`} target="_blank" rel="noopener" style={{"--card-paper": theme.colors[0]}}>
              <div className="design-gallery-preview"><img src={`/landing/designs/${theme.id}-${language}.webp`} alt={theme.name} width="1440" height="1000" loading="lazy" /></div>
              <div className="design-gallery-card-body">
                <div className="design-gallery-title"><span className="design-gallery-number">0{index + 1}</span><h2>{theme.name}</h2><span className="design-gallery-swatches" aria-hidden="true">{theme.colors.map(color => <i key={color} style={{background: color}} />)}</span></div>
                <p>{theme.subtitle[language]}</p>
                <span className="design-gallery-open">{t.open}<span aria-hidden="true">↗</span></span>
              </div>
            </a>
          ))}
        </div>
      </main>
      <footer>verso · {new Date().getFullYear()}</footer>
    </div>
  );
}
