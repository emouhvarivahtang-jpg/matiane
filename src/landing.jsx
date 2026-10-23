import React, { useEffect, useState } from "react";
import { initialLanguage } from "./language";
import { landingText } from "./landing-text";
import "./landing.css";

function Flower({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
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
function Arrow() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
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
function StepIcon({ index }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <g
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {index === 0 ? (
          <>
            <rect x="6" y="12" width="36" height="28" rx="4" />
            <path d="m15 12 3-5h12l3 5" />
            <circle cx="24" cy="26" r="8" />
            <path d="M35 18h1" />
          </>
        ) : index === 1 ? (
          <>
            <path d="M24 12C17 7 11 8 5 10v29c7-3 13-2 19 2 6-4 12-5 19-2V10c-6-2-12-3-19 2ZM24 12v29M11 18h7m-7 6h7m12-6h7m-7 6h7" />
          </>
        ) : (
          <>
            <path d="M24 39 8 23C-3 10 15-1 24 13 33-1 51 10 40 23L24 39Z" />
          </>
        )}
      </g>
    </svg>
  );
}

export default function Landing() {
  const [language, setLanguage] = useState(initialLanguage);
  const t = landingText[language];
  const studio = `/studio?lang=${language}`;
  const register = `${studio}&auth=register`;
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
  const cta = (className = "") => (
    <a className={`lp-cta ${className}`} href={register}>
      {t.create}
      <Arrow />
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
        </nav>
        <div className="lp-header-actions">
          <select
            aria-label={t.language}
            value={language}
            onChange={(e) => changeLanguage(e.target.value)}
          >
            <option value="ru">RU</option>
            <option value="ka">ქარ</option>
            <option value="en">EN</option>
          </select>
          <a className="lp-login" href={`${studio}&auth=login`}>
            {t.login}
          </a>
          <a className="lp-nav-cta" href={register}>
            {t.navCreate}
            <Arrow />
          </a>
        </div>
      </header>
      <main id="main">
        <section className="lp-hero lp-container" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">
              <span />
              {t.eyebrow}
            </p>
            <h1 id="hero-title">
              {t.headline}
              <br />
              <em>{t.headlineEm}</em>
            </h1>
            <p className="lp-intro">{t.intro}</p>
            {cta()}
            <p className="lp-cta-hint">{t.hint}</p>
          </div>
          <figure className="lp-hero-art" aria-label={t.preview}>
            <div className="lp-art-halo" />
            <div className="lp-back-book" aria-hidden="true">
              <span>{t.cover}</span>
              <small>MATIANE</small>
              <Flower />
            </div>
            <div className="lp-open-book">
              <div className="lp-book-leaf lp-left-leaf">
                <img
                  src="/landing/family.webp"
                  alt={t.familyAlt}
                  width="1200"
                  height="800"
                  fetchPriority="high"
                />
                <span>{t.bookDate}</span>
              </div>
              <div className="lp-book-leaf lp-right-leaf">
                <div className="lp-book-dedication">
                  <Flower />
                  <p>{t.bookCaption}</p>
                  <small>{t.coverSub}</small>
                </div>
                <img
                  src="/landing/summer.webp"
                  alt={t.togetherAlt}
                  width="1200"
                  height="800"
                  fetchPriority="high"
                />
                <span>02 — 03</span>
              </div>
            </div>
            <figcaption className="lp-handwritten">
              {t.scribble}
              <svg viewBox="0 0 90 50" fill="none" aria-hidden="true">
                <path
                  d="M84 5C61 6 39 13 10 38m2-16L7 41l20-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </figcaption>
            <Flower className="lp-art-star" />
          </figure>
        </section>
        <div className="lp-ribbon">
          {t.ribbon.map((line, i) => (
            <React.Fragment key={line}>
              {i > 0 && <Flower />}
              <span>{line}</span>
            </React.Fragment>
          ))}
        </div>

        <section
          id="about"
          className="lp-story lp-container"
          aria-labelledby="story-title"
        >
          <div className="lp-story-photo">
            <img
              src="/landing/summer.webp"
              alt={t.togetherAlt}
              width="1200"
              height="800"
              loading="lazy"
            />
            <span className="lp-photo-note">{t.storyNote}</span>
            <Flower />
          </div>
          <div className="lp-story-copy">
            <p className="lp-eyebrow">{t.storyEyebrow}</p>
            <h2 id="story-title">{t.storyTitle}</h2>
            <p>{t.storyBody}</p>
            <a className="lp-text-link" href={register}>
              {t.create}
              <Arrow />
            </a>
          </div>
        </section>

        <section
          id="inspiration"
          className="lp-inspiration"
          aria-labelledby="ideas-title"
        >
          <div className="lp-container">
            <div className="lp-section-heading">
              <p className="lp-eyebrow">{t.ideasEyebrow}</p>
              <h2 id="ideas-title">{t.ideasTitle}</h2>
              <p>{t.ideasBody}</p>
            </div>
            <div className="lp-occasion-grid">
              {t.occasions.map((item, i) => (
                <a
                  className={`lp-occasion lp-occasion-${i}`}
                  href={register}
                  key={item.title}
                >
                  <div className="lp-occasion-scene">
                    <div className="lp-sample-cover">
                      <span>{item.cover}</span>
                      <img
                        src={`/landing/${["together", "family", "summer"][i]}.webp`}
                        alt={[t.childAlt, t.familyAlt, t.togetherAlt][i]}
                        width="1200"
                        height="800"
                        loading="lazy"
                      />
                      <small>MATIANE</small>
                    </div>
                    <span className="lp-occasion-tag">{item.label}</span>
                  </div>
                  <div className="lp-occasion-heading">
                    <h3>{item.title}</h3>
                    <Arrow />
                  </div>
                  <p>{item.body}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="lp-how lp-container"
          aria-labelledby="steps-title"
        >
          <div className="lp-section-heading">
            <p className="lp-eyebrow">{t.stepsEyebrow}</p>
            <h2 id="steps-title">{t.stepsTitle}</h2>
          </div>
          <ol className="lp-step-grid">
            {t.steps.map(([title, body], i) => (
              <li key={title}>
                <div className="lp-step-top">
                  <span>0{i + 1}</span>
                  <StepIcon index={i} />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
          <div className="lp-centered">{cta()}</div>
        </section>

        <section className="lp-details" aria-labelledby="details-title">
          <div className="lp-container lp-details-grid">
            <div className="lp-details-copy">
              <p className="lp-eyebrow">{t.detailEyebrow}</p>
              <h2 id="details-title">{t.detailTitle}</h2>
              <p>{t.detailBody}</p>
              <dl className="lp-features">
                {t.features.map(([value, label]) => (
                  <div key={value}>
                    <dt>{value}</dt>
                    <dd>{label}</dd>
                  </div>
                ))}
              </dl>
              <p className="lp-save-note">{t.detailNote}</p>
            </div>
            <div className="lp-detail-art" role="img" aria-label={t.preview}>
              <div className="lp-detail-cover">
                <Flower />
                <span>{t.cover}</span>
                <small>MATIANE</small>
              </div>
              <div className="lp-detail-spread">
                <div>
                  <img
                    src="/landing/together.webp"
                    alt=""
                    width="1200"
                    height="800"
                    loading="lazy"
                  />
                  <span>{t.occasions[0].cover}</span>
                </div>
                <div>
                  <img
                    src="/landing/baby.webp"
                    alt=""
                    width="1200"
                    height="800"
                    loading="lazy"
                  />
                  <img
                    src="/landing/summer.webp"
                    alt=""
                    width="1200"
                    height="800"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-faq lp-container" aria-labelledby="faq-title">
          <h2 id="faq-title">{t.faqTitle}</h2>
          <div>
            {t.faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="lp-final" aria-labelledby="final-title">
          <Flower />
          <p className="lp-eyebrow">{t.finalEyebrow}</p>
          <h2 id="final-title">{t.finalTitle}</h2>
          <p>{t.finalBody}</p>
          {cta("lp-cta-light")}
        </section>
      </main>
      <footer className="lp-footer lp-container">
        <div>
          <a className="lp-logo" href="/" aria-label="Matiane">
            {logo}
          </a>
          <p>{t.footer}</p>
        </div>
        <div className="lp-footer-links">
          <a href={studio}>
            {t.studio}
            <Arrow />
          </a>
          <span>
            © {new Date().getFullYear()} Matiane. {t.rights}
          </span>
        </div>
      </footer>
    </div>
  );
}
