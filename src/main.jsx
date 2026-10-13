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
  deletePages,
  forkBook,
  validateBook,
  portableBook,
  issues,
  localLoadBook,
  legacyBooks,
} from "./model";
import { messages, errorMessage } from "./ui-text";
import { api, CloudWriter } from "./api";
import { importGuestBooks } from "./local-import";
import { buildWithAi } from "./ai-client";
import { assembleBook } from "./ai-assembly";
import { AdminAiUsage } from "./ai-usage";
import { FORMATS, bookFormat, pageSize } from "./format";
import { TextControls } from "./text-controls";
import { PageCanvas, Spread, FitSpread } from "./canvas";
import { photoThumbnail, photoPreview } from "./photo-view";
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
  const [language, setLanguage] = useState(() => {
    try {
      return (
        localStorage.getItem("matiane-language") ||
        (/^ru/.test(navigator.language) ? "ru" : "en")
      );
    } catch {
      return /^ru/.test(navigator.language) ? "ru" : "en";
    }
  });
  const t = messages[language] || messages.en;
  const [ready, setReady] = useState(false),
    [user, setUser] = useState(null),
    [book, setBook] = useState(null),
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
    [localImport, setLocalImport] = useState({
      running: false,
      done: 0,
      total: 0,
      failed: false,
    }),
    [uploading, setUploading] = useState(false);
  const [selectedPages, setSelectedPages] = useState(new Set()),
    [selectingPages, setSelectingPages] = useState(false),
    [dropPosition, setDropPosition] = useState(null);
  const draggedPage = useRef(null),
    selectionAnchor = useRef(null);
  const [mobilePanel, setMobilePanel] = useState(null),
    [ai, setAi] = useState({
      running: false,
      phase: "preparing",
      completed: 0,
      total: 0,
      error: "",
      diagnostics: null,
    });
  const [history, setHistory] = useState([]),
    [future, setFuture] = useState([]),
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
    incomingBooks = useRef([]),
    importing = useRef(false),
    aiController = useRef(null),
    activeToken = useRef(0);
  current.current = book;
  currentUser.current = user;
  const initial = useRef(false);
  useEffect(() => {
    if (initial.current) return;
    initial.current = true;
    (async () => {
      try {
        if (accountsAvailable) {
          const session = await api("/session");
          setUser(session.user);
        }
      } catch {}
      setReady(true);
    })();
  }, []);
  async function refresh(account = currentUser.current) {
    try {
      if (account && accountsAvailable) {
        const remote = await api("/books");
        setCloudBooks(remote.books);
        setStorage(remote.storageUsed);
        if (account.isAdmin) {
          const all = await api("/admin/books");
          setAdminBooks(all.books);
          setAdminTotal(all.total);
        } else {
          setAdminBooks([]);
          setAdminTotal(0);
        }
      } else setCloudBooks([]);
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
  async function syncLocalBooks(account = currentUser.current) {
    if (!account || importing.current || aiController.current) return;
    importing.current = true;
    setBusy(true);
    setLocalImport((s) => ({ ...s, running: true, failed: false }));
    try {
      const result = await importGuestBooks(account.id, {
        onProgress: (p) =>
          setLocalImport({ ...p, running: true, failed: false }),
        onSaved: (snapshot, info) => {
          if (current.current?.id === snapshot.id && !readOnly) {
            writer.current = new CloudWriter(info);
            setCloudStatus("cloudSaved");
            setCloudError(null);
          }
        },
      });
      const incoming = [...incomingBooks.current];
      for (const snapshot of incoming) {
        try {
          await new CloudWriter().save(snapshot);
          incomingBooks.current = incomingBooks.current.filter(
            (item) => item !== snapshot,
          );
        } catch (error) {
          if (error.code === "version_conflict" && error.bookInfo) {
            await api("/books/" + error.bookInfo.id);
            incomingBooks.current = incomingBooks.current.filter(
              (item) => item !== snapshot,
            );
          } else result.errors.push({ error });
        }
      }
      if (incoming.length && !incomingBooks.current.length)
        window.opener?.postMessage(
          { type: "matiane-transfer-done" },
          oldOrigin,
        );
      setLocalImport({
        running: false,
        done:
          result.saved.size + incoming.length - incomingBooks.current.length,
        total: result.total + incoming.length,
        failed: result.errors.length > 0,
      });
      if (result.errors.length)
        setToast(
          t.localImportFailed + " " + errorMessage(result.errors[0].error, t),
        );
      else if (result.total) setToast(t.localImportDone);
    } catch (error) {
      setLocalImport((s) => ({ ...s, running: false, failed: true }));
      setToast(t.localImportFailed + " " + errorMessage(error, t));
    } finally {
      if (current.current && !readOnly && !writer.current)
        writer.current = new CloudWriter();
      importing.current = false;
      setBusy(false);
      await refresh(account);
    }
  }
  useEffect(() => {
    if (ready && user) syncLocalBooks(user);
  }, [ready, user?.id]);
  useEffect(() => {
    const online = () => {
      if (currentUser.current && !current.current && !busy) syncLocalBooks();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [busy]);
  useEffect(() => {
    return () => aiController.current?.abort();
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("matiane-language", language);
    } catch {}
  }, [language]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function saveCloud(snapshot = current.current, options = {}) {
    const w = writer.current,
      token = activeToken.current;
    if (!w || !snapshot) return;
    setCloudStatus("savingCloud");
    setCloudError(null);
    try {
      const info = await w.save(snapshot, options);
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
        if (e.status === 401) setModal("auth");
      }
      throw e;
    }
  }
  useEffect(() => {
    if (
      !book ||
      !user ||
      !writer.current ||
      localImport.running ||
      readOnly ||
      ai.running
    )
      return;
    setCloudStatus("savingCloud");
    const timer = setTimeout(() => saveCloud(book).catch(() => {}), 2300);
    return () => clearTimeout(timer);
  }, [book, user, localImport.running, readOnly, ai.running]);
  useEffect(() => {
    const leave = (e) => {
      if (
        book &&
        !readOnly &&
        (cloudStatus !== "cloudSaved" || uploading || busy)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [book, cloudStatus, uploading, busy, readOnly]);
  useEffect(() => {
    if (!ready || location.origin !== new URL(SECURE_STUDIO).origin) return;
    const receive = async (e) => {
      if (e.origin !== oldOrigin || e.source !== window.opener) return;
      if (e.data?.type === "matiane-ping") {
        e.source.postMessage({ type: "matiane-ready" }, oldOrigin);
        return;
      }
      if (
        !["matiane-transfer-books", "matiane-transfer"].includes(e.data?.type)
      )
        return;
      try {
        const values =
          e.data.type === "matiane-transfer-books"
            ? e.data.books
            : [e.data.book];
        if (!Array.isArray(values) || values.length > 100)
          throw new Error("invalid transfer");
        incomingBooks.current = values.map((value) => validateBook(value));
        if (currentUser.current) await syncLocalBooks();
        else setModal("auth");
      } catch {
        setToast(t.importError);
      }
    };
    window.addEventListener("message", receive);
    window.opener?.postMessage({ type: "matiane-ready" }, oldOrigin);
    return () => window.removeEventListener("message", receive);
  }, [ready]);
  function openBook(next, info = null, review = false) {
    if (aiController.current) return;
    if (!currentUser.current || (!info && !review)) {
      setModal("auth");
      return;
    }
    next = validateBook(next, { allowCloud: true });
    activeToken.current++;
    writer.current =
      currentUser.current && !review ? new CloudWriter(info) : null;
    setReadOnly(review);
    setSpineSelected(false);
    setSelectedPages(new Set());
    setSelectingPages(false);
    setBook(next);
    setLanguage(next.language);
    setIndex(0);
    setFrame(0);
    setHistory([]);
    setFuture([]);
    setMobilePanel(null);
    setAi({
      running: false,
      phase: "preparing",
      completed: 0,
      total: 0,
      error: "",
      diagnostics: null,
    });
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
  async function createCloudBook(next) {
    if (!currentUser.current) {
      setModal("auth");
      return;
    }
    setBusy(true);
    try {
      const w = new CloudWriter();
      const info = await w.save(next);
      openBook(w.savedBook, info);
    } catch (error) {
      setToast(errorMessage(error, t));
    } finally {
      setBusy(false);
    }
  }
  async function leaveEditor() {
    if (uploading || busy) return;
    setBusy(true);
    try {
      if (!readOnly) {
        await saveCloud();
        await writer.current.queue;
      }
      activeToken.current++;
      writer.current = null;
      setBook(null);
      setReadOnly(false);
    } catch (error) {
      setToast(errorMessage(error, t));
    } finally {
      setBusy(false);
    }
  }
  async function authenticated(value) {
    setCloudBooks([]);
    setAdminBooks([]);
    setUser(value.user);
    currentUser.current = value.user;
    setModal(null);
  }
  async function logout() {
    if (busy || uploading) return;
    setBusy(true);
    try {
      if (current.current && !readOnly) {
        await saveCloud();
        await writer.current.queue;
      }
      await api("/auth/logout", { method: "POST" });
      activeToken.current++;
      writer.current = null;
      currentUser.current = null;
      setBook(null);
      setUser(null);
      setCloudBooks([]);
      setAdminBooks([]);
      setReadOnly(false);
      setModal(null);
    } catch (error) {
      setToast(errorMessage(error, t));
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
      await api("/books/" + record.id, { method: "DELETE" });
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
      const source = (await api("/books/" + record.id)).book;
      await createCloudBook(
        forkBook(source, source.title + " · " + t.duplicateBook),
      );
    } catch (e) {
      setToast(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function upload(files) {
    if (busy || uploading || readOnly || !files?.length) return;
    setUploading(true);
    const token = activeToken.current,
      available = 200 - book.photos.length,
      additions = [];
    let failed = false,
      uploadError = "";
    for (const file of [...files].slice(0, available)) {
      try {
        const photo = await readPhoto(file);
        const body = await (await fetch(photo.src)).blob();
        const remote = await api("/photos", { method: "POST", body });
        additions.push({ ...photo, ...remote });
      } catch (error) {
        failed = true;
        if (error.code) uploadError = errorMessage(error, t);
        if (error.code === "storage_quota") break;
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
          ? uploadError || t.uploadError
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
  async function autoAssemble() {
    if (
      busy ||
      aiController.current ||
      uploading ||
      readOnly ||
      !current.current?.photos.length
    )
      return;
    if (writer.current?.conflict) {
      setToast(t.conflict);
      return;
    }
    if (!accountsAvailable) {
      await transfer();
      return;
    }
    const snapshot = current.current,
      token = activeToken.current,
      controller = new AbortController();
    aiController.current = controller;
    let lastProgress = {
      phase: "preparing",
      completed: 0,
      total: snapshot.photos.length,
    };
    setBusy(true);
    setAi({
      running: true,
      phase: "preparing",
      completed: 0,
      total: snapshot.photos.length,
      error: "",
      diagnostics: null,
    });
    try {
      await saveCloud(snapshot);
      const result = await buildWithAi(snapshot, {
        signal: controller.signal,
        signedIn: !!user,
        onProgress: (value) => {
          lastProgress = { ...lastProgress, ...value };
          setAi((state) => ({ ...state, ...value, running: true }));
        },
      });
      if (controller.signal.aborted || token !== activeToken.current)
        throw new DOMException("Cancelled", "AbortError");
      const next = assembleBook(snapshot, result.analysis, result.plan);
      lastProgress = { ...lastProgress, phase: "saving" };
      setAi((state) => ({ ...state, phase: "saving" }));
      await saveCloud(snapshot, { checkpoint: true, label: t.aiBackup });
      if (controller.signal.aborted || token !== activeToken.current)
        throw new DOMException("Cancelled", "AbortError");
      setHistory((past) => [...past.slice(-29), snapshot]);
      setFuture([]);
      setBook(next);
      setIndex(
        Math.max(
          1,
          next.pages.findIndex(
            (page) => page.kind === "page" && page.photos.some(Boolean),
          ),
        ),
      );
      setFrame(0);
      setSpineSelected(false);
      setMobilePanel(null);
      setAi((state) => ({ ...state, running: false, error: "" }));
      setToast(t.aiDone);
    } catch (error) {
      if (error.name === "AbortError") {
        setAi((state) => ({ ...state, running: false, error: "" }));
        setToast(t.aiCancelled);
      } else {
        const explanation = errorMessage(error, t);
        setAi((state) => ({
          ...state,
          running: false,
          error: explanation === t.error ? t.aiFailed : explanation,
          diagnostics: {
            code: error.code || "ai_failed",
            ...(error.aiDetails || lastProgress),
          },
        }));
      }
    } finally {
      aiController.current = null;
      setBusy(false);
    }
  }
  async function changeCount(count) {
    if (busy || uploading || readOnly || count === book.pageCount) return;
    const snapshot = current.current,
      token = activeToken.current;
    setBusy(true);
    try {
      if (count < snapshot.pageCount) {
        if (!window.confirm(t.shrinkConfirm)) return;
        await saveCloud(snapshot, { checkpoint: true, label: t.backup });
      }
      if (token !== activeToken.current) return;
      setHistory((past) => [...past.slice(-29), snapshot]);
      setFuture([]);
      setBook(resizeBook(snapshot, count));
      setIndex((i) => Math.min(i, count + 1));
      setFrame(0);
      setSpineSelected(false);
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
  function toggleSelectedPage(id, at, range = false) {
    const now = current.current,
      anchor = selectionAnchor.current;
    setSelectedPages((previous) => {
      const next = new Set(previous);
      if (range && anchor !== null) {
        const from = Math.min(at, anchor),
          to = Math.max(at, anchor);
        for (let i = from; i <= to; i++)
          if (now.pages[i].kind === "page") next.add(now.pages[i].id);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    selectionAnchor.current = at;
  }
  function removePage() {
    if (readOnly || busy || uploading) return;
    const now = current.current;
    const indexes = selectingPages
      ? now.pages.flatMap((page, at) =>
          page.kind === "page" && selectedPages.has(page.id) ? [at] : [],
        )
      : now.pages[index].kind === "page"
        ? [index]
        : [];
    if (
      !indexes.length ||
      !window.confirm(
        selectingPages
          ? t.deletePagesConfirm.replace("{count}", indexes.length)
          : t.deletePageConfirm,
      )
    )
      return;
    const next = deletePages(now, indexes);
    commit(next);
    const selectedId = now.pages[index].id;
    setIndex(
      Math.max(
        0,
        next.pages.findIndex((page) => page.id === selectedId) >= 0
          ? next.pages.findIndex((page) => page.id === selectedId)
          : Math.min(index, now.pageCount),
      ),
    );
    setSelectedPages(new Set());
    setSelectingPages(false);
    setFrame(0);
  }
  function dragOverPage(event, at) {
    if (!draggedPage.current || readOnly || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    setDropPosition(
      Math.max(
        1,
        Math.min(
          book.pageCount + 1,
          at + (event.clientX >= rect.x + rect.width / 2 ? 1 : 0),
        ),
      ),
    );
    const strip = event.currentTarget.closest(".filmstrip"),
      bounds = strip.getBoundingClientRect();
    if (event.clientX < bounds.left + 30) strip.scrollBy({ left: -24 });
    else if (event.clientX > bounds.right - 30) strip.scrollBy({ left: 24 });
  }
  function dropPage(event) {
    event.preventDefault();
    const from = book.pages.findIndex(
      (page) => page.id === event.dataTransfer.getData("text/matiane-page"),
    );
    if (dropPosition !== null && from >= 1 && from <= book.pageCount) {
      const to = dropPosition > from ? dropPosition - 1 : dropPosition;
      if (from !== to) move(from, to);
    }
    draggedPage.current = null;
    setDropPosition(null);
  }
  function undo() {
    if (readOnly || !history.length) return;
    setSelectedPages(new Set());
    setSelectingPages(false);
    setFuture((f) => [...f, book]);
    setBook(history.at(-1));
    setIndex((i) => Math.min(i, history.at(-1).pages.length - 1));
    setHistory((h) => h.slice(0, -1));
  }
  function redo() {
    if (readOnly || !future.length) return;
    setSelectedPages(new Set());
    setSelectingPages(false);
    setHistory((h) => [...h, book]);
    setBook(future.at(-1));
    setIndex((i) => Math.min(i, future.at(-1).pages.length - 1));
    setFuture((f) => f.slice(0, -1));
  }
  const filename = () =>
    (book?.title || "Matiane")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
      .slice(0, 80) || "Matiane";
  async function importProject(file) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error("size");
      const imported = forkBook(validateBook(JSON.parse(await file.text())));
      await createCloudBook(imported);
      setToast(t.loaded);
    } catch {
      setToast(t.importError);
    } finally {
      setBusy(false);
    }
  }
  async function transfer() {
    if (busy || uploading) return;
    const popup = window.open(SECURE_STUDIO + "/?transfer=1", "matiane-secure");
    if (!popup) {
      setToast(t.transferFailed);
      return;
    }
    setBusy(true);
    try {
      const records = await legacyBooks("guest"),
        books = [];
      for (const record of records) {
        const loaded =
          record.owner === "legacy"
            ? record
            : await localLoadBook(record.id, record.owner);
        books.push(await portableBook(loaded.book));
      }
      const ack = await new Promise((resolve) => {
        let sent = false;
        const receive = (event) => {
          if (
            event.origin !== new URL(SECURE_STUDIO).origin ||
            event.source !== popup
          )
            return;
          if (event.data?.type === "matiane-ready" && !sent) {
            sent = true;
            popup.postMessage(
              { type: "matiane-transfer-books", books },
              new URL(SECURE_STUDIO).origin,
            );
          }
          if (event.data?.type === "matiane-transfer-done") {
            clearTimeout(timeout);
            window.removeEventListener("message", receive);
            resolve(true);
          }
        };
        const timeout = setTimeout(() => {
          window.removeEventListener("message", receive);
          resolve(false);
        }, 600000);
        window.addEventListener("message", receive);
        popup.postMessage(
          { type: "matiane-ping" },
          new URL(SECURE_STUDIO).origin,
        );
      });
      setToast(ack ? t.transferDone : t.transferFailed);
    } catch {
      setToast(t.importError);
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
  const previewPhotos = new Map(book?.photos.map((photo) => [photo.id, photo]));
  const adjacentPreviewSources = [
    ...new Set(
      [spreadList[spreadIndex + 1], spreadList[spreadIndex - 1]]
        .flatMap((pair) => pair || [])
        .filter((at) => at !== null)
        .flatMap((at) => book.pages[at].photos)
        .map((id) => previewPhotos.get(id))
        .filter((photo) => photo?.src.startsWith("/api/photos/"))
        .map(photoPreview),
    ),
  ].join("\n");
  useEffect(() => {
    if (!adjacentPreviewSources) return;
    const sources = adjacentPreviewSources.split("\n");
    // Give the visible spread priority, then warm its neighbours quietly.
    const images = [];
    const timer = setTimeout(() => {
      for (const src of sources) {
        const image = new Image();
        image.fetchPriority = "low";
        image.decoding = "async";
        image.src = src;
        images.push(image);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [book?.id, adjacentPreviewSources]);
  function patchCover(patch) {
    commit({
      ...current.current,
      cover: { ...current.current.cover, ...patch },
    });
  }
  function focusText(at, spine = false) {
    setIndex(at);
    setSpineSelected(spine);
    if (window.matchMedia("(max-width: 800px)").matches)
      setMobilePanel("design");
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
              disabled={busy || uploading}
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
            disabled={busy}
            onClick={() => setModal("account")}
          >
            {user.email}
          </button>
        ) : (
          <button
            className="secondary"
            disabled={busy || uploading}
            onClick={() =>
              accountsAvailable ? setModal("auth") : transfer(true)
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
    <div
      className={book ? "app-shell editor-shell" : "app-shell"}
      data-book-id={book ? writer.current?.info?.id : undefined}
    >
      {header}
      {user && (localImport.running || localImport.failed) && (
        <div
          className="account-invitation local-import"
          role="status"
          aria-live="polite"
        >
          <p>
            {localImport.running
              ? `${t.localImportProgress} ${localImport.done} / ${localImport.total}`
              : t.localImportFailed}
          </p>
          {!localImport.running && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => syncLocalBooks()}
            >
              {t.retryLocalImport}
            </button>
          )}
        </div>
      )}
      {!book ? (
        <main className="cabinet">
          <div className="cabinet-heading">
            <div>
              <span className="eyebrow">MATIANE</span>
              <h1>{t.myBooks}</h1>
              <p>{t.welcome}</p>
            </div>
            {user && (
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
            )}
          </div>
          {!user && (
            <div className="account-invitation">
              <p>{t.signInHint}</p>
              <button
                className="text-button"
                onClick={() =>
                  accountsAvailable ? setModal("auth") : transfer(true)
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
            <AdminAiUsage key={user.id} t={t} language={language} />
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
          {user && !cloudBooks.length && (
            <div className="empty-cabinet">
              <span>✳</span>
              <p>{t.emptyDashboard}</p>
              <button
                className="secondary"
                onClick={() => createCloudBook(demoBook(language))}
              >
                {t.demo}
              </button>
            </div>
          )}
        </main>
      ) : (
        <>
          {cloudError?.code === "version_conflict" && (
            <div className="conflict-banner">
              <p>{t.conflict}</p>
              <button
                className="secondary"
                disabled={busy || uploading}
                onClick={() => openCloud({ id: writer.current.info.id }, true)}
              >
                {t.openLatest}
              </button>
              <button
                className="primary"
                disabled={busy || uploading}
                onClick={() => createCloudBook(forkBook(book))}
              >
                {t.saveCopy}
              </button>
            </div>
          )}
          <nav className="mobile-editor-tools" aria-label={t.studio}>
            <button
              className={mobilePanel === "photos" ? "selected" : ""}
              aria-pressed={mobilePanel === "photos"}
              onClick={() => setMobilePanel("photos")}
            >
              {t.photos}
            </button>
            <button
              className={!mobilePanel ? "selected" : ""}
              aria-pressed={!mobilePanel}
              onClick={() => setMobilePanel(null)}
            >
              {t.studio}
            </button>
            <button
              className={mobilePanel === "design" ? "selected" : ""}
              aria-pressed={mobilePanel === "design"}
              onClick={() => setMobilePanel("design")}
            >
              {t.styleTitle}
            </button>
          </nav>
          <main
            className={`studio-grid ${mobilePanel ? "panel-open-" + mobilePanel : ""}`}
          >
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
              <button
                className="primary ai-assembly-button"
                disabled={busy || uploading || readOnly || !book.photos.length}
                onClick={autoAssemble}
              >
                <span aria-hidden="true">✦</span> {t.aiBuild}
              </button>
              <p className="small-note ai-assembly-hint">{t.aiHint}</p>
              {ai.running && (
                <div
                  className="ai-assembly-progress"
                  role="status"
                  aria-live="polite"
                >
                  <p>
                    <LoaderCircle className="spin" size={15} />{" "}
                    {
                      t[
                        {
                          preparing: "aiPreparing",
                          analysing: "aiAnalysing",
                          planning: "aiPlanning",
                          saving: "aiSaving",
                          cancelling: "aiCancelling",
                          completed: "aiPlanning",
                        }[ai.phase] || "aiPlanning"
                      ]
                    }
                  </p>
                  <progress
                    aria-label={t.aiBuild}
                    max={Math.max(1, ai.total)}
                    value={ai.completed}
                  />
                  <small>
                    {Math.min(ai.completed, ai.total)} / {ai.total}
                  </small>
                  <button
                    className="text-button"
                    disabled={ai.phase === "cancelling"}
                    onClick={() => {
                      aiController.current?.abort();
                      setAi((state) => ({ ...state, phase: "cancelling" }));
                    }}
                  >
                    {t.cancel}
                  </button>
                </div>
              )}
              {ai.error && !ai.running && (
                <div className="ai-assembly-error" role="alert">
                  <p>{ai.error}</p>
                  {ai.diagnostics && (
                    <details className="ai-error-details">
                      <summary>{t.aiErrorDetails}</summary>
                      <p>
                        {t[
                          {
                            preparing: "aiPreparing",
                            analysing: "aiAnalysing",
                            planning: "aiPlanning",
                            saving: "aiSaving",
                          }[ai.diagnostics.phase]
                        ] || t.aiFailed}{" "}
                        · {ai.diagnostics.completed || 0}/
                        {ai.diagnostics.total || book.photos.length}
                      </p>
                      <code>{ai.diagnostics.code}</code>
                    </details>
                  )}
                  <button
                    className="secondary"
                    onClick={autoAssemble}
                    disabled={busy || uploading || readOnly}
                  >
                    {t.aiRetry}
                  </button>
                </div>
              )}
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
                        disabled={busy || readOnly}
                        onClick={() => assign(photo.id)}
                        draggable={!busy && !readOnly}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/matiane-photo", photo.id)
                        }
                      >
                        <img
                          src={photoThumbnail(photo)}
                          alt={photo.name}
                          loading="lazy"
                          decoding="async"
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
                        disabled={busy || readOnly}
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
                <span className="canvas-location">
                  {spreadIndex === 0
                    ? t.coverSpread
                    : `${t.spread} ${spreadIndex} / ${spreadList.length - 1}`}
                  <small>{pageLabel(page, index, t)}</small>
                </span>
                <div className="canvas-actions">
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
                    className="text-button preview-button"
                    aria-label={t.preview}
                    disabled={busy || uploading}
                    onClick={() => {
                      setPreviewIndex(spreadIndex);
                      setModal("preview");
                    }}
                  >
                    <Eye size={16} />
                    <span>{t.preview}</span>
                  </button>
                </div>
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
                  <FitSpread book={book} spreadIndex={spreadIndex}>
                    <Spread
                      book={book}
                      spreadIndex={spreadIndex}
                      t={t}
                      activeIndex={index}
                      activeFrame={frame}
                      onSelect={choosePage}
                      onCrop={
                        readOnly || busy
                          ? undefined
                          : (at, slot, crop) => {
                              const crops = [
                                ...current.current.pages[at].crops,
                              ];
                              crops[slot] = crop;
                              patchPage(at, { crops });
                            }
                      }
                      onText={
                        readOnly || busy ? undefined : (at) => focusText(at)
                      }
                      onSpine={
                        readOnly || busy ? undefined : () => focusText(0, true)
                      }
                      spineSelected={spineSelected}
                    />
                  </FitSpread>
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
              </div>
              <div className="filmstrip-section">
                <div className="filmstrip-heading">
                  <span>
                    {book.pageCount} {t.pages} {t.coversSeparate}
                  </span>
                  <div>
                    <button
                      className="page-select-toggle"
                      disabled={readOnly || busy || uploading}
                      aria-pressed={selectingPages}
                      onClick={() => {
                        setSelectingPages((value) => !value);
                        setSelectedPages(new Set());
                        selectionAnchor.current = null;
                      }}
                    >
                      {selectingPages ? t.cancelSelection : t.selectPages}
                    </button>
                    <button
                      className="delete-page-button"
                      disabled={
                        readOnly ||
                        busy ||
                        uploading ||
                        (selectingPages
                          ? !selectedPages.size
                          : page.kind !== "page")
                      }
                      title={
                        page.kind !== "page" ? t.coverLocked : t.deletePage
                      }
                      onClick={removePage}
                    >
                      <Trash2 size={14} />
                      {selectingPages
                        ? t.deleteSelected.replace(
                            "{count}",
                            selectedPages.size,
                          )
                        : t.deletePage}
                    </button>
                    <IconButton
                      title={t.moveLeft}
                      disabled={
                        readOnly || busy || index <= 1 || index > book.pageCount
                      }
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowLeft size={14} />
                    </IconButton>
                    <IconButton
                      title={t.moveRight}
                      disabled={
                        readOnly || busy || index < 1 || index >= book.pageCount
                      }
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
                        disabled={readOnly || busy || page.kind !== "page"}
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
                {selectingPages && (
                  <div className="page-selection-tools">
                    <span>
                      {t.selectedPages.replace("{count}", selectedPages.size)}
                    </span>
                    <button
                      onClick={() =>
                        setSelectedPages(
                          new Set(
                            book.pages
                              .filter((page) => page.kind === "page")
                              .map((page) => page.id),
                          ),
                        )
                      }
                    >
                      {t.selectAll}
                    </button>
                    <button onClick={() => setSelectedPages(new Set())}>
                      {t.clearSelection}
                    </button>
                    <small>{t.selectRangeHint}</small>
                  </div>
                )}
                <div
                  className="filmstrip"
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      setDropPosition(null);
                  }}
                >
                  {book.pages.map((p, i) => (
                    <div
                      key={p.id}
                      className={`page-thumb-wrap ${selectedPages.has(p.id) ? "batch-selected" : ""}`}
                      onDragOver={(event) => dragOverPage(event, i)}
                      onDrop={dropPage}
                    >
                      {dropPosition === i && (
                        <span
                          className="page-drop-indicator"
                          role="status"
                          aria-label={t.insertBefore.replace(
                            "{page}",
                            pageLabel(p, i, t),
                          )}
                        />
                      )}
                      <button
                        className={`page-thumb ${index === i ? "selected" : ""} ${p.kind !== "page" ? "cover-thumb" : ""}`}
                        aria-label={pageLabel(p, i, t)}
                        aria-pressed={
                          selectingPages && p.kind === "page"
                            ? selectedPages.has(p.id)
                            : index === i
                        }
                        onClick={(event) =>
                          selectingPages && p.kind === "page"
                            ? toggleSelectedPage(p.id, i, event.shiftKey)
                            : choosePage(i, 0)
                        }
                        draggable={
                          !readOnly &&
                          !busy &&
                          !selectingPages &&
                          p.kind === "page"
                        }
                        onDragStart={(event) => {
                          draggedPage.current = p.id;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/matiane-page", p.id);
                        }}
                        onDragEnd={() => {
                          draggedPage.current = null;
                          setDropPosition(null);
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
                      {selectingPages && p.kind === "page" && (
                        <input
                          className="page-select-checkbox"
                          type="checkbox"
                          aria-label={t.selectPage.replace("{page}", i)}
                          checked={selectedPages.has(p.id)}
                          onChange={() => toggleSelectedPage(p.id, i)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <aside className="design-panel">
              <div className="book-settings">
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
                    disabled={readOnly || busy || uploading}
                    onChange={(e) => commit({ ...book, title: e.target.value })}
                  />
                </div>
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
                <div className="save-bar">
                  {readOnly && <strong>{t.adminReview}</strong>}
                  {!readOnly && (
                    <span className={cloudError ? "error-note" : ""}>
                      {t[cloudStatus || "savingCloud"]}
                    </span>
                  )}
                  {!readOnly && (
                    <>
                      <button
                        onClick={showVersions}
                        disabled={busy || uploading}
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
                  )}
                  <button
                    onClick={() => projectInput.current.click()}
                    disabled={busy || uploading || readOnly}
                  >
                    {t.openProject}
                  </button>
                </div>
              </div>
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
              <fieldset disabled={readOnly || busy} className="design-fields">
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
                    disabled={readOnly || busy}
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
          busy={busy}
          onCreate={(count, title) =>
            createCloudBook(newBook(count, title, language))
          }
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
    </div>
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
