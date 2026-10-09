import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { errorMessage } from "./ui-text";
import { PAGE_COUNTS } from "./model";
import { Eye, EyeOff } from "./icons";
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
    [showPassword, setShowPassword] = useState(false),
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
        <label htmlFor="account-password">{t.password}</label>
        <div className="password-field">
          <input
            id="account-password"
            type={showPassword ? "text" : "password"}
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
          <button
            type="button"
            aria-label={showPassword ? t.hidePassword : t.showPassword}
            aria-pressed={showPassword}
            title={showPassword ? t.hidePassword : t.showPassword}
            disabled={busy}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
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
                setShowPassword(false);
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
