"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, Check, Copy, Download, Feather, Search, Sparkles } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { newUiId } from "@/lib/ui-id";
import type { BookCitation as Citation, BookCollectionView, BookSummary } from "@/lib/books/types";
import type { BookDraft } from "@/lib/books/drafts";
import { booksJson, copyBookText } from "./client";
import { BookCitation } from "./BookCitation";

type SearchResult = { status: string; query: string; results: Citation[]; coverage: { fragmentsConsidered: number; booksSearched: number; corpusLimited: boolean }; warnings: string[] };
type DraftSummary = { id: string; available: boolean; title?: string; updatedAt?: string; mode?: string };

export function WritingDesk({ books, collections, selected, onSelected, active = true, visit = 0, causaId, writingDraftId }: { books: BookSummary[]; collections: BookCollectionView[]; selected: string[]; onSelected: (ids: string[]) => void; active?: boolean; visit?: number; causaId?: string; writingDraftId?: string }) {
  const id = useId(), [collectionIds, setCollectionIds] = useState<string[]>([]), [query, setQuery] = useState(""), [instruction, setInstruction] = useState(""), [existingText, setExistingText] = useState(""), [title, setTitle] = useState(""), [mode, setMode] = useState<"extractive" | "ai">("extractive"), [busy, setBusy] = useState(""), [error, setError] = useState(""), [message, setMessage] = useState(""), [result, setResult] = useState<(SearchResult & { visit: number }) | null>(null), [draft, setDraft] = useState<BookDraft | null>(null), [prose, setProse] = useState(""), [draftTitle, setDraftTitle] = useState(""), [draftHistory, setDraftHistory] = useState<{ visit: number; drafts: DraftSummary[] }>(), [manual, setManual] = useState(""), [showPreview, setShowPreview] = useState(false);
  const submission = useRef({ signature: "", requestId: "" });
  const [saveFailed, setSaveFailed] = useState(false), [protectedDraft, setProtectedDraft] = useState(false), [recheck, setRecheck] = useState(0);
  const [preparedSignature, setPreparedSignature] = useState(JSON.stringify(["", "", "", ""]));
  const [accessState, setAccessState] = useState<{ key: string }>();
  const accessKey = `${draft?.id || ""}:${visit}:${recheck}`;
  const checking = active && Boolean(draft) && accessState?.key !== accessKey;
  const preparationSignature = JSON.stringify([query, instruction, existingText, title]);
  const visitRef = useRef(visit);
  useEffect(() => { visitRef.current = visit; }, [visit]);
  const drafts = draftHistory?.visit === visit ? draftHistory.drafts : [];
  const hasSelection = selected.length + collectionIds.length > 0;
  const dirty = Boolean(draft && (prose !== draft.prose || draftTitle !== draft.title));
  const unsaved = dirty || preparationSignature !== preparedSignature;
  const pending = unsaved || Boolean(busy);
  useEffect(() => {
    if (!active || !draft?.id) return;
    const controller = new AbortController();
    // Returning to a mounted desk must recheck access without replacing local edits.
    void booksJson<BookDraft>(`/api/books/drafts/${draft.id}`, controller.signal).then(() => {
      if (!controller.signal.aborted) { setAccessState({ key: accessKey }); setProtectedDraft(false); }
    }).catch(reason => {
      if (!controller.signal.aborted) { setAccessState({ key: accessKey }); setProtectedDraft(true); setError(reason instanceof Error ? reason.message : "No se pudo comprobar el acceso al escrito."); }
    });
    return () => controller.abort();
  }, [active, draft?.id, accessKey]);
  useEffect(() => {
    if (!pending) return;
    const leaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const link = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const anchor = (event.target as Element)?.closest("a");
      if (!anchor || anchor.hasAttribute("download") || anchor.target && anchor.target !== "_self") return;
      const target = new URL(anchor.href, location.href);
      if (target.origin !== location.origin || target.href.split("#")[0] === location.href.split("#")[0] || target.pathname.startsWith("/api/")) return;
      if (busy || !window.confirm("Hay trabajo sin guardar en tu mesa. ¿Salir y descartar esos cambios?")) {
        event.preventDefault(); event.stopPropagation();
        if (busy) setMessage("Espera a que termine la operación antes de salir de tu mesa.");
      }
    };
    // The Navigation API can cancel SPA back/forward before the desk unmounts.
    const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
    const traverse = (event: Event) => {
      const move = event as Event & { navigationType?: string; destination?: { sameDocument?: boolean } };
      if (!event.cancelable || move.navigationType !== "traverse" || !move.destination?.sameDocument) return;
      if (busy || !window.confirm("Hay trabajo sin guardar en tu mesa. ¿Salir y descartar esos cambios?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", leaving); document.addEventListener("click", link, true); navigation?.addEventListener("navigate", traverse);
    return () => { window.removeEventListener("beforeunload", leaving); document.removeEventListener("click", link, true); navigation?.removeEventListener("navigate", traverse); };
  }, [pending, busy]);
  function replaceDraft() {
    return !busy && (!dirty || window.confirm("Este borrador tiene cambios sin guardar. ¿Descartarlos y abrir otro borrador?"));
  }
  useEffect(() => { if (!active) return; const controller = new AbortController(); void booksJson<{ drafts: DraftSummary[] }>("/api/books/drafts", controller.signal).then(data => { if (!controller.signal.aborted) setDraftHistory({ visit, drafts: data.drafts }); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [active, visit]);
  async function history() { const data = await booksJson<{ drafts: DraftSummary[] }>("/api/books/drafts"); setDraftHistory({ visit: visitRef.current, drafts: data.drafts }); }
  function displayDraft(value: BookDraft) { setSaveFailed(false); setProtectedDraft(false); setDraft(value); setProse(value.prose); setDraftTitle(value.title); setManual(""); setShowPreview(false); }
  async function search() {
    setBusy("search"); setError(""); setMessage(""); setResult(null);
    const response = await apiMutation<SearchResult>("/api/books/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, bookIds: selected, collectionIds }) });
    setBusy(""); if (!response.ok) setError(response.error); else { setResult({ ...response.data, visit }); if (!response.data.results.length) setMessage("No encontramos pasajes comprobables para esta búsqueda. Pruebe otros términos o elija más libros."); }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!replaceDraft()) return; setBusy("create"); setError(""); setMessage("");
    const payload = { title: title.trim() || query.slice(0, 120), query, instruction: instruction.trim() || "Organiza una fundamentación con los pasajes de los libros seleccionados y sus citas.", existingText, bookIds: selected, collectionIds, mode };
    const signature = JSON.stringify(payload); if (signature !== submission.current.signature) submission.current = { signature, requestId: newUiId("book-draft") };
    const response = await apiMutation<{ status: string; draft: BookDraft | null; warnings: string[] }>("/api/books/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId: submission.current.requestId }) });
    setBusy(""); if (!response.ok) { setError(response.error); return; }
    if (!response.data.draft) { setMessage(response.data.warnings?.join(" ") || "No hay pasajes comprobables. No se generó un borrador."); return; }
    displayDraft(response.data.draft); setPreparedSignature(preparationSignature); setMessage("Borrador conservado con referencias comprobadas. Revise su contenido antes de utilizarlo."); void history().catch(() => {});
  }
  async function openDraft(draftId: string) {
    if (!replaceDraft()) return;
    setBusy("read"); setError(""); setMessage(""); setManual("");
    try { displayDraft(await booksJson<BookDraft>(`/api/books/drafts/${draftId}`)); }
    catch (e) { setProtectedDraft(true); setError(e instanceof Error ? e.message : "No se pudo comprobar el borrador."); }
    finally { setBusy(""); }
  }
  async function save() {
    if (!draft || busy || protectedDraft || checking) return; setBusy("save"); setError(""); setMessage("");
    const response = await apiMutation<BookDraft>(`/api/books/drafts/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: draft.revision, title: draftTitle, body: prose }) });
    setBusy(""); if (!response.ok) { setSaveFailed(true); if ([401, 403, 404, 409].includes(response.status)) setProtectedDraft(true); setError(`${response.error}. Tu texto sigue en esta mesa. Reintenta guardar antes de salir.`); } else { displayDraft(response.data); setMessage("Cambios guardados; las notas de fuente se recompusieron desde las citas comprobadas."); void history().catch(() => {}); }
  }
  async function copy() {
    if (!draft) return; setBusy("copy"); setError(""); setManual("");
    try { const current = await booksJson<BookDraft>(`/api/books/drafts/${draft.id}`); displayDraft(current); if (await copyBookText(current.body)) setMessage("Borrador y citas copiados después de comprobar las fuentes."); else { setManual(current.body); setMessage("Fuentes comprobadas. Seleccione el texto para copiar el borrador."); } }
    catch (e) { setDraft(null); setProse(""); setError(e instanceof Error ? e.message : "Las fuentes ya no pudieron comprobarse."); }
    finally { setBusy(""); }
  }
  return <section className="book-writing-desk" id="mesa-de-escritura" aria-labelledby={`${id}-heading`}>
    <div className="book-desk-heading"><div><h2 id={`${id}-heading`}>Tu mesa de escritura</h2><p>De tus libros a tus argumentos, con la fuente conservada siempre a mano.</p></div><Feather size={35} strokeWidth={1.1} aria-hidden="true" /></div>
    <div className="book-desk-session" data-pending={unsaved || saveFailed} role="status"><strong>{busy === "save" ? "Guardando el escrito…" : saveFailed ? "Guardado pendiente · reintenta" : checking ? "Comprobando acceso y fuentes…" : protectedDraft ? "Acceso pendiente de comprobar" : dirty ? "Cambios sin guardar" : preparationSignature !== preparedSignature ? "Preparación sin guardar" : draft ? `Guardado · revisión ${draft.revision}` : "Mesa en preparación"}</strong><span>{unsaved ? "Tu trabajo se mantiene al cambiar de apartado. Guarda el borrador antes de salir de la biblioteca." : "Los borradores guardados conservan sus citas. Puedes continuar consultando tus libros."}</span></div>
    <div className="book-desk-grid"><aside className="book-source-picker"><h3>Libros sobre la mesa</h3><p className="book-small">Elige los libros y colecciones que podrán aportar pasajes.</p><div className="book-source-picker-list">{books.length ? books.map(book => <label key={book.id} className="book-source-choice"><input type="checkbox" checked={selected.includes(book.id)} onChange={event => onSelected(event.target.checked ? [...selected, book.id] : selected.filter(value => value !== book.id))} /><BookOpen size={18} /><span><strong>{book.title}</strong><small>{book.author || "Autor no indicado"}{!book.owned ? ` · De ${book.ownerName}` : ""}</small></span></label>) : <p className="book-small">Añade tu primer libro para empezar a fundamentar.</p>}</div>{collections.length > 0 && <div className="book-desk-collections"><h3>Colecciones</h3>{collections.map(collection => <label key={collection.id} className="book-check"><input type="checkbox" checked={collectionIds.includes(collection.id)} onChange={event => setCollectionIds(event.target.checked ? [...collectionIds, collection.id] : collectionIds.filter(value => value !== collection.id))} /><span>{collection.name}{!collection.owned && <small> · Compartida por {collection.ownerName}</small>}</span></label>)}</div>}<div className="book-draft-history"><h3>Escritos guardados</h3>{drafts.length ? drafts.map(value => value.available === false ? <p key={value.id} className="book-small">Un escrito perdió acceso a alguna fuente.</p> : <button type="button" key={value.id} className="book-history-link" onClick={() => void openDraft(value.id)} disabled={Boolean(busy) || checking}>{value.title || "Borrador"}<span>Abrir y comprobar fuentes</span></button>) : <p className="book-small">Tus borradores aparecerán aquí.</p>}</div></aside>
    <div className="book-writing-paper"><form onSubmit={create} className="book-form"><fieldset className="book-preparation-fields" disabled={Boolean(busy)}><div className="book-field"><label htmlFor={`${id}-query`}>Qué necesitas fundamentar</label><textarea className="textarea" id={`${id}-query`} name="query" rows={3} maxLength={1000} minLength={3} required placeholder="Una cuestión jurídica, una expresión o los términos que quieres contrastar…" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="book-actions"><button className="btn btn-ghost" type="button" onClick={search} disabled={!hasSelection || query.trim().length < 3 || Boolean(busy)}><Search size={16} />{busy === "search" ? "Buscando pasajes…" : "Buscar pasajes"}</button><span className="book-small">Búsqueda local en el texto de los libros seleccionados.</span></div>
      <details className="book-writing-options"><summary>Preparar un escrito</summary><div className="book-form"><div className="book-field"><label htmlFor={`${id}-title`}>Título del escrito</label><input className="input" id={`${id}-title`} maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="Por ejemplo, fundamento de la solicitud" /></div><div className="book-field"><label htmlFor={`${id}-existing`}>Texto que ya has escrito</label><textarea className="textarea" id={`${id}-existing`} rows={5} maxLength={20_000} value={existingText} onChange={event => setExistingText(event.target.value)} placeholder="Opcional. Conservaremos este texto al preparar el borrador." /></div><div className="book-field"><label htmlFor={`${id}-instruction`}>Cómo quieres desarrollar la fundamentación</label><textarea className="textarea" id={`${id}-instruction`} rows={3} maxLength={3000} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="Propósito, estructura y puntos que debe tratar el borrador…" /></div><div className="book-field"><label htmlFor={`${id}-mode`}>Modo de preparación</label><select className="select" id={`${id}-mode`} value={mode} onChange={event => setMode(event.target.value as "extractive" | "ai")}><option value="extractive">Organizar pasajes sin IA</option><option value="ai">Redactar con la IA configurada del estudio</option></select><p className="book-small">La IA recibe los pasajes seleccionados según la política del estudio. El resultado es un borrador para revisión; la literalidad comprobada no acredita una conclusión jurídica.</p></div><button className="btn btn-primary" disabled={!hasSelection || query.trim().length < 3 || Boolean(busy)}>{mode === "ai" ? <Sparkles size={16} /> : <Feather size={16} />}{busy === "create" ? "Preparando y comprobando fuentes…" : "Crear borrador con citas"}</button></div></details>
    </fieldset></form>{error && <p className="book-error" role="alert">{error}</p>}{message && <p className="book-feedback" role="status">{message}</p>}
    {result && result.visit === visit && !protectedDraft && !checking && <section className="book-search-results"><h3>Pasajes para «{result.query}»</h3><p className="book-small">{result.coverage.booksSearched} libros consultados. {result.coverage.corpusLimited ? "Se alcanzó el límite de lectura; acota la selección para profundizar." : "Coincidencias recuperadas del texto preparado."}</p>{result.warnings.map(warning => <p key={warning} className="book-small">{warning}</p>)}{result.results.map(citation => <BookCitation key={citation.sourceKey} citation={citation} location={citation.locatorLabel} causaId={causaId} draftId={writingDraftId} />)}</section>}
    {draft && checking && <p className="book-small" role="status">Comprobando el acceso actual al escrito y sus fuentes…</p>}
    {draft && protectedDraft && <section className="book-protected-draft"><h3>Comprobar el acceso para continuar</h3><p>El escrito queda oculto mientras no se pueda comprobar el acceso a sus fuentes. Los cambios de esta sesión se conservan en memoria.</p><button className="btn btn-secondary" type="button" onClick={() => { setError(""); setRecheck(value => value + 1); }} disabled={checking}>Volver a comprobar</button></section>}
    {draft && !protectedDraft && !checking && <section className="book-saved-draft"><div className="book-section-title"><h3>Tu borrador</h3><p>{draft.modelUsed ? `Preparado con IA${draft.model ? ` · ${draft.model}` : ""}` : "Organización local de pasajes"} · Revisión {draft.revision}</p></div>{draft.warnings?.map(warning => <p key={warning} className="book-small">{warning}</p>)}<div className="book-field"><label htmlFor={`${id}-draft-title`}>Título guardado</label><input className="input" id={`${id}-draft-title`} value={draftTitle} maxLength={200} disabled={Boolean(busy)} onChange={event => setDraftTitle(event.target.value)} /></div><div className="book-field"><label htmlFor={`${id}-prose`}>Texto del borrador</label><textarea className="textarea book-prose-editor" id={`${id}-prose`} value={prose} disabled={Boolean(busy)} rows={14} maxLength={40_000} onChange={event => setProse(event.target.value)} /><p className="book-small">Conserva los marcadores de cita. Las notas se generan a partir de las fuentes y se incorporan al copiar o exportar.</p></div><div className="book-actions"><button className="btn btn-primary" type="button" onClick={save} disabled={!dirty || Boolean(busy)}><Check size={16} />{busy === "save" ? "Guardando…" : saveFailed ? "Reintentar guardado" : "Guardar escrito"}</button><button className="btn btn-ghost" type="button" onClick={copy} disabled={dirty || Boolean(busy)}><Copy size={16} />{busy === "copy" ? "Comprobando fuentes…" : "Copiar con citas"}</button>{!dirty && <><a href={`/api/books/drafts/${draft.id}/export?format=md`} className="book-text-action"><Download size={15} />Markdown</a><a href={`/api/books/drafts/${draft.id}/export?format=txt`} className="book-text-action"><Download size={15} />Texto</a></>}</div>{dirty && <p className="book-small">Hay cambios sin guardar. Guárdalos antes de copiar o exportar.</p>}<button className="book-text-action" type="button" onClick={() => setShowPreview(!showPreview)}>{showPreview ? "Ocultar texto con notas" : "Ver escrito con notas de fuente"}</button>{showPreview && <pre className="book-draft-preview">{draft.body}</pre>}<div className="book-draft-references"><h3>Fuentes del escrito</h3>{draft.citations.map(citation => <BookCitation key={citation.sourceKey} citation={citation} location={citation.locatorLabel} causaId={causaId} draftId={writingDraftId} />)}</div>{manual && <div className="book-field"><label htmlFor={`${id}-copy`}>Borrador con fuentes comprobadas</label><textarea id={`${id}-copy`} className="textarea" rows={12} readOnly value={manual} onFocus={event => event.currentTarget.select()} /></div>}</section>}
    </div></div>
  </section>;
}
