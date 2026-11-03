import React, { useState } from "react";
import { catalogText, landingText } from "./landing-text";
import { BOOK_PRICES, BOOK_PAGE_OPTIONS, bookPrice } from "./landing-catalog";
import "./landing-configurator.css";

export function BookConfigurator({
  language,
  register,
  samplePrefix = "book-classic",
  actionLabel,
}) {
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
          "--page-inset": cover === "hard" ? "9px" : "1px",
        }}
      >
        <div className="lp-book-scene" aria-hidden="true">
          <div className="lp-book-object">
            <div className="lp-book-back" />
            <div className="lp-book-leaves" />
            <div className="lp-book-top" />
            <div className="lp-book-bottom" />
            <div className="lp-book-front">
              <img
                src={`/landing/${samplePrefix}-cover-${language}.webp`}
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
          {actionLabel || t.create}
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
