import React, { useState } from "react";
import { catalogText, landingText } from "./landing-text";
import { BOOK_PAGE_OPTIONS, bookPrice } from "./landing-catalog";
import "./landing-configurator.css";
import { BookPreview } from "./landing-book-preview";

export function BookConfigurator({
  language,
  register,
  actionLabel,
}) {
  const [cover, setCover] = useState("hard");
  const [pages, setPages] = useState(40);
  const c = catalogText[language],
    t = landingText[language];
  const price = bookPrice(cover, pages);
  const selection = `${c[cover]}, ${pages} ${c.pageUnit}`;
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
      >
        <BookPreview cover={cover} pages={pages} language={language} />
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
          {actionLabel || t.create}
        </a>
      </div>
    </section>
  );
}
