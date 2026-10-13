import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";

export function AdminAiUsage({ t, language }) {
  const [usage, setUsage] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false);
  const active = useRef(true),
    request = useRef(null);
  async function load() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const next = await api("/admin/ai-usage", { signal: controller.signal });
      if (active.current) {
        setUsage(next);
        setError(false);
      }
    } catch (failure) {
      if (active.current && failure.name !== "AbortError") setError(true);
    } finally {
      request.current = null;
      if (active.current) setLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active.current = false;
      clearInterval(timer);
      request.current?.abort();
    };
  }, []);
  const locale = { ru: "ru-RU", ka: "ka-GE", en: "en-GB" }[language] || "en-GB";
  const number = (value) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const time = (value) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Tbilisi",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  const statuses = {
    processing: t.aiUsageProcessing,
    completed: t.aiUsageCompleted,
    failed: t.aiUsageFailed,
    cancelled: t.aiUsageCancelled,
    interrupted: t.aiUsageInterrupted,
  };
  return (
    <section className="admin-ai-usage" aria-labelledby="ai-usage-heading">
      <div className="ai-usage-heading">
        <div>
          <span className="eyebrow">CLOUDFLARE WORKERS AI</span>
          <h2 id="ai-usage-heading">{t.aiUsageTitle}</h2>
        </div>
        <button className="secondary" disabled={loading} onClick={load}>
          {loading ? t.aiUsageLoading : t.aiUsageRefresh}
        </button>
      </div>
      {error && (
        <p className="error-note" role="alert">
          {t.aiUsageError}
        </p>
      )}
      {!usage && !error && <p role="status">{t.aiUsageLoading}</p>}
      {usage && (
        <>
          <div className="ai-usage-metrics">
            <div>
              <span>{t.aiUsageUsed}</span>
              <strong>{number(usage.used)}</strong>
              <small>neurons</small>
            </div>
            <div>
              <span>{t.aiUsageRemaining}</span>
              <strong>{number(usage.remaining)}</strong>
              <small>
                {t.aiUsageOf} {number(usage.dailyLimit)} neurons
              </small>
            </div>
            <div>
              <span>{t.aiUsageReserved}</span>
              <strong>{number(usage.reserved)}</strong>
              <small>neurons</small>
            </div>
          </div>
          <progress
            className="ai-usage-meter"
            aria-label={t.aiUsageTitle}
            max={usage.dailyLimit}
            value={Math.min(usage.dailyLimit, usage.used + usage.reserved)}
          />
          <p className="small-note">
            {t.aiUsageReset}:{" "}
            <strong>
              {time(usage.resetsAt)} · {t.aiUsageTbilisi}
            </strong>
          </p>
          <p className="small-note">
            {t.aiUsageAllowance
              .replace("{free}", number(usage.cloudflareFreeDaily))
              .replace("{limit}", number(usage.dailyLimit))}
          </p>
          {usage.remaining === 0 && (
            <p className="ai-usage-limit" role="status">
              {t.aiUsageLimitReached}
            </p>
          )}
          {!usage.providerConfigured && (
            <p className="error-note">{t.aiUnavailable}</p>
          )}
          <h3>{t.aiUsageRecent}</h3>
          {usage.recent.length ? (
            <div className="ai-usage-table-wrap">
              <table className="ai-usage-table">
                <thead>
                  <tr>
                    <th>{t.aiUsageTime}</th>
                    <th>{t.aiUsagePhotos}</th>
                    <th>{t.aiUsageCached}</th>
                    <th>{t.aiUsageStatus}</th>
                    <th>neurons</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.recent.map((run) => (
                    <tr key={run.id}>
                      <td>{time(run.startedAt)}</td>
                      <td>{run.photoCount}</td>
                      <td>{run.cachedPhotos}</td>
                      <td>
                        {statuses[run.status] || run.status}
                        {run.errorCode && (
                          <small className="ai-run-error">
                            {run.errorCode}
                            <br />
                            {run.completedPhotos || 0}/{run.photoCount} ·{" "}
                            {run.phase}
                          </small>
                        )}
                      </td>
                      <td>
                        {run.status === "processing"
                          ? "—"
                          : `${run.estimated ? "≈ " : ""}${number(run.neurons)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small-note">{t.aiUsageNoRuns}</p>
          )}
          <p className="small-note ai-usage-note">
            {t.aiUsageScope}{" "}
            <a
              href={usage.cloudflareDashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.aiUsageDashboard} ↗
            </a>
          </p>
        </>
      )}
    </section>
  );
}
