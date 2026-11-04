import React, { useEffect, useState } from "react";
import { landingText } from "./landing-classic-text";
import { journalText } from "./landing-text";
import { initialLandingLanguage } from "./landing-language";
import { BookConfigurator } from "./landing-configurator";
import "./landing-v2.css";
import "./landing-themes.css";
import "./landing-refinements.css";
import { currentLandingTheme } from "./landing-theme-catalog";

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

const copy = {
  ka: {
    ideas: "რომელ ამბავს შეინახავთ?",
    process: "ფოტოებიდან წიგნამდე, სამ ნაბიჯში",
    gift: "საჩუქარი, რომელშიც თქვენი სიყვარულია",
    giftBody:
      "ბავშვების პირველი ფოტოები, ერთად გატარებული ზაფხული ან მთელი წლის მოგონებები. შეაგროვეთ ისინი წიგნში და აჩუქეთ საყვარელ ადამიანს.",
    options: "აირჩიეთ თქვენი წიგნი",
    size: "ფოტოწიგნი 19 × 24 სმ",
    more: "წიგნის მაგალითები",
    examples: ["ბედნიერი დღეები", "ჩვენი ზაფხული", "ჩვენი 2026"],
    photos: "მაგალითის ფოტოები",
  },
  en: {
    ideas: "Which story will you keep?",
    process: "From photographs to book, in three steps",
    gift: "A gift full of your love",
    giftBody:
      "Their first photographs, a summer together or a whole year of memories. Gather them in a book for someone you love.",
    options: "Choose your book",
    size: "19 × 24 cm photo book",
    more: "Example photo books",
    examples: ["Happy days", "Our summer", "Our 2026"],
    photos: "Example photographs",
  },
  ru: {
    ideas: "Какую историю сохраните вы?",
    process: "От фотографий до книги, за три шага",
    gift: "Подарок, в котором вся ваша любовь",
    giftBody:
      "Первые фотографии детей, общее лето или целый год воспоминаний. Соберите их в книгу и подарите тем, с кем хочется всё это разделить.",
    options: "Выбрать свою книгу",
    size: "Фотокнига 19 × 24 см",
    more: "Примеры фотокниг",
    examples: ["Счастливые дни", "Наше лето", "Наш 2026"],
    photos: "Фотографии для примера",
  },
};
const headlineLines = {
  ka: ["გადაიტანეთ", "მოგონებები", "ტელეფონის", "გალერეიდან წიგნში"],
  en: ["Move your memories", "from camera roll", "to book"],
  ru: ["Перенесите воспоминания", "из ленты телефона", "в книгу"],
};

export default function LandingV2() {
  const design = currentLandingTheme();
  const [language, setLanguage] = useState(initialLandingLanguage);
  const [sample, setSample] = useState(0);
  const t = landingText[language],
    c = copy[language],
    j = journalText[language];
  const studio = `/studio?lang=${language}`,
    register = `${studio}&auth=register`;
  const actionLabel = language === "ka" ? t.navCreate : t.create;
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.title;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", design?.colors[0] || "#faf8f2");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t.description);
    try {
      localStorage.setItem("matiane-language", language);
    } catch {}
  }, [language, t, design]);
  function changeLanguage(next) {
    setLanguage(next);
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  function turnPage(direction) {
    setSample((value) => Math.max(0, Math.min(2, value + direction)));
  }
  const logo = (
    <>
      <span className="lp-logotype">
        verso
      </span>
      <Flower />
    </>
  );
  const cta = (
    <a className="lp-cta" href={register}>
      {actionLabel}
    </a>
  );
  return (
    <div className="landing landing-v2" data-language={language} data-design={design?.id || "classic"} data-refinement={design?.round === 2 ? "true" : undefined}>
      <a className="lp-skip" href="#main">
        {t.skip}
      </a>
      <header className="lp-header lp-container">
        <a className="lp-logo" href={`${design ? `/designs/${design.id}` : "/"}?lang=${language}`} aria-label="verso">
          {logo}
        </a>
        <nav aria-label={t.navigation}>
          <a href="#inspiration">{t.ideas}</a>
          <a href="#how-it-works">{t.how}</a>
          <a href="#book-options">{t.pricing}</a>
        </nav>
        <div className="lp-header-actions">
          <select
            aria-label={t.language}
            value={language}
            onChange={(event) => changeLanguage(event.target.value)}
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
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-container v2-hero-layout">
            <div className="lp-hero-copy">
              <h1 id="hero-title">
                {headlineLines[language].map((line, index) => (
                  <React.Fragment key={line}>
                    {index > 0 && " "}
                    <span className="v2-head-line">{line}</span>
                  </React.Fragment>
                ))}
              </h1>
              <p className="lp-intro">{t.intro}</p>
              <div className="v2-hero-actions">
                {cta}
                <a className="v2-text-link" href="#book-options">
                  {c.options}
                </a>
              </div>
            </div>
            <figure className="lp-hero-art" aria-label={t.preview}>
              <div className="v2-cover-sample" aria-hidden="true">
                <img
                  src={`/landing/book-classic-cover-${language}.webp`}
                  width="1100"
                  height="1382"
                  alt=""
                  fetchPriority="high"
                />
              </div>
              <div className="v2-open-sample" data-kind="product">
                <img
                  src={`/landing/book-classic-spread-${language}-${sample}.webp`}
                  width="1800"
                  height="1134"
                  alt={`${t.preview}: ${c.examples[sample]}`}
                  fetchPriority="high"
                />
              </div>
              <figcaption className="lp-preview-caption">
                <span>{c.examples[sample]}</span>
                <div
                  className="lp-preview-controls"
                  onKeyDown={(event) => {
                    if (
                      event.key === "ArrowLeft" ||
                      event.key === "ArrowRight"
                    ) {
                      event.preventDefault();
                      turnPage(event.key === "ArrowLeft" ? -1 : 1);
                    }
                  }}
                >
                  <span
                    className="v2-sample-count"
                    role="status"
                    aria-live="polite"
                  >
                    {sample + 1} / 3
                  </span>
                  <button
                    type="button"
                    aria-label={j.previous}
                    disabled={sample === 0}
                    onClick={() => turnPage(-1)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m14 6-6 6 6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label={j.next}
                    disabled={sample === 2}
                    onClick={() => turnPage(1)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m10 6 6 6-6 6" />
                    </svg>
                  </button>
                </div>
              </figcaption>
            </figure>
          </div>
        </section>

        <section
          id="inspiration"
          className="v2-occasions lp-container"
          aria-labelledby="ideas-title"
        >
          <div className="v2-heading">
            <h2 id="ideas-title">{c.ideas}</h2>
            <p>{t.ideasBody}</p>
          </div>
          <div className="v2-occasion-grid">
            {t.occasions.map((item, index) => (
              <a className="lp-occasion" href={register} key={item.title}>
                <div className={`v2-occasion-photo v2-occasion-photo-${index}`}>
                  <img
                    src={`/landing/${["baby", "journal-shore", "summer"][index]}.webp`}
                    alt={[t.childAlt, "", t.togetherAlt][index]}
                    width="1200"
                    height="800"
                    loading="lazy"
                  />
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </a>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="v2-how"
          aria-labelledby="steps-title"
        >
          <div className="lp-container">
            <div className="v2-heading">
              <h2 id="steps-title">{c.process}</h2>
            </div>
            <ol className="lp-step-list">
              {t.steps.map(([title, body]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
            <figure className="v2-studio-proof" data-kind="product">
              <img
                src={`/landing/studio-verso-${language}.webp`}
                alt={j.studioAlt}
                width="1600"
                height="1054"
                loading="lazy"
              />
              <figcaption>{j.studioCaption}</figcaption>
            </figure>
          </div>
        </section>

        <BookConfigurator
          language={language}
          register={register}
          actionLabel={actionLabel}
        />

        <section id="about" className="v2-gift" aria-labelledby="gift-title">
          <div className="lp-container v2-gift-layout">
            <figure>
              <img
                src="/landing/together.webp"
                alt={t.childAlt}
                width="1200"
                height="800"
                loading="lazy"
              />
            </figure>
            <div>
              <h2 id="gift-title">{c.gift}</h2>
              <p>{c.giftBody}</p>
              {cta}
            </div>
          </div>
        </section>
      </main>
      <footer className="lp-footer lp-container">
        <div className="v2-footer-main">
          <div>
            <a className="lp-logo" href={`${design ? `/designs/${design.id}` : "/"}?lang=${language}`} aria-label="verso">
              {logo}
            </a>
            <p>{t.footer}</p>
          </div>
          <a href={studio}>{t.studio}</a>
        </div>
        <div className="v2-footer-bottom">
          <span>© {new Date().getFullYear()} verso</span>
          <span>{t.rights}</span>
        </div>
        <p className="v2-photo-credits" data-credits>
          {c.photos}:{" "}
          <a
            href="https://commons.wikimedia.org/wiki/File:Parasols,_Evening,_Beach,_Rincon_de_la_Victoria,_Andalusia,_Spain.jpg"
            rel="noreferrer"
          >
            Jebulon (CC0)
          </a>
        </p>
      </footer>
    </div>
  );
}
