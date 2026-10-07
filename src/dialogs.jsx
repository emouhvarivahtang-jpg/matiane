import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { errorMessage } from "./ui-text";
import { PAGE_COUNTS, FONTS, textColor } from "./model";
import { download } from "./download";
export function Modal({
  label,
  onClose,
  busy = false,
  wide = false,
  children,
}) {
  const ref = useRef(),
    handlers = useRef();
  handlers.current = { onClose, busy };
  useEffect(() => {
    const previous = document.activeElement;
    (
      ref.current.querySelector("textarea, input, select") || ref.current
    ).focus();
    const key = (e) => {
      if (e.key === "Escape" && !handlers.current.busy)
        handlers.current.onClose();
      if (e.key === "Tab") {
        const controls = [
          ...ref.current.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        ];
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? "wide-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2>{label}</h2>
          <button aria-label="Close" disabled={busy} onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function NewBookDialog({ t, onClose, onCreate }) {
  const [count, setCount] = useState(40),
    [title, setTitle] = useState(t.blankBook);
  return (
    <Modal label={t.newProject} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(count, title || t.blankBook);
        }}
      >
        <label>
          {t.rename}
          <input
            autoFocus
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <fieldset>
          <legend>{t.insidePages}</legend>
          <div className="count-options">
            {PAGE_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                className={count === n ? "selected" : ""}
                aria-pressed={count === n}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="small-note">{t.coversSeparate}</p>
        </fieldset>
        <button className="primary full-width" type="submit">
          {t.create}
        </button>
      </form>
    </Modal>
  );
}
export function AuthDialog({ t, onClose, onAuthenticated }) {
  const [mode, setMode] = useState("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recovery, setRecovery] = useState(null),
    [result, setResult] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const value = await api("/auth/" + mode, {
        method: "POST",
        body: { email, password, ...(mode === "recover" ? { code } : {}) },
      });
      if (value.recoveryCode) {
        setRecovery(value.recoveryCode);
        setResult(value);
      } else onAuthenticated(value);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  if (recovery)
    return (
      <Modal label={t.recoveryCode} onClose={() => onAuthenticated(result)}>
        <p>{t.recoveryIntro}</p>
        <pre className="recovery-code">{recovery}</pre>
        <button
          className="secondary full-width"
          onClick={() =>
            download(
              `Matiane\n${email}\n${recovery}\n`,
              "Matiane-recovery.txt",
              "text/plain",
            )
          }
        >
          {t.downloadCode}
        </button>
        <button
          className="primary full-width"
          onClick={() => onAuthenticated(result)}
        >
          {t.continue}
        </button>
      </Modal>
    );
  return (
    <Modal label={t[mode]} onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <label>
          {t.email}
          <input
            autoFocus
            type="email"
            required
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>
        {mode === "recover" && (
          <label>
            {t.recoveryCode}
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </label>
        )}
        <label>
          {t.password}
          <input
            type="password"
            required
            minLength={10}
            maxLength={256}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>
        {error && (
          <p role="alert" className="error-note">
            {error}
          </p>
        )}
        <button className="primary full-width" disabled={busy}>
          {busy ? t.busy : t[mode]}
        </button>
      </form>
      <div className="auth-links">
        {["login", "register", "recover"]
          .filter((m) => m !== mode)
          .map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError("");
              }}
              disabled={busy}
            >
              {t[m]}
            </button>
          ))}
      </div>
    </Modal>
  );
}
export function TextDialog({ page, t, onClose, onApply }) {
  const [draft, setDraft] = useState(page);
  const patch = (next) => setDraft({ ...draft, ...next });
  return (
    <Modal label={t.editText} onClose={onClose}>
      <label>
        {t.captionLabel}
        <textarea
          autoFocus
          rows={5}
          maxLength={1000}
          placeholder={t.captionHint}
          value={draft.caption}
          onChange={(e) => patch({ caption: e.target.value })}
        />
      </label>
      <div className="text-setting-grid">
        <label>
          {t.typography}
          <select
            value={draft.font}
            onChange={(e) => patch({ font: e.target.value })}
          >
            {FONTS.map((f) => (
              <option value={f} key={f}>
                {t[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.fontSize}
          <input
            type="number"
            min={8}
            max={44}
            value={draft.fontSize}
            onChange={(e) => patch({ fontSize: Number(e.target.value) })}
          />
        </label>
        <label>
          {t.textColor}
          <input
            type="color"
            value={textColor(draft)}
            onChange={(e) => patch({ textColor: e.target.value })}
          />
        </label>
        <label>
          {t.alignment}
          <select
            value={draft.align}
            onChange={(e) => patch({ align: e.target.value })}
          >
            {["left", "center", "right"].map((a) => (
              <option value={a} key={a}>
                {t[a]}
              </option>
            ))}
          </select>
        </label>
      </div>
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
            aria-pressed={draft[key]}
            className={draft[key] ? "selected" : ""}
            onClick={() => patch({ [key]: !draft[key] })}
          >
            {label}
          </button>
        ))}
        <button onClick={() => patch({ textColor: null })}>
          {t.automaticColor}
        </button>
      </div>
      <div
        className="caption-sample"
        style={{
          fontFamily:
            draft.font === "serif"
              ? "Noto Serif, Noto Georgian Serif"
              : draft.font === "compact"
                ? "Noto Compact, Noto Georgian Compact"
                : "Noto Sans, Noto Georgian",
          fontWeight: draft.bold ? 700 : 400,
          fontStyle: draft.italic ? "italic" : "normal",
          textDecoration: draft.underline ? "underline" : "none",
          color: textColor(draft),
          background: draft.layout === "full" ? "#30332d" : draft.color,
        }}
      >
        {draft.caption || t.captionHint}
      </div>
      <p className="small-note">{t.captionFit}</p>
      <div className="dialog-actions">
        <button className="secondary" onClick={onClose}>
          {t.cancel}
        </button>
        <button
          className="primary"
          disabled={
            !Number.isFinite(draft.fontSize) ||
            draft.fontSize < 8 ||
            draft.fontSize > 44
          }
          onClick={() => onApply(draft)}
        >
          {t.apply}
        </button>
      </div>
    </Modal>
  );
}
