import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Download,
  Upload,
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Eye,
  Undo2,
  Redo2,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Trash2,
} from "./icons";
import {
  PAGE_COUNTS,
  COLORS,
  LAYOUTS,
  CAPACITY,
  newBook,
  demoBook,
  newCrop,
  readPhoto,
  slots,
  darkColor,
  pageLabel,
  spreads,
  resizeBook,
  reorderPage,
  deletePage,
  forkBook,
  validateBook,
  portableBook,
  issues,
  localSaveBook,
  localLoadBook,
  localListBooks,
  localDeleteBook,
  migrateLocalBook,
} from "./model";
import { messages, errorMessage } from "./ui-text";
import { api, CloudWriter } from "./api";
import { FORMATS, bookFormat, pageSize } from "./format";
import { TextControls } from "./text-controls";
import { PageCanvas, Spread } from "./canvas";
import { Modal, AuthDialog, NewBookDialog } from "./dialogs";
import { download } from "./download";
import "./styles.css";
import "./studio.css";
import "./fonts.css";
const SECURE_STUDIO = "https://matiane.57.129.177.67.sslip.io";
const oldOrigin = "http://57.129.177.67";
const accountsAvailable =
  location.protocol === "https:" ||
  ["localhost", "127.0.0.1"].includes(location.hostname);
function IconButton({ title, children, ...props }) {
  return (
    <button className="icon-button" title={title} aria-label={title} {...props}>
      {children}
    </button>
  );
}
function LayoutIcon({ layout }) {
  return (
    <div className={`layout-icon layout-${layout}`}>
      {slots(layout).map((r, i) => (
        <i
          key={i}
          style={{
            left: `${(r.x / 148) * 100}%`,
            top: `${(r.y / 210) * 100}%`,
            width: `${(r.w / 148) * 100}%`,
            height: `${(r.h / 210) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
function App() {
  const [language, setLanguage] = useState(
    () =>
      localStorage.getItem("matiane-language") ||
      (/^ru/.test(navigator.language) ? "ru" : "en"),
  );
  const t = messages[language] || messages.en;
  const [ready, setReady] = useState(false),
    [user, setUser] = useState(null),
    [book, setBook] = useState(null),
    [records, setRecords] = useState([]),
    [cloudBooks, setCloudBooks] = useState([]),
    [adminBooks, setAdminBooks] = useState([]),
    [adminTotal, setAdminTotal] = useState(0),
    [readOnly, setReadOnly] = useState(false),
    [spineSelected, setSpineSelected] = useState(false),
    [storage, setStorage] = useState(0);
  const [index, setIndex] = useState(0),
    [frame, setFrame] = useState(0),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState([]),
    [future, setFuture] = useState([]),
    [localStatus, setLocalStatus] = useState("saved"),
    [cloudStatus, setCloudStatus] = useState(""),
    [cloudError, setCloudError] = useState(null);
  const [unusedOnly, setUnusedOnly] = useState(false),
    [previewIndex, setPreviewIndex] = useState(0),
    [bleed, setBleed] = useState(true),
    [scope, setScope] = useState("all"),
    [pdfLayout, setPdfLayout] = useState("pages"),
    [pdfQuality, setPdfQuality] = useState("source"),
    [accepted, setAccepted] = useState(false),
    [progress, setProgress] = useState(0),
    [versions, setVersions] = useState([]),
    [versionName, setVersionName] = useState("");
  const captionInput = useRef(),
    photoInput = useRef(),
    projectInput = useRef(),
    writer = useRef(null),
    current = useRef(book),
    currentUser = useRef(user),
    localQueue = useRef(Promise.resolve()),
    activeToken = useRef(0);
  current.current = book;
  currentUser.current = user;
  const owner = user?.id || "guest";
  const initial = useRef(false);
  useEffect(() => {
    if (initial.current) return;
    initial.current = true;
    (async () => {
      try {
        await migrateLocalBook();
      } catch {
        setToast(t.storageError);
      }
      try {
        if (accountsAvailable) {
          const session = await api("/session");
          setUser(session.user);
        }
      } catch {}
      setReady(true);
    })();
  }, []);
  async function refresh() {
    try {
      const local = await localListBooks(owner);
      const guest = owner === "guest" ? [] : await localListBooks("guest");
      if (user && accountsAvailable) {
        const remote = await api("/books");
        setCloudBooks(remote.books);
        setStorage(remote.storageUsed);
        if (user.isAdmin) {
          const all = await api("/admin/books");
          setAdminBooks(all.books);
          setAdminTotal(all.total);
        } else {
          setAdminBooks([]);
          setAdminTotal(0);
        }
      } else setCloudBooks([]);
      setRecords([...local, ...guest]);
    } catch (e) {
      setToast(errorMessage(e, t));
    }
  }
  useEffect(() => {
    if (ready && !book) refresh();
    if (!ready || book || !user?.isAdmin) return;
    const timer = setInterval(() => refresh(), 30000);
    return () => clearInterval(timer);
  }, [ready, user, book]);
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem("matiane-language", language);
  }, [language]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  function localSave(snapshot, writeOwner, cloud) {
    localQueue.current = localQueue.current
      .catch(() => {})
      .then(() => localSaveBook(snapshot, writeOwner, cloud));
    return localQueue.current;
  }
  useEffect(() => {
    if (!book || readOnly) return;
    setLocalStatus("saving");
    const snapshot = book,
      w = writer.current,
      token = activeToken.current;
    const timer = setTimeout(() => {
      localSave(snapshot, owner, w ? { ...w.info, pending: true } : null)
        .then(() => {
          if (token === activeToken.current && snapshot === current.current)
            setLocalStatus("saved");
        })
        .catch(() => {
          if (token === activeToken.current) setLocalStatus("unsaved");
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [book, owner, readOnly]);
  async function saveCloud(snapshot = current.current, options = {}) {
    const w = writer.current,
      token = activeToken.current,
      writeOwner = currentUser.current?.id || owner;
    if (!w || !snapshot) return;
    setCloudStatus("savingCloud");
    setCloudError(null);
    try {
      const info = await w.save(snapshot, options);
      await localSave(snapshot, writeOwner, { ...info, pending: false });
      if (token === activeToken.current) {
        setCloudStatus(
          snapshot === current.current ? "cloudSaved" : "savingCloud",
        );
        setCloudError(null);
      }
      return info;
    } catch (e) {
      if (token === activeToken.current) {
        setCloudError(e);
        setCloudStatus("cloudError");
      }
      throw e;
    }
  }
  useEffect(() => {
    if (!book || !user || !writer.current) return;
    setCloudStatus("savingCloud");
    const timer = setTimeout(() => saveCloud(book).catch(() => {}), 2300);
    return () => clearTimeout(timer);
  }, [book, user]);
  useEffect(() => {
    const leave = (e) => {
      if (
        book &&
        !readOnly &&
        (localStatus !== "saved" ||
          (user && cloudStatus !== "cloudSaved") ||
          uploading ||
          busy)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [book, user, localStatus, cloudStatus, uploading, busy, readOnly]);
  useEffect(() => {
    if (!ready || location.origin !== new URL(SECURE_STUDIO).origin) return;
    const receive = async (e) => {
      if (e.origin !== oldOrigin || e.source !== window.opener) return;
      if (e.data?.type === "matiane-ping") {
        e.source.postMessage({ type: "matiane-ready" }, oldOrigin);
        return;
      }
      if (e.data?.type !== "matiane-transfer") return;
      try {
        const imported = forkBook(validateBook(e.data.book));
        await localSaveBook(
          imported,
          currentUser.current?.id || "guest",
          currentUser.current ? { pending: true } : null,
        );
        openBook(imported, null);
        setToast(t.transferDone);
        e.source.postMessage({ type: "matiane-transfer-done" }, oldOrigin);
      } catch {
        setToast(t.importError);
      }
    };
    window.addEventListener("message", receive);
    window.opener?.postMessage({ type: "matiane-ready" }, oldOrigin);
    return () => window.removeEventListener("message", receive);
  }, [ready]);
  function openBook(next, info = null, review = false) {
    next = validateBook(next, { allowCloud: true });
    activeToken.current++;
    writer.current =
      currentUser.current && !review ? new CloudWriter(info) : null;
    setReadOnly(review);
    setSpineSelected(false);
    setBook(next);
    setLanguage(next.language);
    setIndex(0);
    setFrame(0);
    setHistory([]);
    setFuture([]);
    setCloudError(null);
    setCloudStatus(
      info ? "cloudSaved" : currentUser.current ? "savingCloud" : "",
    );
    setModal(null);
  }
  function commit(next) {
    if (busy || readOnly || !current.current) return;
    setHistory((h) => [...h.slice(-29), current.current]);
    setFuture([]);
    setBook(next);
  }
  function patchPage(at, patch) {
    const now = current.current;
    commit({
      ...now,
      pages: now.pages.map((p, i) => (i === at ? { ...p, ...patch } : p)),
    });
  }
  function choosePage(at, slot, photoId) {
    setIndex(at);
    setSpineSelected(false);
    if (slot !== undefined) setFrame(slot);
    if (photoId) assign(photoId, at, slot);
  }
  function assign(id, at = index, slot = frame) {
    const now = current.current,
      p = now.pages[at];
    if (!now.photos.some((p) => p.id === id) || slot >= p.photos.length) return;
    const photos = [...p.photos],
      crops = [...p.crops];
    photos[slot] = id;
    crops[slot] = newCrop();
    patchPage(at, { photos, crops });
  }
  async function leaveEditor() {
    if (uploading || busy) return;
    if (readOnly) {
      setBook(null);
      setReadOnly(false);
      return;
    }
    const snapshot = current.current,
      w = writer.current;
    setBusy(true);
    writer.current = null;
    activeToken.current++;
    let stored = false;
    try {
      await localSave(snapshot, owner, w ? { ...w.info, pending: true } : null);
      stored = true;
    } catch {}
    if (w) {
      try {
        const info = await w.save(snapshot);
        await w.queue;
        stored = true;
        await localSave(snapshot, owner, { ...info, pending: false }).catch(
          () => {},
        );
      } catch {
        setToast(t.cloudError);
      }
    }
    if (stored) setBook(null);
    else {
      writer.current = w;
      setToast(t.storageError);
    }
    setBusy(false);
  }
  async function authenticated(value) {
    setRecords([]);
    setCloudBooks([]);
    setAdminBooks([]);
    setUser(value.user);
    currentUser.current = value.user;
    if (current.current) {
      writer.current = new CloudWriter();
      setCloudStatus("savingCloud");
    }
    setModal(null);
  }
  async function logout() {
    if (busy) return;
    setBusy(true);
    const w = writer.current,
      snapshot = current.current;
    writer.current = null;
    activeToken.current++;
    try {
      if (snapshot && !readOnly) {
        let stored = false;
        try {
          await localSave(
            snapshot,
            owner,
            w ? { ...w.info, pending: true } : null,
          );
          stored = true;
        } catch {}
        if (w) {
          try {
            const info = await w.save(snapshot);
            await w.queue;
            stored = true;
            await localSave(snapshot, owner, { ...info, pending: false }).catch(
              () => {},
            );
          } catch {}
        }
        if (!stored) throw new Error("unsaved");
      }
      await api("/auth/logout", { method: "POST" });
      setBook(null);
      setUser(null);
      setRecords([]);
      setCloudBooks([]);
      setAdminBooks([]);
      setReadOnly(false);
      setModal(null);
    } catch (e) {
      writer.current = w;
      setToast(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function openRecord(record) {
    setBusy(true);
    try {
      const r = await localLoadBook(record.id, record.owner);
      if (!r) throw new Error("missing");
      const info =
        r.owner === owner
          ? r.cloud?.id
            ? { id: r.cloud.id, revision: r.cloud.revision }
            : null
          : null;
      openBook(r.book, info);
    } catch (e) {
      setToast(t.importError);
    } finally {
      setBusy(false);
    }
  }
  async function openCloud(record, latest = false) {
    setBusy(true);
    try {
      if (record.ownerId && record.ownerId !== user.id) {
        const value = await api("/admin/books/" + record.id);
        openBook(validateBook(value.book, { allowCloud: true }), null, true);
        return;
      }
      const local = records.find(
        (r) => r.owner === owner && r.cloud?.id === record.id,
      );
      if (local?.cloud.pending && !latest) return await openRecord(local);
      const value = await api("/books/" + record.id);
      openBook(validateBook(value.book, { allowCloud: true }), {
        id: value.id,
        revision: value.revision,
      });
    } catch (e) {
      setToast(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function deleteRecord(record, remote) {
    if (!window.confirm(t.deleteConfirm)) return;
    setBusy(true);
    try {
      if (remote) {
        await api("/books/" + record.id, { method: "DELETE" });
        for (const local of records.filter(
          (r) => r.owner === owner && r.cloud?.id === record.id,
        ))
          await localDeleteBook(local.id, owner);
      } else await localDeleteBook(record.id, record.owner);
      await refresh();
    } catch (e) {
      setToast(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function duplicateRecord(record, remote) {
    setBusy(true);
    try {
      if (remote && record.ownerId && record.ownerId !== user.id) {
        const value = await api("/admin/books/" + record.id + "/copy", {
          method: "POST",
          body: {},
        });
        openBook(validateBook(value.book, { allowCloud: true }), {
          id: value.id,
          revision: value.revision,
        });
        return;
      }
      const source = remote
        ? (await api("/books/" + record.id)).book
        : (await localLoadBook(record.id, record.owner)).book;
      openBook(forkBook(source, source.title + " · " + t.duplicateBook));
    } catch (e) {
      setToast(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function upload(files) {
    if (uploading || readOnly || !files?.length) return;
    setUploading(true);
    const token = activeToken.current,
      available = 200 - book.photos.length,
      additions = [];
    let failed = false;
    for (const file of [...files].slice(0, available)) {
      try {
        additions.push(await readPhoto(file));
      } catch {
        failed = true;
      }
    }
    if (token === activeToken.current && additions.length)
      commit({
        ...current.current,
        photos: [...current.current.photos, ...additions],
      });
    setUploading(false);
    setToast(
      files.length > available
        ? t.photoLimit
        : failed
          ? t.uploadError
          : t.uploaded,
    );
  }
  function removePhoto(id) {
    const now = current.current;
    if (
      now.pages.some((p) => p.photos.includes(id)) &&
      !window.confirm(t.removeConfirm)
    )
      return;
    commit({
      ...now,
      photos: now.photos.filter((p) => p.id !== id),
      pages: now.pages.map((p) => ({
        ...p,
        photos: p.photos.map((v) => (v === id ? null : v)),
      })),
    });
  }
  function fill() {
    const now = current.current,
      used = new Set(now.pages.flatMap((p) => p.photos)),
      unused = now.photos.filter((p) => !used.has(p.id));
    let cursor = 0;
    const pages = now.pages.map((p) => ({
      ...p,
      photos: p.photos.map((id) => id || unused[cursor++]?.id || null),
    }));
    if (!unused.length) {
      setToast(t.noFill);
      return;
    }
    commit({ ...now, pages });
    setToast(t.fillDone);
  }
  async function changeCount(count) {
    if (readOnly || count === book.pageCount) return;
    setBusy(true);
    try {
      if (count < book.pageCount) {
        if (!window.confirm(t.shrinkConfirm)) return;
        const backup = forkBook(
          book,
          (book.title + " · " + t.backup).slice(0, 100),
        );
        if (user) {
          const w = new CloudWriter();
          const info = await w.save(backup, {
            checkpoint: true,
            label: t.backup,
          });
          await localSave(backup, owner, { ...info, pending: false });
        } else await localSave(backup, owner, null);
      }
      commit(resizeBook(book, count));
      setIndex((i) => Math.min(i, count + 1));
    } catch (e) {
      setToast(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  function move(from, to) {
    if (readOnly) return;
    const now = current.current,
      pages = reorderPage(now, from, to);
    if (pages === now) return;
    const selectedId = now.pages[index].id;
    commit(pages);
    setIndex(pages.pages.findIndex((p) => p.id === selectedId));
  }
  function removePage() {
    if (readOnly) return;
    const now = current.current;
    if (
      now.pages[index].kind !== "page" ||
      !window.confirm(t.deletePageConfirm)
    )
      return;
    commit(deletePage(now, index));
    setFrame(0);
  }
  function undo() {
    if (readOnly || !history.length) return;
    setFuture((f) => [...f, book]);
    setBook(history.at(-1));
    setIndex((i) => Math.min(i, history.at(-1).pages.length - 1));
    setHistory((h) => h.slice(0, -1));
  }
  function redo() {
    if (readOnly || !future.length) return;
    setHistory((h) => [...h, book]);
    setBook(future.at(-1));
    setIndex((i) => Math.min(i, future.at(-1).pages.length - 1));
    setFuture((f) => f.slice(0, -1));
  }
  const filename = () =>
    (book?.title || "Matiane")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
      .slice(0, 80) || "Matiane";
  async function saveProject() {
    setBusy(true);
    try {
      download(
        JSON.stringify(await portableBook(book)),
        filename() + ".matiane.json",
        "application/json",
      );
      setToast(t.projectSaved);
    } catch {
      setToast(t.exportError);
    } finally {
      setBusy(false);
    }
  }
  async function importProject(file) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error("size");
      const imported = forkBook(validateBook(JSON.parse(await file.text())));
      openBook(imported);
      setToast(t.loaded);
    } catch {
      setToast(t.importError);
    } finally {
      setBusy(false);
    }
  }
  async function transfer() {
    const popup = window.open(SECURE_STUDIO + "/?transfer=1", "matiane-secure");
    if (!popup) {
      await saveProject();
      setToast(t.transferFailed);
      return;
    }
    setBusy(true);
    try {
      const snapshot = await portableBook(book);
      const ack = await new Promise((resolve) => {
        let sent = false;
        const receive = (e) => {
          if (e.origin !== new URL(SECURE_STUDIO).origin || e.source !== popup)
            return;
          if (e.data?.type === "matiane-ready" && !sent) {
            sent = true;
            popup.postMessage(
              { type: "matiane-transfer", book: snapshot },
              new URL(SECURE_STUDIO).origin,
            );
          }
          if (e.data?.type === "matiane-transfer-done") {
            clearTimeout(timeout);
            window.removeEventListener("message", receive);
            resolve(true);
          }
        };
        const timeout = setTimeout(() => {
          window.removeEventListener("message", receive);
          resolve(false);
        }, 20000);
        window.addEventListener("message", receive);
        popup.postMessage(
          { type: "matiane-ping" },
          new URL(SECURE_STUDIO).origin,
        );
      });
      if (!ack) {
        download(
          JSON.stringify(snapshot),
          filename() + ".matiane.json",
          "application/json",
        );
        setToast(t.transferFailed);
      } else setToast(t.transferDone);
    } catch {
      setToast(t.error);
    } finally {
      setBusy(false);
    }
  }
  async function showVersions() {
    if (!user) {
      setModal("auth");
      return;
    }
    setBusy(true);
    try {
      const info = await saveCloud();
      const result = await api("/books/" + info.id + "/versions");
      setVersions(result.versions);
      setModal("versions");
    } catch (e) {
      setToast(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function checkpoint() {
    setBusy(true);
    try {
      await saveCloud(book, { checkpoint: true, label: versionName });
      setToast(t.versionSaved);
      setVersionName("");
      const result = await api(
        "/books/" + writer.current.info.id + "/versions",
      );
      setVersions(result.versions);
    } catch (e) {
      setToast(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function restore(revision) {
    if (!window.confirm(t.restoreConfirm)) return;
    setBusy(true);
    try {
      const info = await saveCloud();
      const value = await api("/books/" + info.id + "/versions/" + revision, {
        method: "POST",
        body: { baseVersion: info.revision },
      });
      openBook(value.book, { id: value.id, revision: value.revision });
      setToast(t.restoredDone);
    } catch (e) {
      setToast(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function print() {
    setBusy(true);
    setProgress(0);
    try {
      const { exportPdf } = await import("./pdf");
      download(
        await exportPdf(
          book,
          { bleed, scope, layout: pdfLayout, quality: pdfQuality },
          setProgress,
        ),
        filename() +
          `-${bookFormat(book).w}x${bookFormat(book).h}mm-${pdfLayout}-${scope}-${pdfQuality}.pdf`,
        "application/pdf",
      );
      setModal(null);
      setToast(t.done);
    } catch {
      setToast(t.exportError);
    } finally {
      setBusy(false);
    }
  }
  const spreadList = book ? spreads(book) : [],
    spreadIndex = book
      ? spreadList.findIndex((pair) => pair.includes(index))
      : 0,
    page = book?.pages[index],
    warnings = book ? issues(book, scope) : [];
  const format = book ? bookFormat(book) : FORMATS.portrait;
  function patchCover(patch) {
    commit({
      ...current.current,
      cover: { ...current.current.cover, ...patch },
    });
  }
  function focusText(at, spine = false) {
    setIndex(at);
    setSpineSelected(spine);
    requestAnimationFrame(() => {
      captionInput.current?.focus();
      captionInput.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }
  const usage = book
    ? new Map(
        book.photos.map((p) => [
          p.id,
          book.pages.reduce(
            (sum, page) => sum + page.photos.filter((id) => id === p.id).length,
            0,
          ),
        ]),
      )
    : new Map();
  if (!ready)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        {t.loading}
      </div>
    );
  const header = (
    <header className="site-header">
      <button
        className="brand"
        onClick={() => book && leaveEditor()}
        disabled={busy || uploading}
      >
        <span className="brand-mark">
          m<span>✳</span>
        </span>
        <span>
          {language === "ka" ? "მატიანე" : "matiane"}
          <small>{t.tagline}</small>
        </span>
      </button>
      <div className="header-actions">
        <div className="language-switch" aria-label="Language">
          {[
            ["en", "EN"],
            ["ka", "ქარ"],
            ["ru", "RU"],
          ].map(([lang, label]) => (
            <button
              key={lang}
              aria-pressed={language === lang}
              className={language === lang ? "active" : ""}
              onClick={() => {
                setLanguage(lang);
                if (book) setBook({ ...book, language: lang });
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {user ? (
          <button
            className="text-button account-email"
            onClick={() => setModal("account")}
          >
            {user.email}
          </button>
        ) : (
          <button
            className="secondary"
            onClick={() =>
              accountsAvailable
                ? setModal("auth")
                : window.open(SECURE_STUDIO, "_blank", "noopener")
            }
          >
            {accountsAvailable ? t.account : t.secureVersion}
          </button>
        )}
        {book && (
          <button
            className="primary export-top"
            disabled={busy || uploading}
            onClick={() => {
              setAccepted(false);
              setScope("all");
              setModal("export");
            }}
          >
            <Download size={15} />
            {t.export}
          </button>
        )}
      </div>
    </header>
  );
  return (
    <>
      {header}
      {!book ? (
        <main className="cabinet">
          <div className="cabinet-heading">
            <div>
              <span className="eyebrow">MATIANE</span>
              <h1>{t.myBooks}</h1>
              <p>{t.welcome}</p>
            </div>
            <div className="cabinet-actions">
              <button
                className="secondary"
                onClick={() => projectInput.current.click()}
                disabled={busy}
              >
                {t.openProject}
              </button>
              <button
                className="primary"
                onClick={() => setModal("new")}
                disabled={busy}
              >
                <Plus size={16} />
                {t.newProject}
              </button>
            </div>
          </div>
          {!user && (
            <div className="account-invitation">
              <p>{t.signInHint}</p>
              <button
                className="text-button"
                onClick={() =>
                  accountsAvailable
                    ? setModal("auth")
                    : window.open(SECURE_STUDIO, "_blank", "noopener")
                }
              >
                {accountsAvailable ? t.account : t.secureVersion} →
              </button>
            </div>
          )}
          {user && (
            <p className="small-note">
              {t.cloudBooks} · {Math.round(storage / 1024 / 1024)} / 1024 MB
            </p>
          )}
          {user?.isAdmin && (
            <section className="admin-books">
              <h2>
                {t.adminBooks} · {adminTotal}
              </h2>
              <p className="small-note">{t.adminBooksHint}</p>
              <div className="book-grid">
                {adminBooks.map((record) => (
                  <BookCard
                    key={record.id}
                    record={record}
                    cover={record.cover}
                    t={t}
                    onOpen={() => openCloud(record)}
                    onCopy={() => duplicateRecord(record, true)}
                    busy={busy}
                  />
                ))}
              </div>
              {adminBooks.length < adminTotal && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const value = await api(
                        "/admin/books?offset=" + adminBooks.length,
                      );
                      setAdminBooks((books) => [...books, ...value.books]);
                      setAdminTotal(value.total);
                    } catch (error) {
                      setToast(errorMessage(error, t));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t.loadMore}
                </button>
              )}
            </section>
          )}
          {cloudBooks.length > 0 && (
            <section className="cloud-books">
              <h2>{t.cloudBooks}</h2>
              <div className="book-grid">
                {cloudBooks.map((r) => (
                  <BookCard
                    key={r.id}
                    t={t}
                    record={r}
                    cover={r.cover}
                    onOpen={() => openCloud(r)}
                    onDelete={() => deleteRecord(r, true)}
                    onCopy={() => duplicateRecord(r, true)}
                    busy={busy}
                  />
                ))}
              </div>
            </section>
          )}
          <section className="local-books">
            <h2>{t.localBooks}</h2>
            <div className="book-grid">
              {records
                .filter(
                  (r) =>
                    r.owner === "guest" ||
                    !r.cloud?.id ||
                    !cloudBooks.some((c) => c.id === r.cloud.id),
                )
                .map((r) => (
                  <BookCard
                    key={r.owner + ":" + r.id}
                    t={t}
                    cover={r.cover}
                    record={{
                      ...r,
                      title: r.book.title,
                      pageCount: r.book.pageCount,
                    }}
                    onOpen={() => openRecord(r)}
                    onDelete={() => deleteRecord(r, false)}
                    onCopy={() => duplicateRecord(r, false)}
                    busy={busy}
                  />
                ))}
            </div>
          </section>
          {!cloudBooks.length && !records.length && (
            <div className="empty-cabinet">
              <span>✳</span>
              <p>{t.emptyDashboard}</p>
              <button
                className="secondary"
                onClick={() => openBook(demoBook(language))}
              >
                {t.demo}
              </button>
            </div>
          )}
        </main>
      ) : (
        <>
          <div className="project-bar">
            <div className="project-heading">
              <button
                className="text-button back-books"
                onClick={leaveEditor}
                disabled={busy || uploading}
              >
                ← {t.myBooks}
              </button>
              <div className="book-title-row">
                <input
                  aria-label={t.untitled}
                  value={book.title}
                  maxLength={100}
                  disabled={readOnly}
                  onChange={(e) => commit({ ...book, title: e.target.value })}
                />
                <span className="format-pill">{format.label}</span>
              </div>
            </div>
            <div className="project-tools">
              <label className="page-count-control">
                {t.insidePages}
                <select
                  aria-label={t.insidePages}
                  value={book.pageCount}
                  onChange={(e) => changeCount(Number(e.target.value))}
                  disabled={busy || uploading || readOnly}
                >
                  {PAGE_COUNTS.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <small>{t.coversSeparate}</small>
              </label>
              <IconButton
                title={t.undo}
                disabled={!history.length || busy || uploading}
                onClick={undo}
              >
                <Undo2 size={16} />
              </IconButton>
              <IconButton
                title={t.redo}
                disabled={!future.length || busy || uploading}
                onClick={redo}
              >
                <Redo2 size={16} />
              </IconButton>
              <button
                className="text-button"
                onClick={() => {
                  setPreviewIndex(spreadIndex);
                  setModal("preview");
                }}
              >
                <Eye size={16} />
                {t.preview}
              </button>
            </div>
          </div>
          <div className="save-bar">
            {readOnly && <strong>{t.adminReview}</strong>}
            {!readOnly && (
              <span className={cloudError ? "error-note" : ""}>
                {t[user ? cloudStatus || "savingCloud" : localStatus]}
              </span>
            )}
            {user && !readOnly ? (
              <>
                <button
                  onClick={showVersions}
                  disabled={busy || uploading || readOnly}
                >
                  {t.versions}
                </button>
                {cloudError && (
                  <button
                    onClick={() => saveCloud().catch(() => {})}
                    disabled={busy}
                  >
                    {t.retry}
                  </button>
                )}
              </>
            ) : (
              !readOnly && (
                <button
                  onClick={() =>
                    accountsAvailable ? setModal("auth") : transfer()
                  }
                  disabled={busy || uploading || readOnly}
                >
                  {accountsAvailable ? t.saveOnline : t.transfer}
                </button>
              )
            )}
            <button onClick={saveProject} disabled={busy || uploading}>
              {t.saveProject}
            </button>
            <button
              onClick={() => projectInput.current.click()}
              disabled={busy || uploading || readOnly}
            >
              {t.openProject}
            </button>
          </div>
          {cloudError?.code === "version_conflict" && (
            <div className="conflict-banner">
              <p>{t.conflict}</p>
              <button
                className="secondary"
                onClick={() => openCloud({ id: writer.current.info.id }, true)}
              >
                {t.openLatest}
              </button>
              <button
                className="primary"
                onClick={() => openBook(forkBook(book))}
              >
                {t.saveCopy}
              </button>
            </div>
          )}
          <main className="studio-grid">
            <aside className="photo-panel">
              <div className="panel-heading">
                <h2>{t.photos}</h2>
                <p>{t.photoIntro}</p>
              </div>
              <button
                className="upload-zone"
                disabled={busy || uploading || readOnly}
                onClick={() => photoInput.current.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  upload(e.dataTransfer.files);
                }}
              >
                <span className="upload-icon">
                  {uploading ? <LoaderCircle className="spin" /> : <Upload />}
                </span>
                <strong>{uploading ? t.uploadBusy : t.upload}</strong>
                <small>{t.uploadHint}</small>
              </button>
              <div className="library-heading">
                <h3>{t.library}</h3>
                <span>{book.photos.length}</span>
              </div>
              <p className="placement-hint">{t.placeHint}</p>
              <label className="unused-filter">
                <input
                  type="checkbox"
                  checked={unusedOnly}
                  onChange={(e) => setUnusedOnly(e.target.checked)}
                />
                {t.unused}
              </label>
              <div className="photo-library">
                {book.photos
                  .filter((p) => !unusedOnly || !usage.get(p.id))
                  .map((photo) => (
                    <div
                      className={`library-photo ${page.photos.includes(photo.id) ? "in-page" : ""}`}
                      key={photo.id}
                    >
                      <button
                        aria-label={`${t.photos}: ${photo.name}`}
                        title={photo.name}
                        onClick={() => assign(photo.id)}
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/matiane-photo", photo.id)
                        }
                      >
                        <img
                          src={
                            photo.thumbnail ||
                            (photo.src.startsWith("/api/photos/")
                              ? photo.src + "?thumbnail=1"
                              : photo.src)
                          }
                          alt={photo.name}
                          loading="lazy"
                        />
                        {usage.get(photo.id) > 0 && (
                          <span className="photo-used">
                            ✓ {t.used} {usage.get(photo.id)}
                          </span>
                        )}
                        {photo.demo && <span className="demo-tag">DEMO</span>}
                      </button>
                      <button
                        className="remove-photo"
                        aria-label={`${t.removePhoto}: ${photo.name}`}
                        onClick={() => removePhoto(photo.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
              <button
                className="secondary fill-button"
                onClick={fill}
                disabled={!book.photos.length || uploading || busy}
              >
                {t.autoFill}
              </button>
              <p className="privacy-note">
                {user ? t.privacyCloud : t.privacy}
              </p>
              {book.photos.some((p) => p.demo) && (
                <p className="small-note">
                  <a href="/photos/SOURCES.md" target="_blank" rel="noreferrer">
                    {t.samples}
                  </a>{" "}
                  · {t.sampleHint}
                </p>
              )}
            </aside>
            <section className="workspace" aria-label={t.studio}>
              <div className="canvas-toolbar">
                <span>
                  {spreadIndex === 0
                    ? t.coverSpread
                    : `${t.spread} ${spreadIndex} / ${spreadList.length - 1}`}
                </span>
                <span>{pageLabel(page, index, t)}</span>
              </div>
              <div className="canvas-stage">
                <div className="spread-navigation">
                  <IconButton
                    title={t.prev}
                    disabled={spreadIndex === 0}
                    onClick={() =>
                      choosePage(
                        spreadList[spreadIndex - 1].find((v) => v !== null),
                      )
                    }
                  >
                    <ChevronLeft />
                  </IconButton>
                  <Spread
                    book={book}
                    spreadIndex={spreadIndex}
                    t={t}
                    activeIndex={index}
                    activeFrame={frame}
                    onSelect={choosePage}
                    onCrop={
                      readOnly
                        ? undefined
                        : (at, slot, crop) => {
                            const crops = [...current.current.pages[at].crops];
                            crops[slot] = crop;
                            patchPage(at, { crops });
                          }
                    }
                    onText={readOnly ? undefined : (at) => focusText(at)}
                    onSpine={readOnly ? undefined : () => focusText(0, true)}
                    spineSelected={spineSelected}
                  />
                  <IconButton
                    title={t.next}
                    disabled={spreadIndex === spreadList.length - 1}
                    onClick={() =>
                      choosePage(
                        spreadList[spreadIndex + 1].find((v) => v !== null),
                      )
                    }
                  >
                    <ChevronRight />
                  </IconButton>
                </div>
                <p className="crop-instruction">{t.cropHint}</p>
                <div className="canvas-footer">
                  {format.label} · {t.portrait}
                </div>
              </div>
              <div className="filmstrip-section">
                <div className="filmstrip-heading">
                  <span>
                    {book.pageCount} {t.pages} {t.coversSeparate}
                  </span>
                  <div>
                    <button
                      className="delete-page-button"
                      disabled={page.kind !== "page" || busy}
                      title={
                        page.kind !== "page" ? t.coverLocked : t.deletePage
                      }
                      onClick={removePage}
                    >
                      <Trash2 size={14} />
                      {t.deletePage}
                    </button>
                    <IconButton
                      title={t.moveLeft}
                      disabled={readOnly || index <= 1 || index > book.pageCount}
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowLeft size={14} />
                    </IconButton>
                    <IconButton
                      title={t.moveRight}
                      disabled={readOnly || index < 1 || index >= book.pageCount}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowRight size={14} />
                    </IconButton>
                    <label className="move-to">
                      {t.moveTo}
                      <input
                        type="number"
                        min={1}
                        max={book.pageCount}
                        key={page.id + "-" + index}
                        defaultValue={
                          index >= 1 && index <= book.pageCount ? index : ""
                        }
                        disabled={readOnly || page.kind !== "page"}
                        onBlur={(e) => {
                          const to = Number(e.target.value);
                          if (
                            Number.isInteger(to) &&
                            to >= 1 &&
                            to <= book.pageCount
                          )
                            move(index, to);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.target.blur();
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div className="filmstrip">
                  {book.pages.map((p, i) => (
                    <button
                      key={p.id}
                      className={`page-thumb ${index === i ? "selected" : ""} ${p.kind !== "page" ? "cover-thumb" : ""}`}
                      aria-label={pageLabel(p, i, t)}
                      aria-pressed={index === i}
                      onClick={() => choosePage(i, 0)}
                      draggable={!readOnly && p.kind === "page"}
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/matiane-page", p.id)
                      }
                      onDragOver={(e) => {
                        if (p.kind === "page") e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = book.pages.findIndex(
                          (p) =>
                            p.id ===
                            e.dataTransfer.getData("text/matiane-page"),
                        );
                        move(from, i);
                      }}
                    >
                      <div className="thumbnail-paper">
                        <PageCanvas
                          page={p}
                          photos={book.photos}
                          t={t}
                          size={pageSize(book, p)}
                          tiny
                        />
                      </div>
                      <span>{pageLabel(p, i, t)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <aside className="design-panel">
              <div className="panel-heading">
                <h2>{t.styleTitle}</h2>
                <p>{pageLabel(page, index, t)}</p>
              </div>
              <div className="editor-mode-switch">
                <button
                  className={page.kind !== "page" ? "selected" : ""}
                  onClick={() => choosePage(0)}
                >
                  {t.coverEditor}
                </button>
                <button
                  className={page.kind === "page" ? "selected" : ""}
                  onClick={() =>
                    choosePage(Math.max(1, Math.min(book.pageCount, index)))
                  }
                >
                  {t.insidePages}
                </button>
              </div>
              <fieldset disabled={readOnly} className="design-fields">
                <label className="format-control">
                  {t.bookSize}
                  <select
                    aria-label={t.bookSize}
                    value={book.format || "a5"}
                    onChange={(event) =>
                      commit({ ...book, format: event.target.value })
                    }
                  >
                    {Object.entries(FORMATS).map(([id, dimensions]) => (
                      <option key={id} value={id}>
                        {dimensions.label}
                      </option>
                    ))}
                  </select>
                </label>
                {page.kind !== "page" && (
                  <div className="cover-settings">
                    <p>
                      {t.coverSize} · {format.coverW / 10} ×{" "}
                      {format.coverH / 10} cm
                    </p>
                    <label>
                      {t.spineWidth}
                      <input
                        type="number"
                        min={0}
                        max={60}
                        step={0.5}
                        value={book.cover.spineWidth}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (
                            Number.isFinite(value) &&
                            value >= 0 &&
                            value <= 60
                          )
                            patchCover({ spineWidth: value });
                        }}
                      />
                    </label>
                    <label>
                      {t.coverWrap}
                      <input
                        type="number"
                        min={0}
                        max={30}
                        step={0.5}
                        value={book.cover.wrap}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (
                            Number.isFinite(value) &&
                            value >= 0 &&
                            value <= 30
                          )
                            patchCover({ wrap: value });
                        }}
                      />
                    </label>
                    <button
                      className="secondary full-width"
                      onClick={() => focusText(0, true)}
                    >
                      {t.spineText}
                    </button>
                    <p className="small-note">{t.spineHint}</p>
                  </div>
                )}
                {!spineSelected && (
                  <div className="control-section">
                    <h3>{t.pageLayout}</h3>
                    <div className="layout-grid">
                      {LAYOUTS.map((layout) => (
                        <button
                          key={layout}
                          className={`layout-choice ${page.layout === layout ? "selected" : ""}`}
                          aria-pressed={page.layout === layout}
                          onClick={() => {
                            patchPage(index, {
                              layout,
                              photos: Array.from(
                                { length: CAPACITY[layout] },
                                (_, i) => page.photos[i] || null,
                              ),
                              crops: Array.from(
                                { length: CAPACITY[layout] },
                                (_, i) => page.crops[i] || newCrop(),
                              ),
                            });
                            setFrame(0);
                          }}
                        >
                          <LayoutIcon layout={layout} />
                          <span>{t[layout]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="control-section">
                  <h3>{t.pageColor}</h3>
                  <div className="swatches">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        style={{ background: color }}
                        aria-label={`${t.pageColor} ${color}`}
                        aria-pressed={
                          (spineSelected
                            ? book.cover.spine.color
                            : page.color) === color
                        }
                        className={
                          (spineSelected
                            ? book.cover.spine.color
                            : page.color) === color
                            ? "selected"
                            : ""
                        }
                        onClick={() =>
                          spineSelected
                            ? patchCover({
                                spine: { ...book.cover.spine, color },
                              })
                            : patchPage(index, { color })
                        }
                      >
                        {(spineSelected
                          ? book.cover.spine.color
                          : page.color) === color && (
                          <Check
                            size={15}
                            color={darkColor(color) ? "white" : "#454b40"}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="control-section">
                  <TextControls
                    page={spineSelected ? book.cover.spine : page}
                    t={t}
                    textareaRef={captionInput}
                    disabled={readOnly}
                    onChange={(patch) =>
                      spineSelected
                        ? patchCover({
                            spine: { ...book.cover.spine, ...patch },
                          })
                        : patchPage(index, patch)
                    }
                  />
                  <p className="small-note">{t.cropHint}</p>
                  <p className="small-note">{t.qualityTarget}</p>
                </div>
              </fieldset>
              <div className="design-footer">
                <span>✳</span>
                <p>{t.tagline}</p>
              </div>
            </aside>
          </main>
        </>
      )}
      <footer className="legal-footer">
        <a href="/licenses/NOTICE.txt" target="_blank" rel="noreferrer">
          {language === "ru"
            ? "Лицензии ресурсов"
            : language === "ka"
              ? "რესურსების ლიცენზიები"
              : "Resource licenses"}
        </a>
      </footer>
      <input
        hidden
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        ref={photoInput}
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        hidden
        type="file"
        accept=".json,.matiane"
        ref={projectInput}
        onChange={(e) => {
          importProject(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label={t.close} onClick={() => setToast("")}>
            ×
          </button>
        </div>
      )}
      {modal === "new" && (
        <NewBookDialog
          t={t}
          onClose={() => setModal(null)}
          onCreate={(count, title) => openBook(newBook(count, title, language))}
        />
      )}
      {modal === "auth" && (
        <AuthDialog
          t={t}
          onClose={() => setModal(null)}
          onAuthenticated={authenticated}
        />
      )}
      {modal === "account" && (
        <Modal label={t.myBooks} onClose={() => setModal(null)} busy={busy}>
          <p>{user.email}</p>
          <button
            className="secondary full-width"
            disabled={busy}
            onClick={logout}
          >
            {t.logout}
          </button>
        </Modal>
      )}
      {modal === "preview" && book && (
        <Modal wide label={t.previewTitle} onClose={() => setModal(null)}>
          <div className="spread-navigation preview-navigation">
            <IconButton
              title={t.prev}
              disabled={previewIndex === 0}
              onClick={() => setPreviewIndex(previewIndex - 1)}
            >
              <ChevronLeft />
            </IconButton>
            <Spread book={book} spreadIndex={previewIndex} t={t} />
            <IconButton
              title={t.next}
              disabled={previewIndex === spreadList.length - 1}
              onClick={() => setPreviewIndex(previewIndex + 1)}
            >
              <ChevronRight />
            </IconButton>
          </div>
        </Modal>
      )}
      {modal === "versions" && (
        <Modal label={t.versions} onClose={() => setModal(null)} busy={busy}>
          <label>
            {t.versionName}
            <input
              maxLength={100}
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
            />
          </label>
          <button
            className="primary full-width"
            disabled={busy}
            onClick={checkpoint}
          >
            {t.saveVersion}
          </button>
          <div className="version-list">
            {versions.map((v) => (
              <div key={v.revision}>
                <div>
                  <strong>
                    {v.label ||
                      t[
                        v.kind === "manual"
                          ? "manual"
                          : v.kind === "restore"
                            ? "restored"
                            : "automatic"
                      ]}{" "}
                    · #{v.revision}
                  </strong>
                  <small>
                    {new Date(v.createdAt).toLocaleString(language)}
                  </small>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => restore(v.revision)}
                >
                  {t.restore}
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {modal === "export" && book && (
        <Modal label={t.printTitle} onClose={() => setModal(null)} busy={busy}>
          <p className="modal-intro">{t.printIntro}</p>
          <label>
            {t.pdfQuality}
            <select
              value={pdfQuality}
              disabled={busy}
              onChange={(e) => setPdfQuality(e.target.value)}
            >
              <option value="source">{t.pdfSourceQuality}</option>
              <option value="print300">{t.pdfPrintQuality}</option>
            </select>
          </label>
          <p className="small-note">
            {pdfQuality === "source" ? t.pdfSourceHint : t.pdfPrintHint}
          </p>
          <label>
            {t.pdfLayout}
            <select
              value={pdfLayout}
              disabled={busy}
              onChange={(e) => setPdfLayout(e.target.value)}
            >
              <option value="pages">{t.pdfPages}</option>
              <option value="spreads">{t.pdfSpreads}</option>
            </select>
          </label>
          <p className="small-note">
            {pdfLayout === "spreads" ? t.pdfSpreadsHint : t.pdfPagesHint}
          </p>
          <label>
            {t.exportScope}
            <select
              value={scope}
              disabled={busy}
              onChange={(e) => {
                setScope(e.target.value);
                setAccepted(false);
              }}
            >
              {["all", "interior", "covers"].map((s) => (
                <option value={s} key={s}>
                  {t[s]} ·{" "}
                  {s === "all"
                    ? book.pageCount + 2
                    : s === "interior"
                      ? book.pageCount
                      : 2}
                </option>
              ))}
            </select>
          </label>
          <p className="small-note">{t.exportInfo}</p>
          {scope !== "interior" && (
            <p className="small-note">{t.coverPrintHint}</p>
          )}
          <label className="bleed-option">
            <input
              type="checkbox"
              checked={bleed}
              disabled={busy}
              onChange={(e) => setBleed(e.target.checked)}
            />
            <div>
              <strong>{t.bleed}</strong>
              <small>
                {pdfLayout === "spreads"
                  ? bleed
                    ? t.spreadBleedHint
                    : t.spreadNoBleed
                  : bleed
                    ? t.bleedHint
                    : t.noBleed}
              </small>
            </div>
          </label>
          <div className="preflight">
            <h3>{t.review}</h3>
            {warnings.length ? (
              <>
                <div className="warning-list">
                  {warnings.map((w, i) => (
                    <div key={i}>
                      <span>
                        ⚠ {pageLabel(book.pages[w.page], w.page, t)}:{" "}
                        {w.type === "empty"
                          ? t.emptyFrame
                          : `${t.lowRes} (${w.dpi} DPI)`}
                      </span>
                    </div>
                  ))}
                </div>
                <label className="warning-accept">
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={busy}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  {t.warningAccept}
                </label>
              </>
            ) : (
              <p className="good-quality">{t.good}</p>
            )}
          </div>
          <button
            className="primary download-pdf"
            disabled={busy || (warnings.length > 0 && !accepted)}
            onClick={print}
          >
            {busy
              ? `${t.exporting} ${Math.round(progress * 100)}%`
              : t.downloadPdf}
          </button>
          <p className="export-footer">{t.bleedFooter}</p>
        </Modal>
      )}
    </>
  );
}
function BookCard({ record, cover, t, onOpen, onDelete, onCopy, busy }) {
  return (
    <article className="book-card">
      <button className="book-card-open" onClick={onOpen} disabled={busy}>
        <div className="card-cover">
          {cover ? <img src={cover} alt="" loading="lazy" /> : <span>m✳</span>}
        </div>
        <h3>{record.title || t.blankBook}</h3>
        {record.ownerEmail && <p className="book-owner">{record.ownerEmail}</p>}
        <p>
          {record.pageCount} {t.pages} {t.coversSeparate}
        </p>
        <small>{new Date(record.updatedAt).toLocaleDateString()}</small>
      </button>
      <div className="card-actions">
        <button onClick={onCopy} disabled={busy}>
          {t.duplicateBook}
        </button>
        {onDelete && (
          <button onClick={onDelete} disabled={busy}>
            {t.deleteBook}
          </button>
        )}
      </div>
    </article>
  );
}
createRoot(document.getElementById("root")).render(<App />);
