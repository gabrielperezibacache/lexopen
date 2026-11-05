"use client";

import { formatBookReference, judicialMetadataNotice } from "@/lib/books/references";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, LockKeyhole, Share2 } from "lucide-react";
import { ContextPanel } from "@/components/ui/ContextPanel";
import { BookObject } from "./BookObject";
import { BookCitation } from "./BookCitation";
import { BookSettings } from "./BookSettings";
import { bookStatusLabel, booksJson, type BookDetail } from "./client";
import { caseBookWritingHref, caseLibraryHref, libraryBookHref } from "@/lib/causas/workflow-links";
import "./library.css";

type ReaderTool = "passages" | "info" | "settings";
export function BookReader({ bookId, causaId, writingDraftId }: { bookId: string; causaId?: string; writingDraftId?: string }) {
  const id = useId(), panelId = `${id}-tools`;
  const [data, setData] = useState<BookDetail | null>(null), [reload, setReload] = useState(0), [after, setAfter] = useState(0), [page, setPage] = useState<number | null>(null), [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [panelOpen, setPanelOpen] = useState(false), [tool, setTool] = useState<ReaderTool>("info"), [settingsVisited, setSettingsVisited] = useState(false);
  useEffect(() => {
    const controller = new AbortController(), search = new URLSearchParams(window.location.search), fragment = Number(search.get("fragment") || 0);
    const requestedPage = Number(search.get("pagina")), physicalPage = page || (Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 500 ? requestedPage : null);
    const initialAfter = !physicalPage ? Math.max(after, Number.isSafeInteger(fragment) ? fragment - 1 : 0, 0) : after;
    const params = new URLSearchParams({ after: String(initialAfter) }); if (physicalPage) params.set("page", String(physicalPage));
    void booksJson<BookDetail>(`/api/books/${bookId}?${params}`, controller.signal).then(value => { if (!controller.signal.aborted) { setData(value); setLoadedPage(physicalPage); setError(""); setLoading(false); } }).catch(reason => { if (!controller.signal.aborted) { setData(null); setError(reason.message); setLoading(false); } });
    return () => controller.abort();
  }, [bookId, after, page, reload]);
  function update() { setReload(value => value + 1); }
  function showTool(value: ReaderTool) { setTool(value); if (value === "settings") setSettingsVisited(true); setPanelOpen(true); }
  function paginate(value: number) { setLoading(true); setAfter(value); }
  function changePage(value: number) { setPage(value); setAfter(0); setLoading(true); const url = new URL(location.href); url.searchParams.set("pagina", String(value)); url.searchParams.delete("fragment"); url.hash = ""; window.history.replaceState(null, "", url); }
  const book = data?.book, originalRetained = book?.originalRetained !== false;
  const imagePage = page || loadedPage || data?.fragments.find(fragment => fragment.pageNumber)?.pageNumber || data?.pages[0]?.pageNumber;
  const physical = Boolean(originalRetained && book?.locatorKind === "pdf-page" && imagePage);
  const restoredLocation = useRef(false);
  useEffect(() => {
    if (!physical || restoredLocation.current) return;
    restoredLocation.current = true;
    if (!new URLSearchParams(location.search).has("fragment") && !location.hash.startsWith("#fragment-")) return;
    const timer = setTimeout(() => { setTool("passages"); setPanelOpen(true); }, 0);
    return () => clearTimeout(timer);
  }, [physical]);
  const passages = book && data && <section className="book-reader-text" aria-labelledby={`${id}-passages`}>
    <div className="book-section-title"><h2 id={`${id}-passages`}>Pasajes preparados</h2><p>{!originalRetained ? "Referencias al texto conservado, sin atribuir páginas al archivo importado." : physical ? "Contrasta el texto con su página física; el reconocimiento automático puede contener errores." : "Referencias por sección o fragmento, sin atribuir páginas de una edición impresa."}</p></div>
    {data.fragments.length ? data.fragments.map(fragment => <article className="book-reader-fragment" id={`fragment-${fragment.ordinal}`} key={fragment.id}><h3>{fragment.locatorLabel}</h3><BookCitation citation={{ bookId, fragmentId: fragment.id, quote: fragment.text }} title={book.title} location={fragment.locatorLabel} verificationBasis={originalRetained ? "original" : "retained_text"} causaId={causaId} draftId={writingDraftId} /></article>) : <p className="book-small">{originalRetained ? "Esta selección no tiene pasajes de texto. Consulte el original o cambie de página." : "Esta selección no tiene pasajes. Descargue el texto conservado o cambie la selección."}</p>}
    <div className="book-actions">{(after > 0 || page) && <button className="btn btn-ghost" type="button" onClick={() => { setPage(null); setAfter(0); setLoading(true); window.history.replaceState(null, "", libraryBookHref(bookId, causaId, writingDraftId)); update(); }} disabled={loading}>Volver al comienzo</button>}{data.nextAfter !== null && <button className="btn btn-ghost" type="button" onClick={() => paginate(data.nextAfter!)} disabled={loading}>Leer siguientes pasajes<ArrowRight size={15} aria-hidden="true" /></button>}</div>
    {data.limited && <p className="book-small">Se muestran hasta 100 fragmentos por lectura. Continúe para recorrer los restantes.</p>}
  </section>;
  return <div className="personal-law-library book-reader" data-theme="walnut">
    <Link href={causaId ? caseLibraryHref(causaId, writingDraftId) : "/biblioteca"} className="book-reader-back"><ArrowLeft size={16} aria-hidden="true" />Volver a mi biblioteca</Link>
    {error && <div role="alert" className="book-error"><p>{error}</p><button className="btn btn-ghost" onClick={update}>Intentar de nuevo</button></div>}
    {loading && <p className="book-loading" role="status">Abriendo el libro y sus pasajes…</p>}
    {book && data && <>
      <header className="book-reading-heading"><h1>{book.title}</h1><p>{book.judicial?.court || book.author || "Autor no indicado"}</p><p className="book-ownership">{book.owned ? <><LockKeyhole size={14} aria-hidden="true" />Tu ejemplar privado</> : <><Share2 size={14} aria-hidden="true" />Compartido para lectura por {book.ownerName}</>}</p></header>
      {!originalRetained && <p className="book-conversion-notice" data-testid="book-retained-text-notice"><strong>Original no conservado.</strong> Las citas se comprueban contra el texto conservado. No hay cotejo visual del archivo importado.</p>}
      <div className="book-reading-actions">{physical && <button type="button" className="btn btn-primary" aria-controls={panelId} aria-expanded={panelOpen && tool === "passages"} onClick={() => showTool("passages")}>Pasajes y citas</button>}<button type="button" className="btn btn-ghost" aria-controls={panelId} aria-expanded={panelOpen && tool === "info"} onClick={() => showTool("info")}>Ficha y descargas</button><Link href={causaId ? caseBookWritingHref(causaId, book.id, writingDraftId) : `/biblioteca?escribir=${encodeURIComponent(book.id)}`} className="book-text-action">{causaId ? "Elegir pasajes para el escrito de la causa" : "Llevar este libro a la mesa"}<ArrowRight size={15} aria-hidden="true" /></Link></div>
      <div className="context-workspace book-reading-workspace">
        <div className="book-reading-canvas">{physical ? <section className="book-reading-original" aria-label="Original conservado"><div className="book-page-toolbar"><label className="book-field" htmlFor={`${id}-page`}>Página física del PDF<select className="select" id={`${id}-page`} aria-label="Página física del PDF" value={imagePage} onChange={event => changePage(Number(event.target.value))}>{data.pages.map(value => <option key={value.pageNumber} value={value.pageNumber}>Página {value.pageNumber}{value.method === "ocr" ? " · OCR" : ""}</option>)}</select></label><span className="book-small">Imagen del original conservado</span></div><Image src={`/api/books/${bookId}/pages/${imagePage}`} width={1200} height={1700} alt={`Página física ${imagePage} de ${book.title}`} unoptimized className="book-pdf-image" /></section> : passages}</div>
        <ContextPanel id={panelId} title="Herramientas de lectura" open={panelOpen} onClose={() => setPanelOpen(false)} className="book-reading-panel">
          <div className="context-panel-tools" aria-label="Herramientas del libro">{physical && <button type="button" aria-pressed={tool === "passages"} onClick={() => setTool("passages")}>Pasajes y citas</button>}<button type="button" aria-pressed={tool === "info"} onClick={() => setTool("info")}>Ficha y descargas</button>{book.owned && <button type="button" aria-pressed={tool === "settings"} onClick={() => showTool("settings")}>Personalizar este libro</button>}</div>
          {physical && <div hidden={tool !== "passages"}>{passages}</div>}
          <section hidden={tool !== "info"} className="book-reader-information"><div className="book-reader-info-cover"><BookObject book={book} /></div><h3>Ficha de la fuente</h3><p>{book.sourceType !== "book" ? formatBookReference(book) : [book.edition, book.publisher, book.year].filter(Boolean).join(" · ") || "Complete la ficha bibliográfica antes de usarla en un escrito."}</p>{book.judicial && <div className="book-judicial-notice"><p>{judicialMetadataNotice}</p>{book.judicial.officialUrl && <a href={book.judicial.officialUrl} target="_blank" rel="noopener noreferrer">Abrir enlace de procedencia declarado</a>}</div>}{book.identifier && <p>{book.identifier}</p>}<p>{bookStatusLabel[book.status] || book.status} · {book.pageCount ? `${book.pageCount} páginas físicas` : "Localización por pasaje"} · {book.fragmentCount} pasajes</p><div className="book-actions"><a className="btn btn-secondary" href={`/api/books/${bookId}/${originalRetained ? "original" : "text"}`}><Download size={16} aria-hidden="true" />{originalRetained ? "Descargar original" : "Descargar texto conservado"}</a>{originalRetained && book.convertedToText && <a className="book-text-action" href={`/api/books/${bookId}/text`}>Descargar texto preparado</a>}</div><details className="book-original-details"><summary>{originalRetained ? "Identidad del original conservado" : "Identidad del texto conservado"}</summary><p>Archivo de procedencia: {book.sourceName}</p><p className="book-file-hash">{originalRetained ? "SHA-256 del original conservado" : "Huella de procedencia del archivo importado, no conservado"}: {book.sourceSha256}</p>{!originalRetained && book.retainedSha256 && <p className="book-file-hash">SHA-256 del texto conservado: {book.retainedSha256}</p>}<p>La ficha bibliográfica es aportada por el propietario. El cotejo no certifica su autoría ni vigencia.</p></details></section>
          {book.owned && settingsVisited && <div hidden={tool !== "settings"}><BookSettings key={`${book.id}:${book.revision}`} book={book} onSaved={() => { setTool("info"); update(); }} /></div>}
        </ContextPanel>
      </div>
    </>}
  </div>;
}
