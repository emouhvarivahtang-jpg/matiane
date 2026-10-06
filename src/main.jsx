import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Upload, Plus, ChevronLeft, ChevronRight, X, Check, Download, Image as ImageIcon, BookOpen, Copy, Trash2, Eye, Minus, Undo2, Redo2, FolderOpen, MoreHorizontal, AlertTriangle, AlignLeft, AlignCenter, AlignRight, ArrowLeft, ArrowRight, Leaf, LoaderCircle, RotateCcw } from './icons';
import { COLORS, LAYOUTS, CAPACITY, newPage, newBook, demoBook, uid, slots, captionBox, darkColor, issues, readPhoto, loadBook, saveBook, validateBook } from './model';
import { download } from './download';
import { browserCaption } from './text';
import { translations } from './i18n';
import './styles.css';

function IconButton({ title, children, ...props }) { return <button className="icon-button" title={title} aria-label={title} {...props}>{children}</button>; }
function LayoutIcon({ layout }) { return <div className={`layout-icon layout-${layout}`}>{slots(layout).map((r, i) => <i key={i} style={{ left: `${r.x / 148 * 100}%`, top: `${r.y / 210 * 100}%`, width: `${r.w / 148 * 100}%`, height: `${r.h / 210 * 100}%` }} />)}</div>; }
function PageCanvas({ page, photos, t, selected = -1, onSelect, tiny = false }) {
  const box = captionBox();
  const [textLayout, setTextLayout] = useState({ size: page.fontSize, lines: [page.caption] });
  useEffect(() => {
    let active = true;
    document.fonts.ready.then(() => { if (active) setTextLayout(browserCaption(page)); });
    return () => { active = false; };
  }, [page.caption, page.font, page.fontSize]);
  return <div className={`book-page ${tiny ? 'tiny-page' : ''}`} style={{ background: page.color, color: page.layout === 'full' || darkColor(page.color) ? '#fff' : '#30332d' }}>
    {slots(page.layout).map((r, index) => {
      const photo = photos.find(p => p.id === page.photos[index]);
      const style = { left: `${r.x / 148 * 100}%`, top: `${r.y / 210 * 100}%`, width: `${r.w / 148 * 100}%`, height: `${r.h / 210 * 100}%` };
      return <div key={index} className={`photo-frame ${selected === index && onSelect ? 'frame-selected' : ''}`} style={style} onClick={() => onSelect?.(index)} onDragOver={e => onSelect && e.preventDefault()} onDrop={e => { e.preventDefault(); onSelect?.(index, e.dataTransfer.getData('text/matiane-photo')); }} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={`${t.frame} ${index + 1}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(index); } }}>
        {photo ? <img src={photo.src} alt={photo.name} draggable={false} style={{ objectPosition: `${page.focus.x}% ${page.focus.y}%` }} /> : <div className="empty-frame"><ImageIcon />{!tiny && <span>{t.empty}</span>}</div>}
        {selected === index && onSelect && <span className="frame-number">{index + 1}</span>}
      </div>;
    })}
    {page.caption && <div className={`page-caption ${page.font} ${page.layout === 'full' ? 'overlay-caption' : ''}`} style={{ left: `${box.x / 148 * 100}%`, top: `${box.y / 210 * 100}%`, width: `${box.w / 148 * 100}%`, height: `${box.h / 210 * 100}%`, fontSize: `${textLayout.size / (148 * 72 / 25.4) * 100}cqw`, textAlign: page.align }}>{textLayout.lines.join('\n')}</div>}
  </div>;
}
function Modal({ children, onClose, label, busy = false }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement; ref.current.focus();
    const onKey = e => {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key === 'Tab') {
        const controls = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea, [tabindex="0"]')];
        if (!controls.length) { e.preventDefault(); return; }
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [busy, onClose]);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}><section className="modal" ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</section></div>;
}

function App() {
  const [book, setBook] = useState(null), [index, setIndex] = useState(0), [selectedFrame, setSelectedFrame] = useState(0);
  const [tab, setTab] = useState('layout'), [saveStatus, setSaveStatus] = useState('saved'), [toast, setToast] = useState('');
  const [modal, setModal] = useState(null), [menu, setMenu] = useState(false), [uploading, setUploading] = useState(false), [zoom, setZoom] = useState(100);
  const [bleed, setBleed] = useState(true), [acceptWarnings, setAcceptWarnings] = useState(false), [exporting, setExporting] = useState(false), [progress, setProgress] = useState(0);
  const [history, setHistory] = useState([]), [future, setFuture] = useState([]), [previewIndex, setPreviewIndex] = useState(0);
  const photoInput = useRef(), projectInput = useRef(), saveQueue = useRef(Promise.resolve());
  const latest = useRef(book); latest.current = book;
  const language = book?.language || 'en', t = translations[language];
  useEffect(() => { let active = true; loadBook().then(saved => { if (active) setBook(saved || demoBook()); }).catch(() => { if (active) { setBook(demoBook()); setToast(translations.en.storageError); } }); return () => { active = false; }; }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    if (!book) return;
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveBook(book)).then(() => { if (latest.current === book) setSaveStatus('saved'); }).catch(() => { if (latest.current === book) setSaveStatus('unsaved'); });
    }, 450);
    return () => clearTimeout(timer);
  }, [book]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const listener = e => { if (saveStatus !== 'saved' || uploading || exporting) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener);
  }, [saveStatus, uploading, exporting]);
  useEffect(() => { setSelectedFrame(0); }, [index]);
  function commit(next) { setHistory(h => [...h.slice(-29), book]); setFuture([]); setBook(next); }
  function patchPage(patch) { commit({ ...book, pages: book.pages.map((p, i) => i === index ? { ...p, ...patch } : p) }); }
  function undo() { if (!history.length) return; setFuture(f => [...f, book]); setBook(history.at(-1)); setHistory(h => h.slice(0, -1)); setIndex(i => Math.min(i, history.at(-1).pages.length - 1)); }
  function redo() { if (!future.length) return; setHistory(h => [...h, book]); setBook(future.at(-1)); setFuture(f => f.slice(0, -1)); setIndex(i => Math.min(i, future.at(-1).pages.length - 1)); }
  function assignPhoto(id, slot = selectedFrame) { if (!book.photos.some(p => p.id === id)) return; const photos = [...book.pages[index].photos]; while (photos.length <= slot) photos.push(null); photos[slot] = id; patchPage({ photos }); }
  async function upload(files) {
    if (uploading || !files.length) return;
    setUploading(true); let failed = false; const additions = [];
    const available = 200 - book.photos.length;
    for (const file of [...files].slice(0, available)) { try { additions.push(await readPhoto(file)); } catch { failed = true; } }
    const current = latest.current;
    if (additions.length) { setHistory(h => [...h.slice(-29), current]); setFuture([]); setBook({ ...current, photos: [...current.photos, ...additions] }); }
    setUploading(false); setToast(files.length > available ? t.photoLimit : failed ? t.uploadError : t.uploaded);
  }
  function addPage(duplicate = false) {
    if (book.pages.length >= 80) { setToast(t.pageLimit); return; }
    const pages = [...book.pages]; pages.splice(index + 1, 0, duplicate ? { ...structuredClone(page), id: uid() } : newPage()); commit({ ...book, pages }); setIndex(index + 1);
  }
  function deletePage() { if (book.pages.length === 1) return; commit({ ...book, pages: book.pages.filter((p, i) => i !== index) }); setIndex(Math.max(0, index - 1)); }
  function movePage(direction) { const pages = [...book.pages], target = index + direction; [pages[index], pages[target]] = [pages[target], pages[index]]; commit({ ...book, pages }); setIndex(target); }
  function fill() {
    const used = new Set(book.pages.flatMap(p => p.photos)); const unused = book.photos.filter(p => !used.has(p.id)); let cursor = 0;
    const pages = book.pages.map(p => ({ ...p, photos: slots(p.layout).map((_, i) => p.photos[i] || unused[cursor++]?.id || null) }));
    if (!unused.length || !cursor) { setToast(t.noFill); return; } commit({ ...book, pages }); setToast(t.fillDone);
  }
  function removePhoto(id) {
    if (book.pages.some(p => p.photos.includes(id)) && !window.confirm(t.removeConfirm)) return;
    commit({ ...book, photos: book.photos.filter(p => p.id !== id), pages: book.pages.map(p => ({ ...p, photos: p.photos.map(item => item === id ? null : item) })) });
  }
  async function saveProject() {
    try {
      const photos = await Promise.all(book.photos.map(async p => {
        if (p.src.startsWith('data:')) return p;
        const res = await fetch(p.src); if (!res.ok) throw new Error('photo'); const blob = await res.blob();
        const src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
        return { ...p, src };
      }));
      download(JSON.stringify({ ...book, photos }), `${filename()}.matiane.json`, 'application/json'); setToast(t.projectSaved);
    } catch { setToast(t.exportError); }
    setMenu(false);
  }
  async function openProject(file) {
    if (!file) return;
    try { if (file.size > 200 * 1024 * 1024) throw new Error('size'); const imported = validateBook(JSON.parse(await file.text())); commit(imported); setIndex(0); setToast(t.loaded); } catch { setToast(t.importError); }
    setMenu(false);
  }
  function filename() { return book.title.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').slice(0, 80) || 'Matiane'; }
  async function print() { setExporting(true); setProgress(0); try { const { exportPdf } = await import('./pdf'); const data = await exportPdf(book, { bleed }, setProgress); download(data, `${filename()}-A5.pdf`, 'application/pdf'); setModal(null); setToast(t.done); } catch (error) { console.error('PDF export failed', error); setToast(t.exportError); } finally { setExporting(false); } }
  if (!book) return <div className="loading"><LoaderCircle className="spin" />{t.loading}</div>;
  const page = book.pages[index], warnings = issues(book), usedPhotos = new Set(book.pages.flatMap(p => p.photos));
  const uniqueWarnings = [...new Map(warnings.map(w => [`${w.page}-${w.type}`, w])).values()];
  return <>
    <header className="site-header">
      <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="Matiane"><span className="brand-mark">m<span>✳</span></span><span>{language === 'ka' ? 'მატიანე' : 'matiane'}<small>{t.tagline}</small></span></a>
      <div className="header-center"><span className="live-dot" />{t.studio}</div>
      <div className="header-actions"><span className={`save-indicator ${saveStatus}`} title={t.localOnly}>{saveStatus === 'saved' ? <Check size={13} /> : <LoaderCircle size={13} />}{t[saveStatus]}</span><div className="language-switch" aria-label="Language"><button className={language === 'en' ? 'active' : ''} onClick={() => setBook({ ...book, language: 'en' })} aria-pressed={language === 'en'}>EN</button><button className={language === 'ka' ? 'active' : ''} onClick={() => setBook({ ...book, language: 'ka' })} aria-pressed={language === 'ka'}>ქარ</button></div><button className="primary export-top" onClick={() => { setAcceptWarnings(false); setModal('export'); }}><Download size={15} />{t.export}<ArrowUpRight size={15} /></button></div>
    </header>
    <div className="project-bar"><div className="project-heading"><span className="eyebrow">MATIANE / {t.studio}</span><div className="book-title-row"><input aria-label={t.untitled} value={book.title} maxLength={100} onChange={e => commit({ ...book, title: e.target.value })} /><span className="format-pill">A5</span></div></div><div className="project-tools"><span className="page-count">{String(book.pages.length).padStart(2, '0')} {t.pages}</span><span className="tool-separator" /><IconButton title={t.undo} onClick={undo} disabled={!history.length || uploading}><Undo2 size={17} /></IconButton><IconButton title={t.redo} onClick={redo} disabled={!future.length || uploading}><Redo2 size={17} /></IconButton><button className="text-button" onClick={() => { setPreviewIndex(index); setModal('preview'); }}><Eye size={17} />{t.preview}</button><div className="menu-wrap"><IconButton title={t.project} onClick={() => setMenu(!menu)} disabled={uploading}><MoreHorizontal size={22} /></IconButton>{menu && <><button className="menu-dismiss" aria-label={t.close} onClick={() => setMenu(false)} /><div className="project-menu"><button onClick={saveProject}><Download size={16} />{t.saveProject}</button><button onClick={() => projectInput.current.click()}><FolderOpen size={16} />{t.openProject}</button><button onClick={() => { if (window.confirm(t.newConfirm)) { commit({ ...newBook(), language, title: t.blankBook }); setIndex(0); } setMenu(false); }}><Plus size={16} />{t.newProject}</button></div></>}</div></div></div>
    <main className="studio-grid">
      <aside className="photo-panel"><div className="panel-heading"><h2>{t.photos}</h2><p>{t.photoIntro}</p></div><button className="upload-zone" onClick={() => photoInput.current.click()} disabled={uploading} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files); }}><span className="upload-icon">{uploading ? <LoaderCircle className="spin" size={23} /> : <Upload size={23} />}</span><strong>{uploading ? t.uploadBusy : t.upload}</strong><small>{t.uploadHint}</small></button><div className="library-heading"><h3>{t.library}</h3><span>{book.photos.length}</span></div><p className="placement-hint">{t.placeHint}</p><div className="photo-library">{book.photos.map(photo => <div className={`library-photo ${page.photos.includes(photo.id) ? 'in-page' : ''}`} key={photo.id}><button title={`${t.shortcut}: ${photo.name}`} aria-label={`${t.photos}: ${photo.name}`} onClick={() => assignPhoto(photo.id)} draggable onDragStart={e => e.dataTransfer.setData('text/matiane-photo', photo.id)}><img src={photo.src} alt={photo.name} loading="lazy" />{usedPhotos.has(photo.id) && <span className="photo-used"><Check size={11} /></span>}{photo.demo && <span className="demo-tag">DEMO</span>}</button><button className="remove-photo" title={t.removePhoto} aria-label={`${t.removePhoto}: ${photo.name}`} onClick={() => removePhoto(photo.id)}><X size={11} /></button></div>)}{!book.photos.length && <div className="no-photos"><ImageIcon size={32} /><p>{t.noPhotos}</p></div>}</div><button className="secondary fill-button" onClick={fill} disabled={!book.photos.length}><Plus size={14} />{t.autoFill}</button>{book.photos.some(p => p.demo) && <div className="sample-note"><Leaf size={16} /><div><strong><a href="/photos/SOURCES.md" target="_blank" rel="noreferrer">{t.samples}</a></strong><p>{t.sampleHint}</p></div></div>}<div className="privacy-note"><span className="live-dot" />{t.privacy}</div></aside>
      <section className="workspace" aria-label={t.studio}><div className="canvas-toolbar"><div><BookOpen size={15} /><span>{t.page} <b>{String(index + 1).padStart(2, '0')}</b><span className="muted"> / {String(book.pages.length).padStart(2, '0')}</span></span></div><div className="zoom-controls"><IconButton title={t.zoomOut} onClick={() => setZoom(Math.max(70, zoom - 10))} disabled={zoom === 70}><Minus size={14} /></IconButton><span>{zoom}%</span><IconButton title={t.zoomIn} onClick={() => setZoom(Math.min(130, zoom + 10))} disabled={zoom === 130}><Plus size={14} /></IconButton></div></div><div className="canvas-stage"><div className="paper-measure"><span>148 mm</span></div><div className="page-with-navigation"><IconButton title={t.prev} onClick={() => setIndex(index - 1)} disabled={index === 0}><ChevronLeft size={22} /></IconButton><div className="page-wrapper" style={{ width: `${Math.round(326 * zoom / 100)}px` }}><PageCanvas page={page} photos={book.photos} t={t} selected={selectedFrame} onSelect={(slot, photoId) => { setSelectedFrame(slot); if (photoId) assignPhoto(photoId, slot); }} /></div><IconButton title={t.next} onClick={() => setIndex(index + 1)} disabled={index === book.pages.length - 1}><ChevronRight size={22} /></IconButton></div><div className="canvas-footer"><span>{t.format}</span><span className="footer-dot">·</span><span>{t.portrait}</span></div></div><div className="filmstrip-section"><div className="filmstrip-heading"><span>{t.pages} <b>{book.pages.length}</b></span><div><IconButton title={t.moveLeft} disabled={index === 0} onClick={() => movePage(-1)}><ArrowLeft size={14} /></IconButton><IconButton title={t.moveRight} disabled={index === book.pages.length - 1} onClick={() => movePage(1)}><ArrowRight size={14} /></IconButton><span className="tool-separator" /><IconButton title={t.duplicate} onClick={() => addPage(true)} disabled={book.pages.length >= 80}><Copy size={14} /></IconButton><IconButton title={t.deletePage} onClick={deletePage} disabled={book.pages.length === 1}><Trash2 size={14} /></IconButton></div></div><div className="filmstrip">{book.pages.map((p, i) => <button className={`page-thumb ${index === i ? 'selected' : ''}`} key={p.id} onClick={() => setIndex(i)} aria-label={`${t.page} ${i + 1}`} aria-pressed={index === i}><div className="thumbnail-paper"><PageCanvas page={p} photos={book.photos} t={t} tiny /></div><span>{String(i + 1).padStart(2, '0')}</span></button>)}<button className="add-page" onClick={() => addPage()} disabled={book.pages.length >= 80}><Plus size={21} /><span>{t.addPage}</span></button></div></div></section>
      <aside className="design-panel"><div className="panel-heading"><h2>{t.styleTitle}</h2><p>{t.styleIntro}</p></div><div className="design-tabs" role="tablist"><button role="tab" aria-selected={tab === 'layout'} onClick={() => setTab('layout')}>{t.layout}</button><button role="tab" aria-selected={tab === 'caption'} onClick={() => setTab('caption')}>{t.caption}</button></div>{tab === 'layout' ? <><div className="control-section"><h3>{t.pageLayout}</h3><div className="layout-grid">{LAYOUTS.map(layout => <button key={layout} className={`layout-choice ${page.layout === layout ? 'selected' : ''}`} onClick={() => { const photos = Array.from({ length: CAPACITY[layout] }, (_, i) => page.photos[i] || null); patchPage({ layout, photos }); setSelectedFrame(0); }} aria-pressed={page.layout === layout}><LayoutIcon layout={layout} /><span>{t[layout]}</span>{page.layout === layout && <span className="layout-check"><Check size={10} /></span>}</button>)}</div></div><div className="control-section"><h3>{t.pageColor}</h3><div className="swatches">{COLORS.map(c => <button key={c} style={{ background: c }} className={page.color === c ? 'selected' : ''} onClick={() => patchPage({ color: c })} aria-label={`${t.pageColor} ${c}`} aria-pressed={page.color === c}>{page.color === c && <Check size={15} color={darkColor(c) ? 'white' : '#454b40'} />}</button>)}</div></div><div className="control-section crop-controls"><div className="section-title"><h3>{t.position}</h3><IconButton title={t.reset} onClick={() => patchPage({ focus: { x: 50, y: 50 } })}><RotateCcw size={13} /></IconButton></div>{['x', 'y'].map(axis => <label key={axis}><span>{axis === 'x' ? t.horizontal : t.vertical}</span><input type="range" min="0" max="100" value={page.focus[axis]} onChange={e => patchPage({ focus: { ...page.focus, [axis]: Number(e.target.value) } })} /></label>)}</div></> : <><div className="control-section"><label className="control-label" htmlFor="caption-input">{t.captionLabel}</label><textarea id="caption-input" placeholder={t.captionHint} value={page.caption} maxLength={300} onChange={e => patchPage({ caption: e.target.value })} /><div className="character-count">{page.caption.length} / 300</div></div><div className="control-section"><h3>{t.typography}</h3><div className="font-options">{['serif', 'sans'].map(font => <button key={font} className={page.font === font ? 'selected' : ''} aria-pressed={page.font === font} onClick={() => patchPage({ font })}><span className={font}>Aa</span>{t[font]}</button>)}</div><label className="range-label"><span>{t.fontSize}<b>{page.fontSize} pt</b></span><input type="range" min="8" max="22" value={page.fontSize} onChange={e => patchPage({ fontSize: Number(e.target.value) })} /></label></div><div className="control-section"><h3>{t.alignment}</h3><div className="align-controls">{[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([align, Icon]) => <button key={align} className={page.align === align ? 'selected' : ''} aria-label={t[align]} aria-pressed={page.align === align} onClick={() => patchPage({ align })}><Icon size={18} /></button>)}</div><p className="small-note">{t.captionFit}</p></div></>}<div className="design-footer"><span>✳</span><p>{t.tagline}</p><small>MATIANE — {t.format}</small></div></aside>
    </main>
    <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden ref={photoInput} onChange={e => { upload(e.target.files); e.target.value = ''; }} /><input type="file" accept=".json,.matiane" hidden ref={projectInput} onChange={e => { openProject(e.target.files[0]); e.target.value = ''; }} />
    {toast && <div className="toast" role="status"><Check size={16} /><span>{toast}</span><IconButton title={t.close} onClick={() => setToast('')}><X size={14} /></IconButton></div>}
    {modal === 'export' && <Modal label={t.export} onClose={() => setModal(null)} busy={exporting}><div className="modal-heading"><span className="eyebrow">MATIANE / PRINT</span><IconButton title={t.close} disabled={exporting} onClick={() => setModal(null)}><X size={20} /></IconButton></div><h2>{t.printTitle}</h2><p className="modal-intro">{t.printIntro}</p><div className="export-book-summary"><BookOpen size={30} /><div><strong>{book.title || 'Matiane'}</strong><span>{book.pages.length} {t.pages} · {t.format}</span></div></div><p className="small-note">{t.exportInfo}</p><label className="bleed-option"><input type="checkbox" checked={bleed} disabled={exporting} onChange={e => setBleed(e.target.checked)} /><div><strong>{t.bleed}</strong><small>{bleed ? t.bleedHint : t.noBleed}</small></div></label><div className="preflight"><h3>{t.review}</h3>{uniqueWarnings.length ? <><div className="warning-list">{uniqueWarnings.map((w, i) => <div key={i}><AlertTriangle size={15} /><span>{t.page} {w.page}: {w.type === 'empty' ? t.emptyFrame : `${t.lowRes} (${w.dpi} ${t.dpi})`}</span></div>)}</div><label className="warning-accept"><input type="checkbox" checked={acceptWarnings} disabled={exporting} onChange={e => setAcceptWarnings(e.target.checked)} /><span>{t.warningAccept}</span></label></> : <p className="good-quality"><Check size={16} />{t.good}</p>}{book.photos.some(p => p.demo) && <p className="small-note">{t.sampleWarning}</p>}</div><button className="primary download-pdf" disabled={exporting || (warnings.length > 0 && !acceptWarnings)} onClick={print}>{exporting ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}{exporting ? `${t.exporting} ${Math.round(progress * 100)}%` : t.downloadPdf}</button><p className="export-footer">{t.bleedFooter}</p></Modal>}
    {modal === 'preview' && <Modal label={t.preview} onClose={() => setModal(null)}><div className="modal-heading"><span className="eyebrow">{t.previewTitle}</span><IconButton title={t.close} onClick={() => setModal(null)}><X size={20} /></IconButton></div><div className="preview-stage"><IconButton title={t.prev} onClick={() => setPreviewIndex(previewIndex - 1)} disabled={previewIndex === 0}><ChevronLeft /></IconButton><div className="preview-page"><PageCanvas page={book.pages[previewIndex]} photos={book.photos} t={t} /></div><IconButton title={t.next} onClick={() => setPreviewIndex(previewIndex + 1)} disabled={previewIndex === book.pages.length - 1}><ChevronRight /></IconButton></div><div className="preview-counter">{t.page} {previewIndex + 1} / {book.pages.length}</div></Modal>}
  </>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
