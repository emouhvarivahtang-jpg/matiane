import React from "react";
import { FONT_CATALOG, GEORGIAN_FONT_CATALOG, fontDefinition } from "./fonts";
import { textColor } from "./model";

export function TextControls({
  page,
  t,
  onChange,
  textareaRef,
  disabled = false,
}) {
  return (
    <fieldset className="inline-text-controls" disabled={disabled}>
      <legend>{t.editText}</legend>
      <label>
        {t.captionLabel}
        <textarea
          ref={textareaRef}
          rows={4}
          maxLength={1000}
          placeholder={t.captionHint}
          value={page.caption}
          onChange={(event) => onChange({ caption: event.target.value })}
        />
      </label>
      <label>
        {t.typography}
        <select
          aria-label={t.typography}
          value={page.font}
          onChange={(event) => onChange({ font: event.target.value })}
        >
          {!FONT_CATALOG.some((font) => font.id === page.font) && (
            <option value={page.font}>{fontDefinition(page.font).name}</option>
          )}
          {FONT_CATALOG.map((font) => (
            <option key={font.id} value={font.id}>
              {font.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t.georgianTypography}
        <select
          aria-label={t.georgianTypography}
          value={page.georgianFont || ""}
          onChange={(event) =>
            onChange({ georgianFont: event.target.value || null })
          }
        >
          {!page.georgianFont && <option value="">{t.originalGeorgian}</option>}
          {GEORGIAN_FONT_CATALOG.map((font) => (
            <option key={font.id} value={font.id}>
              {font.name}
            </option>
          ))}
        </select>
      </label>
      <div className="text-setting-grid">
        <label>
          {t.fontSize}
          <input
            type="number"
            min={8}
            max={44}
            value={page.fontSize}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value >= 8 && value <= 44) onChange({ fontSize: value });
            }}
          />
        </label>
        <label>
          {t.textColor}
          <input
            type="color"
            value={textColor(page)}
            onChange={(event) => onChange({ textColor: event.target.value })}
          />
        </label>
      </div>
      <label>
        {t.alignment}
        <select
          value={page.align}
          onChange={(event) => onChange({ align: event.target.value })}
        >
          {["left", "center", "right"].map((align) => (
            <option key={align} value={align}>
              {t[align]}
            </option>
          ))}
        </select>
      </label>
      <div className="format-buttons">
        {[
          ["bold", "B"],
          ["italic", "I"],
          ["underline", "U"],
        ].map(([key, label]) => (
          <button
            key={key}
            title={t[key]}
            aria-label={t[key]}
            aria-pressed={page[key]}
            className={page[key] ? "selected" : ""}
            onClick={() => onChange({ [key]: !page[key] })}
          >
            {label}
          </button>
        ))}
        <button onClick={() => onChange({ textColor: null })}>
          {t.automaticColor}
        </button>
      </div>
    </fieldset>
  );
}
