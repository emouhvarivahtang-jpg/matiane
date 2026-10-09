import React, { useState, useEffect, useRef } from "react";
import {
  slots,
  captionBox,
  imageRect,
  effectiveDpi,
  textColor,
  pageLabel,
  spreads,
} from "./model";
import { browserCaption, fontFamily } from "./text";
import { pageSize, coverSize, bookFormat, spineTextBox } from "./format";
const pct = (n) => `${n}%`;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function PhotoFrame({
  page,
  slot,
  slotIndex,
  photo,
  t,
  active,
  onSelect,
  onCrop,
  tiny,
  size = { w: 148, h: 210 },
  drawingSlot = slot,
}) {
  const ref = useRef(),
    draft = useRef(page.crops[slotIndex]),
    gesture = useRef(null),
    pointers = useRef(new Map()),
    wheelTimer = useRef();
  const [crop, setCrop] = useState(page.crops[slotIndex]);
  useEffect(() => {
    draft.current = page.crops[slotIndex];
    setCrop(draft.current);
  }, [page.crops, slotIndex]);
  useEffect(() => () => clearTimeout(wheelTimer.current), []);
  const editable = !!onSelect && !!onCrop && !!photo;
  function change(next) {
    const r = imageRect(photo, drawingSlot, next);
    draft.current = { ...next, zoom: r.zoom };
    setCrop(draft.current);
  }
  function zoom(factor) {
    if (!photo) return;
    change({ ...draft.current, zoom: draft.current.zoom * factor });
  }
  function finish() {
    if (!photo) return;
    clearTimeout(wheelTimer.current);
    onCrop?.(draft.current);
  }
  useEffect(() => {
    const el = ref.current;
    if (!editable) return;
    const wheel = (e) => {
      e.preventDefault();
      onSelect(slotIndex);
      zoom(Math.exp(-e.deltaY * 0.002));
      clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(finish, 250);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });
  function begin(e) {
    if (e.target.closest("button")) return;
    onSelect?.(slotIndex);
    if (!editable) return;
    e.preventDefault();
    ref.current.focus({ preventScroll: true });
    ref.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    resetGesture();
  }
  function resetGesture() {
    const values = [...pointers.current.values()];
    gesture.current = {
      crop: { ...draft.current },
      values,
      distance:
        values.length === 2
          ? Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y)
          : 0,
    };
  }
  function move(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current,
      values = [...pointers.current.values()];
    if (values.length === 2) {
      const distance = Math.hypot(
        values[0].x - values[1].x,
        values[0].y - values[1].y,
      );
      change({
        ...g.crop,
        zoom: (g.crop.zoom * distance) / Math.max(g.distance, 1),
      });
      return;
    }
    const rect = imageRect(photo, drawingSlot, g.crop),
      bounds = ref.current.getBoundingClientRect();
    const dx = values[0].x - g.values[0].x,
      dy = values[0].y - g.values[0].y;
    const freeX = (bounds.width * (drawingSlot.w - rect.w)) / slot.w,
      freeY = (bounds.height * (drawingSlot.h - rect.h)) / slot.h;
    change({
      ...g.crop,
      x:
        Math.abs(freeX) > 1
          ? clamp(g.crop.x + (dx / freeX) * 100, 0, 100)
          : g.crop.x,
      y:
        Math.abs(freeY) > 1
          ? clamp(g.crop.y + (dy / freeY) * 100, 0, 100)
          : g.crop.y,
    });
  }
  function end(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) resetGesture();
    else {
      finish();
      gesture.current = null;
    }
  }
  const rect = photo ? imageRect(photo, drawingSlot, crop) : null,
    dpi = photo ? Math.round(effectiveDpi(photo, drawingSlot, crop)) : 0;
  return (
    <div
      ref={ref}
      className={`photo-frame ${active ? "frame-selected" : ""} ${editable ? "crop-enabled" : ""}`}
      style={{
        left: pct((slot.x / size.w) * 100),
        top: pct((slot.y / size.h) * 100),
        width: pct((slot.w / size.w) * 100),
        height: pct((slot.h / size.h) * 100),
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={`${t.frame} ${slotIndex + 1}`}
      onClick={() => onSelect?.(slotIndex)}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDragOver={(e) => onSelect && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onSelect?.(slotIndex, e.dataTransfer.getData("text/matiane-photo"));
      }}
      onKeyDown={(e) => {
        if (!photo) {
          if (["Enter", " "].includes(e.key)) {
            e.preventDefault();
            onSelect?.(slotIndex);
          }
          return;
        }
        const axis = ["ArrowLeft", "ArrowRight"].includes(e.key) ? "x" : "y",
          delta = ["ArrowLeft", "ArrowUp"].includes(e.key) ? -5 : 5;
        if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          change({
            ...draft.current,
            [axis]: clamp(draft.current[axis] + delta, 0, 100),
          });
          finish();
        }
        if (["+", "=", "-"].includes(e.key)) {
          e.preventDefault();
          zoom(e.key === "-" ? 1 / 1.15 : 1.15);
          finish();
        }
      }}
    >
      {photo ? (
        <img
          src={
            tiny
              ? photo.thumbnail ||
                (photo.src.startsWith("/api/photos/")
                  ? photo.src + "?thumbnail=1"
                  : photo.src)
              : photo.src
          }
          alt={photo.name}
          draggable={false}
          style={{
            position: "absolute",
            left: pct(((drawingSlot.x - slot.x + rect.x) / slot.w) * 100),
            top: pct(((drawingSlot.y - slot.y + rect.y) / slot.h) * 100),
            width: pct((rect.w / slot.w) * 100),
            height: pct((rect.h / slot.h) * 100),
          }}
        />
      ) : (
        <div className="empty-frame">{!tiny && <span>{t.empty}</span>}</div>
      )}
      {!tiny && !!onSelect && photo && dpi < 300 && (
        <span
          className={`quality-badge ${dpi < 150 ? "poor" : ""}`}
          title={`${t.printQuality}: ${dpi} DPI. ${t.qualityTarget}`}
          aria-label={`${t.lowRes}: ${dpi} DPI`}
        >
          ⚠ {t.lowRes} · {dpi} DPI
        </span>
      )}
      {active && editable && (
        <div
          className="frame-controls"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            title={t.zoomOut}
            aria-label={t.zoomOut}
            disabled={rect.zoom <= 1}
            onClick={() => {
              zoom(1 / 1.15);
              finish();
            }}
          >
            −
          </button>
          <button
            title={t.zoomIn}
            aria-label={t.zoomIn}
            disabled={rect.zoom >= 5}
            onClick={() => {
              zoom(1.15);
              finish();
            }}
          >
            +
          </button>
          <button
            title={t.reset}
            onClick={() => {
              change({ x: 50, y: 50, zoom: 1 });
              finish();
            }}
          >
            {t.fill}
          </button>
        </div>
      )}
    </div>
  );
}
export function PageCanvas({
  page,
  photos,
  t,
  tiny = false,
  activeFrame = -1,
  onSelect,
  onCrop,
  onText,
  size = { w: 148, h: 210 },
  coverPanel = null,
}) {
  const [layout, setLayout] = useState({
    size: page.fontSize,
    lines: [page.caption],
  });
  useEffect(() => {
    let active = true;
    const update = () => {
      if (active) setLayout(browserCaption(page, size));
    };
    update();
    document.fonts
      .load(
        `${page.italic ? "italic " : ""}${page.bold ? "700" : "400"} ${page.fontSize}px ${fontFamily(page.font, page.georgianFont)}`,
        page.caption || "თბილისი Aa",
      )
      .then(update);
    return () => {
      active = false;
    };
  }, [
    page.caption,
    page.font,
    page.georgianFont,
    page.fontSize,
    page.bold,
    page.italic,
    page.layout,
    size.w,
    size.h,
  ]);
  const wrap = coverPanel?.wrap || 0;
  const display = { w: size.w + wrap, h: size.h + wrap * 2 };
  const shift = { x: coverPanel?.side === 0 ? wrap : 0, y: wrap };
  const box = captionBox(page, size),
    hasText = !!page.caption || !!onText;
  return (
    <div
      className={`book-page ${tiny ? "tiny-page" : ""}`}
      style={{
        background: page.color,
        color: textColor(page),
        aspectRatio: `${display.w}/${display.h}`,
      }}
    >
      {slots(page.layout, size).map((slot, i) => (
        <PhotoFrame
          key={i}
          page={page}
          slot={
            page.layout === "full" && coverPanel
              ? { x: 0, y: 0, w: display.w, h: display.h }
              : { ...slot, x: slot.x + shift.x, y: slot.y + shift.y }
          }
          drawingSlot={
            page.layout === "full" && coverPanel
              ? {
                  x: coverPanel.side === 0 ? -3 : 0,
                  y: -3,
                  w: display.w + 3,
                  h: display.h + 6,
                }
              : { ...slot, x: slot.x + shift.x, y: slot.y + shift.y }
          }
          slotIndex={i}
          photo={photos.find((p) => p.id === page.photos[i])}
          t={t}
          tiny={tiny}
          size={display}
          active={i === activeFrame}
          onSelect={onSelect}
          onCrop={onCrop ? (crop) => onCrop(i, crop) : undefined}
        />
      ))}
      {hasText && (
        <div
          className={`page-caption ${page.layout === "full" && page.caption ? "overlay-caption" : ""} ${onText ? "editable-caption" : ""} ${!page.caption ? "caption-placeholder" : ""}`}
          style={{
            left: pct(((box.x + shift.x) / display.w) * 100),
            top: pct(((box.y + shift.y) / display.h) * 100),
            width: pct((box.w / display.w) * 100),
            height: pct((box.h / display.h) * 100),
            fontSize: `${(layout.size / ((display.w * 72) / 25.4)) * 100}cqw`,
            fontFamily: fontFamily(page.font, page.georgianFont),
            textAlign: page.align,
            fontWeight: page.bold ? 700 : 400,
            fontStyle: page.italic ? "italic" : "normal",
            textDecoration: page.underline ? "underline" : "none",
          }}
          role={onText ? "button" : undefined}
          tabIndex={onText ? 0 : undefined}
          aria-label={t.editText}
          onClick={(e) => {
            e.stopPropagation();
            onText?.();
          }}
          onKeyDown={(e) => {
            if (onText && ["Enter", " "].includes(e.key)) {
              e.preventDefault();
              onText();
            }
          }}
        >
          {page.caption ? layout.lines.join("\n") : t.editText}
        </div>
      )}
    </div>
  );
}
export function Spread({
  book,
  spreadIndex,
  t,
  activeIndex = -1,
  activeFrame = 0,
  onSelect,
  onCrop,
  onText,
  onSpine,
  spineSelected,
}) {
  const pair = spreads(book)[spreadIndex] || spreads(book)[0];
  if (spreadIndex === 0)
    return (
      <CoverSpread
        book={book}
        t={t}
        activeIndex={activeIndex}
        activeFrame={activeFrame}
        onSelect={onSelect}
        onCrop={onCrop}
        onText={onText}
        onSpine={onSpine}
        spineSelected={spineSelected}
      />
    );
  return (
    <div className={`book-spread ${spreadIndex === 0 ? "cover-spread" : ""}`}>
      {pair.map((index, side) =>
        index === null ? (
          <div className="spread-leaf blank-leaf" key={side}>
            <div
              className="book-page"
              style={{
                aspectRatio: `${bookFormat(book).w}/${bookFormat(book).h}`,
              }}
            />
            <span className="leaf-label">{t.insideCover}</span>
          </div>
        ) : (
          <div
            key={book.pages[index].id}
            className={`spread-leaf ${index === activeIndex ? "active-leaf" : ""}`}
            onClick={() => onSelect?.(index)}
          >
            <PageCanvas
              page={book.pages[index]}
              size={pageSize(book, book.pages[index])}
              photos={book.photos}
              t={t}
              activeFrame={index === activeIndex ? activeFrame : -1}
              onSelect={
                onSelect
                  ? (frame, photo) => onSelect(index, frame, photo)
                  : undefined
              }
              onCrop={
                onCrop ? (frame, crop) => onCrop(index, frame, crop) : undefined
              }
              onText={onText ? () => onText(index) : undefined}
            />
            <span className="leaf-label">
              {pageLabel(book.pages[index], index, t)}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function CoverSpread({
  book,
  t,
  activeIndex,
  activeFrame,
  onSelect,
  onCrop,
  onText,
  onSpine,
  spineSelected,
}) {
  const size = coverSize(book),
    spine = book.cover.spine;
  const spineBox = spineTextBox(book);
  const [text, setText] = useState({
    size: spine.fontSize,
    lines: [spine.caption],
  });
  useEffect(() => {
    let alive = true;
    const update = () => {
      if (alive) setText(browserCaption(spine, undefined, spineBox));
    };
    update();
    document.fonts
      .load(
        `${spine.italic ? "italic " : ""}${spine.bold ? "700" : "400"} ${spine.fontSize}px ${fontFamily(spine.font, spine.georgianFont)}`,
        spine.caption || "თბილისი Aa",
      )
      .then(update);
    return () => {
      alive = false;
    };
  }, [spine, size.spine, size.panelH]);
  return (
    <div
      className="book-spread cover-spread complete-cover"
      style={{
        aspectRatio: `${size.w}/${size.h}`,
        "--cover-height": size.panelH,
        background: spine.color,
      }}
    >
      {size.wrap > 0 && (
        <div
          className="cover-wrap-guide"
          style={{
            left: pct((size.wrap / size.w) * 100),
            top: pct((size.wrap / size.h) * 100),
            width: pct(((size.w - size.wrap * 2) / size.w) * 100),
            height: pct(((size.h - size.wrap * 2) / size.h) * 100),
          }}
        />
      )}
      {[book.pages.length - 1, 0].map((index, side) => (
        <div
          key={index}
          className={`spread-leaf ${index === activeIndex && !spineSelected ? "active-leaf" : ""}`}
          style={{
            position: "absolute",
            left: pct(
              ((side === 0 ? 0 : size.wrap + size.panelW + size.spine) /
                size.w) *
                100,
            ),
            top: 0,
            width: pct(((size.panelW + size.wrap) / size.w) * 100),
          }}
          onClick={() => onSelect?.(index)}
        >
          <PageCanvas
            page={book.pages[index]}
            size={pageSize(book, book.pages[index])}
            coverPanel={{ wrap: size.wrap, side }}
            photos={book.photos}
            t={t}
            activeFrame={index === activeIndex ? activeFrame : -1}
            onSelect={
              onSelect
                ? (frame, photo) => onSelect(index, frame, photo)
                : undefined
            }
            onCrop={
              onCrop ? (frame, crop) => onCrop(index, frame, crop) : undefined
            }
            onText={onText ? () => onText(index) : undefined}
          />
          <span className="leaf-label">
            {pageLabel(book.pages[index], index, t)}
          </span>
        </div>
      ))}
      {size.spine > 0 && (
        <div
          className={`cover-spine ${spineSelected ? "selected" : ""}`}
          role={onSpine ? "button" : undefined}
          tabIndex={onSpine ? 0 : undefined}
          aria-label={t.spineText}
          onClick={onSpine}
          onKeyDown={(event) => {
            if (onSpine && ["Enter", " "].includes(event.key)) {
              event.preventDefault();
              onSpine();
            }
          }}
          style={{
            left: pct(((size.wrap + size.panelW) / size.w) * 100),
            top: pct((size.wrap / size.h) * 100),
            width: pct((size.spine / size.w) * 100),
            height: pct((size.panelH / size.h) * 100),
            background: spine.color,
            color: textColor(spine),
          }}
        >
          <span
            className="spine-caption"
            style={{
              width: `${((size.panelH - 20) / size.spine) * 100}%`,
              fontSize: `${((text.size * 25.4) / 72 / size.spine) * 100}cqw`,
              fontFamily: fontFamily(spine.font, spine.georgianFont),
              fontWeight: spine.bold ? 700 : 400,
              fontStyle: spine.italic ? "italic" : "normal",
              textDecoration: spine.underline ? "underline" : "none",
              textAlign: spine.align,
            }}
          >
            {text.lines.join("\n")}
          </span>
          {onSpine && !spine.caption && (
            <span className="spine-placeholder">{t.spine}</span>
          )}
        </div>
      )}
    </div>
  );
}
