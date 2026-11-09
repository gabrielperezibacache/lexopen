"use client";

import Link from "next/link";
import { BookmarkCitationButton } from "@/components/knowledge/BookmarkCitationButton";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BookOpen, Copy, Search } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import type { ResearchCitation, ResearchResult } from "@/lib/research/service";
import "./knowledge/knowledge.css";

const labels = { legislation: "Legislación", jurisprudence: "Jurisprudencia", administrative: "Documentos administrativos", doctrine: "Doctrina", case_document: "Documentos del expediente", space_file: "Archivos del espacio" };
type Kind = Exclude<keyof typeof labels, "case_document" | "space_file">;
type Source = { id: string; title: string; organism: string; canonicalUrl: string; versions: { id: string; acquisitionMethod: string; retrievedAt: string }[] };
type Run = { id: string; query: string; createdAt: string };
type LibraryCollection = {id: string; name: string; scopeLabel: string; itemCount: number; causaId: string | null; siteId: string | null};
type Matter = { id: string; titulo: string; rit?: string | null };
const subscribeReady = () => () => {};
const readySnapshot = () => true;
const initialSnapshot = () => false;
const date = (value: string) => new Date(value).toLocaleDateString("es-CL", { timeZone: "UTC" });

export function LegalResearchWorkbench({ initialCases, initialRunId }: { initialCases: Matter[]; initialRunId?: string }) {
  const ready = useSyncExternalStore(subscribeReady, readySnapshot, initialSnapshot);
  const [view, setView] = useState<"query" | "sources" | "history">("query");
  const [query, setQuery] = useState("");
  const [causaId, setCausaId] = useState("");
  const [caseFilter, setCaseFilter] = useState("");
  const [cases, setCases] = useState(initialCases);
  const [sites, setSites] = useState<{id: string; name: string}[]>([]);
  const [siteId, setSiteId] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [fileState, setFileState] = useState<{siteId: string; q: string; files: {id: string; name: string}[]; limited: boolean}>({ siteId: "", q: "", files: [], limited: false });
  const siteLoading = Boolean(siteId) && (fileState.siteId !== siteId || fileState.q !== fileFilter);
  const siteFiles = !siteLoading ? fileState.files : [];
  const siteFilesLimited = !siteLoading && fileState.limited;
  const [selectedSiteFiles, setSelectedSiteFiles] = useState<string[] | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<string[] | null>(null);
  const [libraryCollections, setLibraryCollections] = useState<LibraryCollection[]>([]);
  const [libraryIds, setLibraryIds] = useState<string[]>([]);
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [kinds, setKinds] = useState<Kind[]>(["legislation", "jurisprudence", "administrative", "doctrine"]);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(initialRunId ? "history" : "");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const [manual, setManual] = useState(false);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [copyText, setCopyText] = useState("");
  const copyRef = useRef<HTMLTextAreaElement>(null);
  const active = useRef<AbortController | null>(null);
  const receiveResult = useCallback((data: ResearchResult) => { setResult(data); setQuery(data.query); setCausaId(data.scope.causaId || ""); setKinds(data.scope.sourceKinds); setSelectedDocuments(data.scope.selectedDocumentIds); setSiteId(data.scope.siteId || ""); setSelectedSiteFiles(data.scope.selectedSiteFileIds ?? null); setLibraryIds(data.scope.librarySelections?.map(selection => selection.collectionId) || []); setLibraryOnly(Boolean(data.scope.libraryOnly)); }, []);

  useEffect(() => {
    const controller = new AbortController();
    const get = async (path: string) => { const response = await fetch(path, { cache: "no-store", signal: controller.signal }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron cargar las fuentes"); return data; };
    void Promise.all([get("/api/research/sources"), get("/api/research"), get("/api/research/scope"), get("/api/knowledge/collections")]).then(([corpus, history, scope, library]) => { if (!controller.signal.aborted) { setSources(corpus.sources); setRuns(history.runs); setLibraryCollections(library.collections); setSites(previous => [...previous.filter(site => !scope.sites.some((current: {id: string}) => current.id === site.id)), ...scope.sites]); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    const refresh = () => { setResult(null); setCopyText(""); setReload(n => n + 1); setStatus("La biblioteca cambió. Revise la selección y consulte de nuevo."); const location = new URL(window.location.href); location.searchParams.delete("investigacion"); window.history.replaceState(null, "", location); };
    window.addEventListener("lexopen-library-changed", refresh); return () => window.removeEventListener("lexopen-library-changed", refresh);
  }, []);
  useEffect(() => {
    if (!initialRunId) return;
    const controller = new AbortController();
    void fetch(`/api/research/${initialRunId}`, { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo recuperar la consulta"); return data; }).then(data => { if (!controller.signal.aborted) receiveResult(data); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(""); });
    return () => controller.abort();
  }, [initialRunId, receiveResult]);
  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    void fetch(`/api/research/scope?siteId=${encodeURIComponent(siteId)}&q=${encodeURIComponent(fileFilter)}`, { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron cargar los archivos"); return data; }).then(data => { if (!controller.signal.aborted) { setFileState({ siteId, q: fileFilter, files: data.files, limited: data.limited }); setSites(previous => previous.some(site => site.id === data.site.id) ? previous : [data.site, ...previous]); } }).catch(e => { if (!controller.signal.aborted) { setFileState({ siteId, q: fileFilter, files: [], limited: false }); setError(e.message); } });
    return () => controller.abort();
  }, [siteId, fileFilter]);
  useEffect(() => {
    if (!causaId || cases.some(c => c.id === causaId)) return;
    const controller = new AbortController();
    void fetch(`/api/causas/${causaId}`, { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "El expediente dejó de estar accesible"); return data; }).then(data => { if (!controller.signal.aborted) setCases(previous => previous.some(c => c.id === data.id) ? previous : [data, ...previous]); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [causaId, cases]);
  useEffect(() => { if (copyText) { copyRef.current?.focus(); copyRef.current?.select(); } }, [copyText]);
  useEffect(() => () => active.current?.abort(), []);
  function invalidateResult() {
    if (result) setStatus("La consulta o su alcance cambiaron. Consulte de nuevo para obtener otros resultados.");
    setResult(null); setCopyText("");
    const url = new URL(window.location.href); url.searchParams.delete("investigacion"); window.history.replaceState(null, "", url);
  }

  async function search() {
    setBusy("search"); setError(""); setStatus(""); setResult(null);
    const response = await apiMutation<ResearchResult>("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, ...(libraryIds.length ? { libraryCollectionIds: libraryIds, libraryOnly } : {}), ...(causaId ? { causaId } : {}), ...(siteId ? { siteId, ...(selectedSiteFiles !== null ? { siteFileIds: selectedSiteFiles } : {}) } : {}), ...(selectedDocuments !== null ? { documentIds: selectedDocuments } : {}), sourceKinds: kinds, limit: 10 }) });
    setBusy("");
    if (!response.ok) { setError(response.error); return; }
    receiveResult(response.data); setReload(n => n + 1);
    const location = new URL(window.location.href); location.searchParams.set("investigacion", response.data.id); window.history.replaceState(null, "", location);
  }
  async function filterCases() {
    invalidateResult();
    setBusy("cases"); setError("");
    try { const response = await fetch(`/api/causas?q=${encodeURIComponent(caseFilter)}&limit=100`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron buscar las causas"); setCases(data); setCausaId(""); setSelectedDocuments(null); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron buscar las causas"); }
    finally { setBusy(""); }
  }
  async function importSource() {
    setBusy("import"); setError(""); setStatus("");
    const controller = new AbortController(); active.current = controller;
    const response = await apiMutation<{ title: string; warnings: string[] }>("/api/research/sources", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(manual ? { mode: "manual", url, title: sourceTitle, text: sourceText, ...(sourceDate ? { publishedAt: sourceDate } : {}) } : { mode: "url", url }) });
    active.current = null; setBusy("");
    if (controller.signal.aborted) { setStatus("Solicitud cancelada. Revise las fuentes disponibles antes de reintentar."); setReload(n => n + 1); return; }
    if (!response.ok) { setError(response.error); return; }
    setStatus(`Fuente incorporada: ${response.data.title}. ${response.data.warnings.join(" ")}`); setReload(n => n + 1); setSourceText("");
  }
  async function restore(id: string) {
    setBusy("history"); setError(""); setResult(null);
    try { const response = await fetch(`/api/research/${id}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo abrir la consulta"); receiveResult(data); setView("query"); const location = new URL(window.location.href); location.searchParams.set("investigacion", id); window.history.replaceState(null, "", location); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir la consulta"); }
    finally { setBusy(""); }
  }
  async function copy(citation: ResearchCitation) {
    setError("");
    const response = await apiMutation<{ verified: boolean; warnings?: string[] }>("/api/research/citations/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: citation.kind, fragmentId: citation.fragmentId, quote: citation.quote }) });
    if (!response.ok || !response.data.verified) { setError(response.ok ? "La cita no coincide con el fragmento registrado. Abra de nuevo la fuente." : response.error); return; }
    const warnings = response.data.warnings ?? citation.warnings;
    const text = `“${citation.quote}”\n${citation.title}${citation.pageNumber ? ` · Página ${citation.pageNumber}` : ""}\n${new URL(citation.href, window.location.origin).href}${warnings?.length ? `\n${warnings.join("\n")}` : ""}`;
    try { if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable"); await navigator.clipboard.writeText(text); setStatus("Cita del texto registrado copiada."); }
    catch { setCopyText(text); }
  }

  return <section className="legal-research-workbench space-y-5 border-y border-[var(--line)] py-6" aria-labelledby="research-title">
    <div className="research-header flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="research-title" className="display text-2xl">Investigación con fuentes propias</h2><p className="mt-2 max-w-[75ch] text-sm text-[var(--ink-soft)]">Busque pasajes en las fuentes incorporadas, en un expediente y en los archivos preparados de un espacio autorizado. La consulta se resuelve localmente y conserva las citas para volver a revisarlas.</p></div>
      <div className="knowledge-view-tabs" aria-label="Vistas de investigación">{([["query", "Consultar"], ["sources", "Fuentes"], ["history", "Historial"]] as const).map(([key, label]) => <button key={key} type="button" className={`btn ${view === key ? "btn-primary" : "btn-ghost"}`} aria-pressed={view === key} onClick={() => { setView(key); setError(""); }}>{label}</button>)}</div>
    </div>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    <p role="status" aria-live="polite" className="text-sm text-[var(--ink)]">{busy === "import" ? "Recuperando y registrando la fuente elegida…" : busy === "search" ? "Consultando los fragmentos autorizados…" : status}</p>
    {copyText && <div><label htmlFor="research-copy" className="block text-sm font-medium">Copie esta cita</label><textarea ref={copyRef} id="research-copy" readOnly rows={5} className="textarea mt-2 w-full" value={copyText} /><button type="button" className="btn btn-ghost" onClick={() => setCopyText("")}>Cerrar cita</button></div>}
    {view === "query" && <>
      <form method="post" className="research-query-form space-y-5" onSubmit={e => { e.preventDefault(); void search(); }}><fieldset className="min-w-0 space-y-5" disabled={!ready || Boolean(busy)}>
        <div><label htmlFor="research-query" className="mb-2 block font-medium">¿Qué necesita contrastar?</label><textarea id="research-query" className="textarea w-full" rows={3} minLength={3} maxLength={1000} required value={query} onChange={e => { invalidateResult(); setQuery(e.target.value); }} placeholder="Por ejemplo: reducción de jornada y remuneraciones" /></div>
        <div className="grid gap-5 lg:grid-cols-2">
          <fieldset className="research-source-types min-w-0"><legend className="mb-2 text-sm font-medium">Clases de fuentes incorporadas</legend><div className="flex flex-wrap gap-x-5 gap-y-3">{(Object.keys(labels).filter(k => k !== "case_document" && k !== "space_file") as Kind[]).map(kind => <label key={kind} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={libraryOnly} checked={kinds.includes(kind)} onChange={e => { invalidateResult(); setKinds(previous => e.target.checked ? [...previous, kind] : previous.filter(k => k !== kind)); }} />{labels[kind]}</label>)}</div></fieldset>
          <div className="space-y-2"><label htmlFor="research-case" className="block text-sm font-medium">Expediente que desea incluir</label><select id="research-case" className="select w-full" value={causaId || (selectedDocuments !== null ? "__selection__" : "")} onChange={e => { if (e.target.value === "__selection__") return; invalidateResult(); setCausaId(e.target.value); setSelectedDocuments(null); }}><option value="">Sin documentos del expediente</option>{!causaId && selectedDocuments !== null && <option value="__selection__">Selección guardada · {selectedDocuments.length} documentos</option>}{cases.map(c => <option key={c.id} value={c.id}>{c.rit ? `${c.rit} · ` : ""}{c.titulo}</option>)}</select><details className="text-sm"><summary className="cursor-pointer text-[var(--sea)]">Buscar otra causa</summary><div className="mt-2 flex flex-wrap gap-2"><label htmlFor="research-case-filter" className="sr-only">Nombre o RIT de la causa</label><input id="research-case-filter" className="input min-w-0 flex-1" maxLength={100} value={caseFilter} onChange={e => setCaseFilter(e.target.value)} placeholder="Nombre o RIT" /><button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={filterCases}>Filtrar causas</button></div><p className="mt-2 text-[var(--ink-soft)]">Hasta 100 coincidencias. Filtrar limpia la selección anterior.</p></details></div>
        </div>
        <div className="space-y-3">
          <label htmlFor="research-site" className="block text-sm font-medium">Espacio que desea incluir</label>
          <select id="research-site" className="select w-full" value={siteId} onChange={e => { invalidateResult(); setSiteId(e.target.value); setSelectedSiteFiles(null); setFileFilter(""); }}><option value="">Sin archivos de espacios</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
          <details className="text-sm"><summary className="cursor-pointer text-[var(--sea)]">Buscar otro espacio</summary><div className="mt-2 flex flex-wrap gap-2"><label htmlFor="research-site-filter" className="sr-only">Nombre del espacio</label><input id="research-site-filter" className="input min-w-0 flex-1" maxLength={100} value={siteFilter} onChange={e => setSiteFilter(e.target.value)} /><button type="button" className="btn btn-secondary" onClick={async () => { setBusy("sites"); setError(""); try { const response = await fetch(`/api/research/scope?q=${encodeURIComponent(siteFilter)}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron buscar los espacios"); setSites(previous => [...previous.filter(site => site.id === siteId && !data.sites.some((entry: {id: string}) => entry.id === site.id)), ...data.sites]); setStatus(data.limited ? "Hay más de 100 espacios. Acote el nombre." : "Lista de espacios actualizada."); } catch (e) { setError(e instanceof Error ? e.message : "No se pudieron buscar los espacios"); } finally { setBusy(""); } }}>Filtrar espacios</button></div></details>
          {siteId && <div className="space-y-3"><p className="text-sm text-[var(--ink-soft)]">{libraryOnly ? "El espacio conserva el ámbito de permisos de la biblioteca; no añade otros archivos." : "Solo se revisa la última versión preparada de cada archivo. Hasta 200 archivos autorizados por consulta."}</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={libraryOnly} checked={selectedSiteFiles !== null} onChange={e => { invalidateResult(); setSelectedSiteFiles(e.target.checked ? [] : null); }} />Elegir archivos concretos del espacio</label>
          {selectedSiteFiles !== null && <div className="space-y-2"><label htmlFor="research-file-filter" className="block text-sm">Buscar archivo por nombre</label><input id="research-file-filter" className="input w-full" maxLength={100} value={fileFilter} onChange={e => setFileFilter(e.target.value)} />{siteLoading ? <p role="status" className="text-sm">Cargando archivos autorizados…</p> : <div className="max-h-56 space-y-2 overflow-y-auto">{siteFiles.map(file => <label key={file.id} className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={libraryOnly} checked={selectedSiteFiles.includes(file.id)} onChange={e => { invalidateResult(); setSelectedSiteFiles(previous => e.target.checked ? [...(previous || []), file.id] : (previous || []).filter(id => id !== file.id)); }} /><span className="min-w-0 break-words">{file.name}</span></label>)}{!siteFiles.length && <p className="text-sm">No hay archivos que coincidan.</p>}</div>}<p className="text-sm text-[var(--ink-soft)]">Seleccionados: {selectedSiteFiles.length}. {siteFilesLimited ? "Hay más coincidencias; acote el nombre para encontrarlas." : ""}</p></div>}</div>}
        </div>
        <fieldset className="min-w-0 space-y-3"><legend className="mb-2 text-sm font-medium">Colecciones de mi biblioteca</legend><p className="max-w-[75ch] text-sm text-[var(--ink-soft)]">Las colecciones añaden las versiones que guardó, aunque haya otras posteriores. Las colecciones privadas requieren seleccionar su mismo expediente o espacio. <Link href="#biblioteca" className="text-[var(--sea)]">Abrir mi biblioteca</Link></p>
          <div className="research-collection-options max-h-56 space-y-2 overflow-y-auto">{libraryCollections.map(collection => <label key={collection.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={libraryIds.includes(collection.id)} disabled={!libraryIds.includes(collection.id) && libraryIds.length >= 10} onChange={e => { invalidateResult(); const next = e.target.checked ? [...libraryIds, collection.id] : libraryIds.filter(id => id !== collection.id); setLibraryIds(next); if (!next.length) setLibraryOnly(false); }} /><span className="min-w-0 break-words">{collection.name} · {collection.scopeLabel} · {collection.itemCount} versiones</span></label>)}</div>
          {!libraryCollections.length && <p className="text-sm text-[var(--ink-soft)]">No hay colecciones accesibles. Cree una en Mi biblioteca y guarde una cita desde su fuente.</p>}
          {libraryIds.length > 0 && <div className="space-y-2"><p className="text-sm">Seleccionadas: {libraryIds.length} de 10. <button type="button" className="btn btn-ghost" onClick={() => { invalidateResult(); setLibraryIds([]); setLibraryOnly(false); }}>Quitar selección de biblioteca</button></p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={libraryOnly} onChange={e => { invalidateResult(); setLibraryOnly(e.target.checked); }} />Consultar solo las versiones de biblioteca</label>{libraryOnly && <p className="max-w-[75ch] text-sm text-[var(--ink-soft)]">El expediente y el espacio indican permisos. Se revisan únicamente las versiones guardadas; no se agrega el corpus actual.</p>}</div>}
        </fieldset>
        {selectedDocuments !== null && !libraryOnly && <p className="text-sm">Alcance guardado: {selectedDocuments.length} documentos seleccionados. <button type="button" className="btn btn-ghost" onClick={() => { invalidateResult(); setSelectedDocuments(null); }}>{causaId ? "Usar todo el expediente" : "Usar solo fuentes jurídicas"}</button></p>}
        <div className="flex flex-wrap items-center gap-3"><button className="btn btn-primary" disabled={Boolean(busy)} aria-busy={busy === "search"}><Search size={16} aria-hidden="true" />Consultar mis fuentes</button><span className="text-sm text-[var(--ink-soft)]">Hasta 10 pasajes por consulta. Las páginas pendientes no se consideran texto revisado.</span></div>
      </fieldset></form>
      {result && <div className="research-result space-y-5 border-t border-[var(--line)] pt-6" data-testid="research-result">
        <h3 className="text-lg font-semibold">{result.status === "abstained" ? "Sin evidencia suficiente" : "Pasajes encontrados"}</h3>
        <p className="max-w-[75ch] text-sm">{result.summary}</p>
        <p className="text-sm text-[var(--ink-soft)]">Revisados: {result.coverage.legalSourcesSearched} fuentes jurídicas y {result.coverage.documentsSearched} documentos del expediente; {result.coverage.siteFilesSearched || 0} archivos del espacio. Consulta guardada el {date(result.coverage.searchedAt)}.</p>
        {result.scope.librarySelections && <p className="text-sm text-[var(--ink-soft)]">Biblioteca: {result.coverage.libraryCollections || 0} colecciones, {result.coverage.libraryVersionsSearched || 0} versiones guardadas revisadas y {result.coverage.libraryItemsUnavailable || 0} entradas no disponibles. {result.scope.libraryOnly ? "Consulta limitada a biblioteca." : "Las versiones de biblioteca se añadieron al alcance elegido."}</p>}
        {result.warnings.length > 0 && <details className="text-sm" open><summary className="cursor-pointer font-medium">Cobertura y límites de esta consulta</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--ink-soft)]">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul></details>}
        {(Object.keys(labels) as (keyof typeof labels)[]).map(kind => { const citations = result.results.filter(c => c.sourceKind === kind); return citations.length ? <section key={kind} className="space-y-4"><h4 className="font-semibold">{labels[kind]}</h4><div className="divide-y divide-[var(--line)]">{citations.map(c => <article key={c.id} className="research-citation space-y-3 py-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><Link href={c.href} className="break-words font-semibold text-[var(--sea)]">{c.title}{c.pageNumber ? ` · Página ${c.pageNumber}` : ""}</Link><p className="mt-1 text-sm text-[var(--ink-soft)]">{c.organism || (c.sourceKind === "space_file" ? "Archivo del espacio" : "Expediente del estudio")}{c.publishedAt ? ` · Fecha de la fuente: ${date(c.publishedAt)}` : ""}{c.acquisitionMethod === "manual" ? " · Aporte manual sin cotejo oficial" : c.kind === "legal" ? ` · Recuperado el ${date(c.retrievedAt)}` : c.kind === "document" ? ` · Versión registrada el ${date(c.retrievedAt)}` : ""}</p></div><button type="button" className="btn btn-ghost" onClick={() => copy(c)} aria-label={`Copiar cita de ${c.title}`}><Copy size={16} aria-hidden="true" />Copiar cita</button></div>{c.extractionMethod === "ocr" && <p className="text-sm font-medium">OCR local · contraste la cita con la imagen de la página</p>}<blockquote className="source-quotation max-w-[75ch] whitespace-pre-wrap break-words text-sm leading-relaxed">{c.quote}</blockquote>{c.warnings?.map(warning => <p key={warning} className="text-sm text-[var(--ink-soft)]">{warning}</p>)}<BookmarkCitationButton citation={{ kind: c.kind, fragmentId: c.fragmentId, quote: c.quote }} causaId={result.scope.causaId} siteId={c.siteId || result.scope.siteId} /><div className="flex flex-wrap gap-4 text-sm"><Link href={c.href} className="text-[var(--sea)]">Abrir fragmento y versión</Link>{c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[var(--sea)]">Publicación original</a>}</div></article>)}</div></section> : null; })}
      </div>}
    </>}
    {view === "sources" && <div className="space-y-6">
      <form method="post" className="research-source-form space-y-4" onSubmit={e => { e.preventDefault(); void importSource(); }}><fieldset className="min-w-0 space-y-4" disabled={!ready || Boolean(busy)}>
        <h3 className="text-lg font-semibold">Incorporar una fuente jurídica</h3><p className="max-w-[75ch] text-sm text-[var(--ink-soft)]">Se admiten dictámenes de la Dirección del Trabajo, normas de LeyChile, oficios de Renta o IVA del SII y fallos civiles del Buscador Unificado del Poder Judicial. Esta acción consulta únicamente la URL elegida; la pregunta y el expediente permanecen en LexOpen. Las fuentes incorporadas se comparten con el equipo del estudio.</p>
        <div><label htmlFor="research-source-url" className="mb-2 block text-sm font-medium">URL de la publicación oficial</label><input id="research-source-url" className="input w-full" type="url" maxLength={2000} required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.dt.gob.cl/legislacion/…" /><p className="mt-2 text-sm">Para un fallo civil identificado use https://juris.pjud.cl/busqueda?Civiles#sentencia-ID, reemplazando ID por su identificador numérico. Es una referencia de selección de LexOpen: se recupera el texto por sesión pública, sin ClaveÚnica. No admite enlaces opacos con ?k= ni previews.</p></div>
        <div><label htmlFor="research-pjud-id" className="mb-2 block text-sm font-medium">Identificador numérico de sentencia civil PJUD (opcional)</label><input id="research-pjud-id" className="input" inputMode="numeric" pattern="[1-9][0-9]{0,14}" maxLength={15} placeholder="202921948" onChange={e => { const id = e.target.value.trim(); if (/^[1-9]\d{0,14}$/.test(id)) setUrl(`https://juris.pjud.cl/busqueda?Civiles#sentencia-${id}`); }} /><p className="mt-2 text-sm">Al ingresar un identificador válido se prepara la referencia en el campo URL. Revísela antes de recuperar la fuente.</p></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} />Incorporar texto manualmente</label>
        {manual && <div className="space-y-4"><p className="text-sm">El texto se identificará como aporte manual. Su coincidencia con la publicación oficial requiere revisión.</p><div><label htmlFor="research-source-title" className="mb-2 block text-sm font-medium">Título o identificador</label><input id="research-source-title" className="input w-full" required minLength={3} maxLength={1000} value={sourceTitle} onChange={e => setSourceTitle(e.target.value)} /></div><div><label htmlFor="research-source-date" className="mb-2 block text-sm font-medium">Fecha del documento o publicación, si consta</label><input id="research-source-date" type="date" className="input" value={sourceDate} onChange={e => setSourceDate(e.target.value)} /></div><div><label htmlFor="research-source-text" className="mb-2 block text-sm font-medium">Texto de la fuente pública · hasta 500.000 caracteres</label><textarea id="research-source-text" className="textarea w-full" rows={8} required minLength={20} maxLength={500000} value={sourceText} onChange={e => setSourceText(e.target.value)} /></div></div>}
        </fieldset><div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={!ready || Boolean(busy)} aria-busy={busy === "import"}>{busy === "import" ? "Incorporando…" : manual ? "Registrar aporte manual" : "Recuperar fuente oficial"}</button>{busy === "import" && <button type="button" className="btn btn-secondary" onClick={() => active.current?.abort()}>Cancelar recuperación</button>}</div>
      </form>
      <div className="space-y-3"><h3 className="font-semibold">Fuentes disponibles · {sources.length}</h3>{!sources.length && <p className="text-sm text-[var(--ink-soft)]">Incorpore una publicación para comenzar. Cada versión conserva el texto consultado y el original recibido.</p>}<ul className="research-source-list divide-y divide-[var(--line)]">{sources.map(s => <li key={s.id} className="py-3"><Link href={`/jurisprudencia/fuentes/${s.versions[0]?.id || ""}`} className="font-medium text-[var(--sea)]">{s.title}</Link><p className="mt-1 text-sm text-[var(--ink-soft)]">{s.organism}{s.versions[0]?.acquisitionMethod === "manual" ? " · Aporte manual" : " · Recuperada del sitio oficial"}</p></li>)}</ul><p className="text-sm text-[var(--ink-soft)]">Hasta 100 fuentes recientes. La fecha de consulta o publicación no acredita por sí sola la vigencia de una norma.</p></div>
    </div>}
    {view === "history" && <div className="space-y-4"><h3 className="text-lg font-semibold">Mis consultas guardadas</h3><p className="text-sm text-[var(--ink-soft)]">Se comprueba de nuevo el acceso al expediente y a sus documentos al recuperar una consulta.</p>{!runs.length && <p className="text-sm">Aún no hay consultas accesibles. Comience en Consultar.</p>}<ul className="divide-y divide-[var(--line)]">{runs.map(run => <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><span className="min-w-0 break-words text-sm">{run.query} · {date(run.createdAt)}</span><button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => restore(run.id)}><BookOpen size={16} aria-hidden="true" />Retomar consulta</button></li>)}</ul></div>}
  </section>;
}
