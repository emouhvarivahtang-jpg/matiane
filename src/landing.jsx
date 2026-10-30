import React, { useEffect, useState } from "react";
import { landingText, journalText, catalogText } from "./landing-text";
import { BOOK_PRICES, BOOK_PAGE_OPTIONS, bookPrice } from "./landing-catalog";
import "./landing.css";

function Flower() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        {[0, 45, 90, 135].map((angle) => (
          <path
            key={angle}
            d="M32 7C22 15 22 22 32 26C42 22 42 15 32 7ZM32 57C22 49 22 42 32 38C42 42 42 49 32 57Z"
            transform={`rotate(${angle} 32 32)`}
          />
        ))}
      </g>
      <circle cx="32" cy="32" r="5" fill="currentColor" />
    </svg>
  );
}
function Arrow({ previous = false }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={previous ? "lp-arrow-back" : undefined}
    >
      <path
        d="M4 12h15m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function initialLandingLanguage() {
  const requested = new URLSearchParams(location.search).get("lang");
  if (["ka", "en", "ru"].includes(requested)) return requested;
  try {
    const saved = localStorage.getItem("matiane-language");
    if (["ka", "en", "ru"].includes(saved)) return saved;
  } catch {}
  return "ka";
}

function BookConfigurator({ language, register }) {
  const [cover, setCover] = useState("hard");
  const [pages, setPages] = useState(40);
  const c = catalogText[language],
    t = landingText[language];
  const price = bookPrice(cover, pages);
  const priceLabel = (value) => `${value} ₾`;
  const selection = `${c[cover]}, ${pages} ${c.pageUnit}`;
  // A schematic material preview, never a printing-spine measurement.
  const depth = (pages - 40) / 2 + (cover === "hard" ? 18 : 10);
  return (
    <section
      id="book-options"
      className="lp-configurator lp-container"
      aria-labelledby="details-title"
    >
      <div className="lp-section-heading">
        <h2 id="details-title">{c.title}</h2>
        <p>{c.description}</p>
      </div>
      <figure
        className="lp-book-model"
        data-cover={cover}
        data-pages={pages}
        aria-label={`${c.model}: ${selection}`}
        style={{
          "--book-depth": `${depth}px`,
          "--cover-board": cover === "hard" ? "4px" : "1px",
        }}
      >
        <div className="lp-book-scene" aria-hidden="true">
          <div className="lp-book-object">
            <div className="lp-book-back" />
            <div className="lp-book-leaves" />
            <div className="lp-book-front">
              <img
                src={`/landing/cover-journal-${language}.webp`}
                alt=""
                width="1100"
                height="1382"
                loading="lazy"
              />
            </div>
            <div className="lp-book-spine" />
          </div>
        </div>
        <figcaption>
          <span>{selection}</span>
          <span>{c.size}</span>
        </figcaption>
      </figure>
      <div className="lp-configurator-controls">
        <fieldset>
          <legend>{c.cover}</legend>
          <div className="lp-choice-grid">
            {["soft", "hard"].map((option) => (
              <label className="lp-choice" key={option}>
                <input
                  type="radio"
                  name="book-cover"
                  value={option}
                  checked={cover === option}
                  onChange={() => setCover(option)}
                />
                <span>{c[option]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{c.pages}</legend>
          <div className="lp-choice-grid lp-choice-pages">
            {BOOK_PAGE_OPTIONS.map((option) => (
              <label className="lp-choice" key={option}>
                <input
                  type="radio"
                  name="book-pages"
                  value={option}
                  checked={pages === option}
                  onChange={() => setPages(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="lp-price">
          <span>{c.price}</span>
          <output aria-live="polite" aria-atomic="true" aria-label={c.price}>
            {price} <span>₾</span>
          </output>
        </div>
        <a className="lp-cta" href={register}>
          {t.create}
        </a>
        <details className="lp-price-matrix">
          <summary>
            {c.allPrices}
            <span aria-hidden="true">+</span>
          </summary>
          <table>
            <caption className="lp-sr-only">{c.allPrices}</caption>
            <thead>
              <tr>
                <th scope="col">{c.pageColumn}</th>
                <th scope="col">{c.soft}</th>
                <th scope="col">{c.hard}</th>
              </tr>
            </thead>
            <tbody>
              {BOOK_PAGE_OPTIONS.map((count) => (
                <tr key={count}>
                  <th scope="row">{count}</th>
                  <td>{priceLabel(BOOK_PRICES.soft[count])}</td>
                  <td>{priceLabel(BOOK_PRICES.hard[count])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}

export default function Landing() {
  const [language, setLanguage] = useState(initialLandingLanguage);
  const [sample, setSample] = useState(0);
  const t = landingText[language],
    j = journalText[language];
  const studio = `/studio?lang=${language}`,
    register = `${studio}&auth=register`;
  function changeLanguage(next) {
    setLanguage(next);
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t.description);
    try {
      localStorage.setItem("matiane-language", language);
    } catch {}
  }, [language, t]);
  function turnPage(direction) {
    setSample((value) => Math.max(0, Math.min(2, value + direction)));
  }
  const cta = (className = "") => (
    <a className={`lp-cta ${className}`} href={register}>
      {t.create}
    </a>
  );
  const logo = (
    <>
      <span className="lp-logotype">
        {language === "ka" ? "მატიანე" : "matiane"}
      </span>
      <Flower />
    </>
  );
  return (
    <div className="landing" data-language={language}>
      <a className="lp-skip" href="#main">
        {t.skip}
      </a>
      <header className="lp-header lp-container">
        <a className="lp-logo" href="/" aria-label="Matiane">
          {logo}
        </a>
        <nav aria-label={t.navigation}>
          <a href="#about">{t.about}</a>
          <a href="#how-it-works">{t.how}</a>
          <a href="#inspiration">{t.ideas}</a>
          <a href="#book-options">{t.pricing}</a>
        </nav>
        <div className="lp-header-actions">
          <select
            aria-label={t.language}
            value={language}
            onChange={(e) => changeLanguage(e.target.value)}
          >
            <option value="ka">ქარ</option>
            <option value="en">EN</option>
            <option value="ru">RU</option>
          </select>
          <a className="lp-login" href={`${studio}&auth=login`}>
            {t.login}
          </a>
          <a className="lp-nav-cta" href={register}>
            {t.navCreate}
          </a>
        </div>
      </header>
      <main id="main">
        <section className="lp-hero lp-container" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <h1 id="hero-title">
              {t.headline.replace(" —", "\u00a0—")}
              <br />
              <span>{t.headlineEm}</span>
            </h1>
            <div className="lp-hero-aside">
              <p className="lp-intro">{j.intro}</p>
              {cta()}
            </div>
          </div>
          <div className="lp-hero-note">
            <p>{j.format}</p>
            <span>{j.formatNote}</span>
          </div>
          <figure className="lp-hero-art" aria-label={t.preview}>
            <div className="lp-spread-paper">
              <img
                src={`/landing/spread-journal-${language}-${sample}.webp`}
                alt={`${t.preview}: ${j.samples[sample]}`}
                width="1800"
                height="1137"
                fetchPriority="high"
              />
            </div>
            <figcaption className="lp-preview-caption">
              <span>{j.samples[sample]}</span>
              <div
                className="lp-preview-controls"
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    turnPage(e.key === "ArrowLeft" ? -1 : 1);
                  }
                }}
              >
                <span
                  className="lp-preview-status"
                  role="status"
                  aria-live="polite"
                >
                  {j.sampleCount.replace("{n}", String(sample + 1))}
                </span>
                <button
                  type="button"
                  onClick={() => turnPage(-1)}
                  disabled={sample === 0}
                  aria-label={j.previous}
                >
                  <Arrow previous />
                </button>
                <button
                  type="button"
                  onClick={() => turnPage(1)}
                  disabled={sample === 2}
                  aria-label={j.next}
                >
                  <Arrow />
                </button>
              </div>
            </figcaption>
          </figure>
        </section>

        <section
          id="about"
          className="lp-story lp-container"
          aria-labelledby="story-title"
        >
          <h2 id="story-title">{t.storyTitle}</h2>
          <div className="lp-story-copy">
            <p>{t.storyBody}</p>
            <a className="lp-text-link" href={register}>
              {t.create}
            </a>
          </div>
        </section>

        <section
          id="how-it-works"
          className="lp-how lp-container"
          aria-labelledby="steps-title"
        >
          <div className="lp-section-heading">
            <h2 id="steps-title">{t.stepsTitle}</h2>
          </div>
          <figure className="lp-studio-proof">
            <img
              src={`/landing/studio-journal-${language}.webp`}
              alt={j.studioAlt}
              width="1600"
              height="1054"
              loading="lazy"
            />
            <figcaption>{j.studioCaption}</figcaption>
          </figure>
          <div className="lp-how-copy">
            <ol className="lp-step-list">
              {t.steps.map(([title, body]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
            {cta()}
          </div>
        </section>

        <section
          id="inspiration"
          className="lp-inspiration"
          aria-labelledby="ideas-title"
        >
          <div className="lp-container lp-inspiration-layout">
            <div className="lp-section-heading">
              <h2 id="ideas-title">{t.ideasTitle}</h2>
              <p>{t.ideasBody}</p>
            </div>
            <div className="lp-occasion-index">
              {t.occasions.map((item, i) => (
                <a
                  className={`lp-occasion lp-occasion-${i}`}
                  href={register}
                  key={item.title}
                >
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </a>
              ))}
            </div>
            <figure className="lp-journal-photo">
              <img
                src="/landing/journal-bicycle.webp"
                alt={j.bicycle}
                width="2945"
                height="1875"
                loading="lazy"
              />
              <figcaption>{j.moments}</figcaption>
            </figure>
          </div>
        </section>

        <BookConfigurator language={language} register={register} />
        <section
          className="lp-final lp-container"
          aria-labelledby="final-title"
        >
          <h2 id="final-title">{j.final}</h2>
          <div>
            <p>{t.finalBody}</p>
            {cta()}
          </div>
        </section>
      </main>
      <footer className="lp-footer lp-container">
        <div className="lp-footer-top">
          <p>{t.footer}</p>
          <a href={studio}>{t.studio}</a>
        </div>
        <a className="lp-logo lp-footer-masthead" href="/" aria-label="Matiane">
          {logo}
        </a>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} Matiane</span>
          <span>{t.rights}</span>
        </div>
        <p className="lp-credits">
          {j.credits}{" "}
          <a
            href="https://commons.wikimedia.org/wiki/File:Child_playing_with_a_kite.jpg"
            rel="noreferrer"
          >
            Wilfredor
          </a>
          ,{" "}
          <a
            href="https://commons.wikimedia.org/wiki/File:Parasols,_Evening,_Beach,_Rincon_de_la_Victoria,_Andalusia,_Spain.jpg"
            rel="noreferrer"
          >
            Jebulon
          </a>
          ,{" "}
          <a
            href="https://commons.wikimedia.org/wiki/File:Christiania_Winter_-_Cycling_in_Winter_in_Copenhagen_(3296897865).jpg"
            rel="noreferrer"
          >
            Mikael Colville-Andersen
          </a>
          . Wikimedia Commons, CC0.
        </p>
      </footer>
    </div>
  );
}
