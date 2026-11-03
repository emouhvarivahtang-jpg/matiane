import React, { useEffect, useRef, useState } from "react";

const controls = {
  ka: { turn: "შემოატრიალეთ წიგნი", front: "ყდა", side: "გვერდიდან", left: "მარცხნივ მობრუნება", right: "მარჯვნივ მობრუნება", view: "წიგნის ხედი" },
  en: { turn: "Drag to turn the book", front: "Cover", side: "Side view", left: "Rotate left", right: "Rotate right", view: "Book view" },
  ru: { turn: "Поверните книгу", front: "Обложка", side: "Сбоку", left: "Повернуть влево", right: "Повернуть вправо", view: "Ракурс книги" },
};

export function BookPreview({ cover, pages, language }) {
  const host = useRef(null), api = useRef(null);
  const latest = useRef({ cover, pages, language });
  latest.current = { cover, pages, language };
  const [state, setState] = useState("poster");
  const [side, setSide] = useState(false);
  const c = controls[language];
  useEffect(() => {
    let disposed = false, started = false;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || started) return;
      started = true;
      observer.disconnect();
      try {
        const { createBookScene } = await import("./landing-book-scene");
        if (disposed) return;
        api.current = createBookScene(host.current, () => { if (!disposed) setState("ready"); }, () => { if (!disposed) setState("fallback"); });
        const value = latest.current;
        api.current.update(value.cover, value.pages, value.language);
      } catch { if (!disposed) setState("fallback"); }
    }, { rootMargin: "200px" });
    observer.observe(host.current);
    return () => { disposed = true; observer.disconnect(); api.current?.dispose(); api.current = null; };
  }, []);
  useEffect(() => { api.current?.update(cover, pages, language); }, [cover, pages, language]);
  function changeView(value) { setSide(value); api.current?.view(value); }
  return (
    <div className="lp-book-viewer" data-renderer={state}>
      <div className="lp-book-scene">
        <img className="lp-book-poster" src={`/landing/models/${cover}-${pages}-${language}.webp`} alt="" width="1000" height="860" loading="lazy" />
        <div className="lp-book-canvas" ref={host} />
        {state === "ready" && (
          <div className="lp-book-view-toggle" role="group" aria-label={c.view}>
            <button type="button" aria-pressed={!side} onClick={() => changeView(false)}>{c.front}</button>
            <button type="button" aria-pressed={side} onClick={() => changeView(true)}>{c.side}</button>
          </div>
        )}
      </div>
      {state === "ready" && (
        <div className="lp-book-turn-controls">
          <span>{c.turn}</span>
          <div>
            <button type="button" aria-label={c.left} onClick={() => api.current?.rotate(-Math.PI/6)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5 4 9l4 4M4 9h9a6 6 0 1 1-5 9" /></svg>
            </button>
            <button type="button" aria-label={c.right} onClick={() => api.current?.rotate(Math.PI/6)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 5 4 4-4 4m4-4h-9a6 6 0 1 0 5 9" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
