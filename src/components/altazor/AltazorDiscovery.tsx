"use client";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowUpRight, BookOpen, Download, RefreshCw, Search, Trash2 } from "lucide-react";
import { withCsrfHeaders } from "@/lib/client-csrf";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { BIBLIOGRAPHY_STYLES, type AcademicPaper, type BibliographyMetadata, type BibliographyStyle, type DiscoveryProvider } from "@/lib/altazor/bibliography-types";
import { AcademicCitationGraph, type CitationNeighborhood } from "./AcademicCitationGraph";
import styles from "./AltazorDiscovery.module.css";

const base = "/api/altazor/academic/discovery";
const importFormats = { bib: "bibtex", ris: "ris", json: "json" } as const;
const importTextLimit = 220_000;
const importRequestLimit = 256 * 1024;
type Saved = { id: string; name: string; query: string; providers: DiscoveryProvider[]; status: string; revision: number; results: AcademicPaper[]; warnings: string[]; newKeys: string[]; checkedAt: string | null; errorCode: string | null; feedHref: string };
type Entry = { id: string; available: boolean; metadata?: BibliographyMetadata; source?: string; sourceUrl?: string; checkedAt?: string; formatted?: { text: string; missingFields: string[]; warnings: string[] } };
type Graph = CitationNeighborhood;
type Orcid = { id: string; name: string; href: string; checkedAt: string; notice: string };
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" }) : "Sin consultar todavía";
const authorNames = (metadata: BibliographyMetadata) => metadata.authors.map(author => author.name || [author.given, author.family].filter(Boolean).join(" ")).join("; ") || "Autores no informados";
async function api<T>(path: string, payload?: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch(base + path, { method: payload === undefined && method === "POST" ? "GET" : method, headers: payload === undefined ? undefined : withCsrfHeaders({ "Content-Type": "application/json" }), body: payload === undefined ? undefined : JSON.stringify(payload), cache: "no-store", signal });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo completar la consulta académica"); return data;
}
export function AltazorDiscovery({ initialQuery = "" }: { initialQuery?: string }) {
  const uid = useId(), [query, setQuery] = useState(initialQuery), [providers, setProviders] = useState<DiscoveryProvider[]>(["crossref", "openalex"]), [allowExternal, setAllowExternal] = useState(false), [results, setResults] = useState<AcademicPaper[] | null>(null), [warnings, setWarnings] = useState<string[]>([]), [checkedAt, setCheckedAt] = useState<string | null>(null), [saved, setSaved] = useState<Saved[]>([]), [entries, setEntries] = useState<Entry[]>([]), [books, setBooks] = useState<{ id: string; title: string; author: string }[]>([]), [bookId, setBookId] = useState(""), [style, setStyle] = useState<BibliographyStyle>("apa"), [doi, setDoi] = useState(""), [orcid, setOrcid] = useState(""), [author, setAuthor] = useState<Orcid | null>(null), [graph, setGraph] = useState<Graph | null>(null), [searchName, setSearchName] = useState(""), [importFormat, setImportFormat] = useState<"bibtex" | "ris" | "json">("bibtex"), [importText, setImportText] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null), saveKey = useRef(createSubmissionKeys(undefined, "altazor:discovery:save")), importKey = useRef(createSubmissionKeys(undefined, "altazor:discovery:import")), paperKey = useRef(createSubmissionKeys()), doiKey = useRef(createSubmissionKeys(undefined, "altazor:discovery:doi")), bookKey = useRef(createSubmissionKeys(undefined, "altazor:discovery:book"));
  const importFile = useRef<HTMLInputElement>(null);
  const graphHeading = useRef<HTMLHeadingElement>(null);
  const graphTrigger = useRef<HTMLButtonElement>(null);
  const [importError, setImportError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<{ searches: Saved[] }>("/saved", undefined, "POST", controller.signal), api<{ entries: Entry[] }>("/bibliography?style=apa", undefined, "POST", controller.signal), api<{ books: typeof books }>("/books", undefined, "POST", controller.signal)]).then(([searches, bibliography, library]) => { setSaved(searches.searches); setEntries(bibliography.entries); setBooks(library.books); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); active.current?.abort(); };
  }, []);
  useEffect(() => { if (graph) graphHeading.current?.focus(); }, [graph]);
  async function refreshBibliography(nextStyle = style, signal?: AbortSignal) { const data = await api<{ entries: Entry[] }>(`/bibliography?style=${nextStyle}`, undefined, "GET", signal); setEntries(data.entries); }
  async function action(run: (signal: AbortSignal) => Promise<void>, reportError = setError) {
    if (busy) return; const controller = new AbortController(); active.current = controller; setBusy(true); setError(""); setNotice("");
    try { await run(controller.signal); } catch (cause) { reportError(controller.signal.aborted ? "Operación detenida. Puedes volver a intentarlo." : cause instanceof Error ? cause.message : "No se pudo completar la operación. Vuelve a intentarlo."); } finally { if (active.current === controller) active.current = null; setBusy(false); }
  }
  async function readImportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setImportError("");
    setImportNotice("");
    await action(async signal => {
      const extension = file.name.match(/\.([^.]+)$/)?.[1].toLowerCase();
      if (extension !== "bib" && extension !== "ris" && extension !== "json") throw new Error("Elige un archivo .bib, .ris o .json.");
      if (file.size > importRequestLimit) throw new Error("El archivo es demasiado grande. Divide las referencias en archivos de hasta 256 KB.");
      const bytes = await file.arrayBuffer();
      signal.throwIfAborted();
      let content: string;
      try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new Error("Vuelve a exportar el archivo como texto UTF-8."); }
      if (content.includes("\0")) throw new Error("El archivo contiene datos que no son texto. Vuelve a exportarlo como UTF-8.");
      if (!content.trim()) throw new Error("El archivo está vacío. Elige uno que contenga referencias.");
      if (content.length > importTextLimit) throw new Error("El archivo contiene demasiado texto. Divide las referencias en archivos más pequeños.");
      setImportFormat(importFormats[extension]);
      setImportText(content);
      setImportNotice("Archivo leído. Revisa el contenido y pulsa Importar referencias.");
    }, message => {
      input.value = "";
      setImportError(message);
    });
  }
  async function submitImport(event: FormEvent) {
    event.preventDefault();
    if (!importText.trim()) return;
    setImportError("");
    setImportNotice("");
    await action(async signal => {
      const payload = { format: importFormat, content: importText };
      const request = { ...payload, requestId: importKey.current.forPayload(payload) };
      if (new TextEncoder().encode(JSON.stringify(request)).byteLength > importRequestLimit) throw new Error("La bibliografía es demasiado grande para una importación. Divide las referencias y vuelve a intentarlo.");
      const { added, reused } = await api<{ added: number; reused: number }>("/bibliography/import", request, "POST", signal);
      importKey.current.complete(payload);
      if (importFile.current) importFile.current.value = "";
      setImportText("");
      const imported = added === 1 ? "Se incorporó 1 referencia." : `Se incorporaron ${added} referencias.`;
      const duplicates = reused === 1 ? "1 referencia ya estaba en tu bibliografía." : `${reused} referencias ya estaban en tu bibliografía.`;
      setImportNotice([added && imported, reused && duplicates].filter(Boolean).join(" "));
      try { await refreshBibliography(style, signal); }
      catch { setImportError("La importación se guardó. Vuelve a abrir Buscar bibliografía para actualizar la lista."); }
    }, setImportError);
  }
  async function search(event: FormEvent) { event.preventDefault(); await action(async signal => { const data = await api<{ results: AcademicPaper[]; warnings: string[]; checkedAt: string }>("", { query, providers, allowExternal }, "POST", signal); setResults(data.results); setWarnings(data.warnings); setCheckedAt(data.checkedAt); setGraph(null); }); }
  async function addPaper(paper: AcademicPaper) { await action(async signal => { const payload = { kind: "remote", provider: paper.provider, identifier: paper.provider === "crossref" ? paper.metadata.doi : paper.metadata.openalexId, allowExternal }; await api("/bibliography", { ...payload, requestId: paperKey.current.forPayload(payload) }, "POST", signal); paperKey.current.complete(payload); await refreshBibliography(); setNotice("Referencia conservada. Sus metadatos no sustituyen la revisión del texto completo."); }); }
  async function updateSaved(item: Saved, command: "refresh" | "acknowledge" | "pause" | "resume" | "delete") {
    await action(async signal => {
      if (command === "refresh") { const data = await api<{ search: Saved }>(`/saved/${item.id}/refresh`, { expectedRevision: item.revision, allowExternal }, "POST", signal); setResults(data.search.results); setCheckedAt(data.search.checkedAt); setWarnings(data.search.warnings); setQuery(data.search.query); setProviders(data.search.providers); setGraph(null); }
      else await api(`/saved/${item.id}`, { expectedRevision: item.revision, action: command }, "PATCH", signal);
      setSaved((await api<{ searches: Saved[] }>("/saved", undefined, "POST", signal)).searches);
    });
  }
  function graphGroup(kind: "references" | "cited_by" | "related") {
    if (!graph) return []; const ids = graph.edges.filter(edge => kind === "related" ? edge.relation === "related" : edge.relation === "cites" && (kind === "references" ? edge.from === graph.centerId : edge.to === graph.centerId)).map(edge => kind === "cited_by" ? edge.from : edge.to);
    return graph.nodes.filter(node => ids.includes(node.metadata.openalexId));
  }
  async function exploreGraph(openalexId: string) {
    if (!allowExternal) return;
    await action(async signal => {
      const result = await api<Graph>("/graph", { openalexId, allowExternal }, "POST", signal);
      if (!signal.aborted) setGraph(result);
    });
  }
  return <div className={styles.root} aria-labelledby={`${uid}-title`}>
    <div className={styles.heading}><div><h3 id={`${uid}-title`}>Descubrir y citar</h3><p>Encuentra obras, sigue sus citas y conserva una bibliografía propia.</p></div><BookOpen size={25} aria-hidden="true" /></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loading && <p role="status">Cargando tu bibliografía y búsquedas guardadas…</p>}
    <form onSubmit={event => void search(event)} className={styles.search}>
      <label htmlFor={`${uid}-query`}>Tema o referencia bibliográfica<input id={`${uid}-query`} value={query} onChange={event => { setQuery(event.target.value); }} minLength={3} maxLength={250} placeholder="Por ejemplo: enseñanza del derecho y evaluación" required /></label>
      <fieldset><legend>Fuentes públicas</legend>{(["crossref", "openalex"] as DiscoveryProvider[]).map(provider => <label key={provider}><input type="checkbox" checked={providers.includes(provider)} onChange={event => { setProviders(previous => event.target.checked ? [...previous, provider] : previous.filter(item => item !== provider)); }} />{provider === "crossref" ? "Crossref" : "OpenAlex"}</label>)}</fieldset>
      <label className={styles.consent}><input type="checkbox" checked={allowExternal} onChange={event => setAllowExternal(event.target.checked)} />Autorizo enviar sólo los términos o identificadores que introduzca a las fuentes públicas indicadas. No se envían documentos, conversaciones ni datos de causas.</label>
      <div className={styles.actions}><button type="submit" className="btn btn-primary" disabled={busy || !allowExternal || !providers.length || query.trim().length < 3}><Search size={16} aria-hidden="true" /> Buscar obras</button>{busy && <button type="button" className="btn btn-outline" onClick={() => active.current?.abort()}>Detener consulta</button>}<span>Hasta diez resultados por fuente · sólo metadatos</span></div>
    </form>
    {results !== null && <section className={styles.results} aria-label="Resultados de la búsqueda académica"><div className={styles.resultHeading}><h4>{results.length ? `${results.length} obras en esta ventana` : "Sin resultados para esta consulta"}</h4><span>Consultado: {date(checkedAt)}</span></div>{!results.length && <p>Prueba con términos más amplios o con el DOI de la obra. No se añadieron ejemplos ni resultados simulados.</p>}{warnings.map(warning => <p key={warning} className={styles.detail}>{warning}</p>)}<ol>{results.map(paper => <li key={paper.key}><h5><a href={paper.landingUrl} target="_blank" rel="noreferrer noopener">{paper.metadata.title}<ArrowUpRight size={15} aria-hidden="true" /></a></h5><p>{authorNames(paper.metadata)}</p><p className={styles.detail}>{[paper.metadata.year, paper.metadata.containerTitle, paper.provider === "crossref" ? "Crossref" : "OpenAlex", paper.openAccess ? "Acceso abierto declarado por el índice" : ""].filter(Boolean).join(" · ")}</p><div className={styles.actions}><button type="button" className="btn btn-outline" disabled={busy || !allowExternal} onClick={() => void addPaper(paper)}>Conservar referencia</button>{paper.metadata.openalexId && <button type="button" className="btn btn-outline" disabled={busy || !allowExternal} onClick={event => { graphTrigger.current = event.currentTarget; void exploreGraph(paper.metadata.openalexId); }}>Explorar red de citas</button>}</div></li>)}</ol><p className={styles.detail}>Estos registros describen las obras. Para fundamentar un escrito con un pasaje, incorpora el texto a tu biblioteca y selecciona una cita cotejada.</p></section>}
    {graph && <section className={styles.graph} aria-label="Red bibliográfica consultada">
      <div className={styles.resultHeading}>
        <h4 ref={graphHeading} tabIndex={-1}>Red de citas</h4>
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setGraph(null); graphTrigger.current?.focus(); }}>Cerrar red</button>
      </div>
      <p>{graph.notice}</p>
      <AcademicCitationGraph key={graph.centerId} graph={graph} canExpand={allowExternal && !busy} onExpand={id => void exploreGraph(id)}/>
      <details><summary>Ver red como lista</summary>
        <div className={styles.network}><div><h5>La obra consultada cita</h5><ul>{graphGroup("references").map(paper => <li key={paper.key}><a href={paper.landingUrl} target="_blank" rel="noreferrer noopener">{paper.metadata.title}</a></li>)}</ul>{!graphGroup("references").length && <p>Sin referencias recuperadas.</p>}</div><div className={styles.networkCenter}><span>Obra consultada</span><h5>{graph.nodes.find(paper => paper.metadata.openalexId === graph.centerId)?.metadata.title}</h5><p>{date(graph.checkedAt)}</p></div><div><h5>Estas obras la citan</h5><ul>{graphGroup("cited_by").map(paper => <li key={paper.key}><a href={paper.landingUrl} target="_blank" rel="noreferrer noopener">{paper.metadata.title}</a></li>)}</ul>{!graphGroup("cited_by").length && <p>Sin obras citantes recuperadas.</p>}</div></div><details><summary>Obras relacionadas por el índice</summary><ul className={styles.related}>{graphGroup("related").map(paper => <li key={paper.key}><a href={paper.landingUrl} target="_blank" rel="noreferrer noopener">{paper.metadata.title}</a></li>)}</ul>{!graphGroup("related").length && <p>Sin obras relacionadas recuperadas.</p>}</details>
      </details>
    </section>}
    <details className={styles.disclosure}><summary>Búsquedas temáticas y alertas <span>{saved.length}</span></summary><p className={styles.detail}>Las novedades se calculan al actualizar manualmente. No se hacen consultas programadas ni se envían correos. El RSS privado requiere sesión y muestra la última actualización.</p><div className={styles.saveForm}><label htmlFor={`${uid}-search-name`}>Nombre de esta búsqueda<input id={`${uid}-search-name`} maxLength={160} value={searchName} onChange={event => { setSearchName(event.target.value); }} placeholder="Nombre para reconocer el tema" /></label><button type="button" className="btn btn-outline" disabled={busy || query.trim().length < 3 || !searchName.trim() || !providers.length} onClick={() => void action(async signal => { await api("/saved", { requestId: saveKey.current.forPayload({ name: searchName, query, providers }), name: searchName, query, providers }, "POST", signal); setSaved((await api<{ searches: Saved[] }>("/saved", undefined, "POST", signal)).searches); setNotice("Búsqueda guardada. Se consultará cuando pulses Actualizar y autorices el envío."); })}>Guardar búsqueda</button></div><ul className={styles.saved}>{saved.map(item => <li key={item.id}><h4>{item.name}</h4><p>{item.query}</p><p className={styles.detail}>{item.newKeys.length ? `${item.newKeys.length} novedades sin revisar · ` : ""}{item.status === "paused" ? "Pausada · " : ""}{date(item.checkedAt)}{item.errorCode ? " · La última consulta falló; se conserva el resultado anterior." : ""}</p><div className={styles.actions}><button type="button" className="btn btn-outline" disabled={busy || !allowExternal || item.status !== "active"} onClick={() => void updateSaved(item, "refresh")}><RefreshCw size={15} aria-hidden="true" /> Actualizar</button>{item.newKeys.length > 0 && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void updateSaved(item, "acknowledge")}>Marcar novedades como vistas</button>}<button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void updateSaved(item, item.status === "paused" ? "resume" : "pause")}>{item.status === "paused" ? "Reanudar" : "Pausar"}</button><a href={item.feedHref} target="_blank" rel="noreferrer noopener">RSS privado</a><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void updateSaved(item, "delete")} aria-label={`Eliminar búsqueda ${item.name}`}><Trash2 size={16} aria-hidden="true" /></button></div></li>)}</ul>{!saved.length && <p>Aún no has guardado búsquedas temáticas.</p>}</details>
    <details className={styles.disclosure}><summary>Mi bibliografía <span>{entries.filter(entry => entry.available).length}</span></summary><div className={styles.bibliographyToolbar}><label htmlFor={`${uid}-style`}>Estilo bibliográfico<select id={`${uid}-style`} aria-label="Estilo bibliográfico" disabled={busy} value={style} onChange={event => { const next = event.target.value as BibliographyStyle; setStyle(next); void action(async () => refreshBibliography(next)); }}>{BIBLIOGRAPHY_STYLES.map(value => <option key={value} value={value}>{value === "bibtex" ? "BibTeX" : value.toUpperCase()}</option>)}</select></label>{entries.some(entry => entry.available) && <a className="btn btn-outline" href={`${base}/bibliography/export?style=${style}`}><Download size={16} aria-hidden="true" /> Descargar bibliografía</a>}</div><p className={styles.detail}>Los formatos usan únicamente los campos conservados. Revisa los datos ausentes y las reglas de tu revista o institución.</p><ol className={styles.bibliography}>{entries.map(entry => <li key={entry.id}>{entry.available ? <><p className={styles.reference}>{entry.formatted?.text}</p>{Boolean(entry.formatted?.missingFields.length) && <p className={styles.detail}>Falta revisar: {entry.formatted?.missingFields.join(", ")}.</p>}{entry.formatted?.warnings.map(warning => <p key={warning} className={styles.detail}>{warning}</p>)}<p className={styles.detail}>{entry.source === "crossref" || entry.source === "openalex" ? `Metadatos consultados en ${entry.source === "crossref" ? "Crossref" : "OpenAlex"}: ${date(entry.checkedAt)}. Texto completo no cotejado.` : "Metadatos aportados por ti; sin corroboración externa."}</p></> : <p>Referencia cuyo libro ya no está disponible.</p>}<button type="button" className="btn btn-ghost" disabled={busy} aria-label={`Eliminar referencia ${entry.metadata?.title || "no disponible"}`} onClick={() => void action(async signal => { await api(`/bibliography/${entry.id}`, {}, "DELETE", signal); await refreshBibliography(); })}><Trash2 size={16} aria-hidden="true" /> Eliminar referencia</button></li>)}</ol>{!entries.length && <p>Conserva una referencia de los resultados o incorpora las tuyas.</p>}
      <details className={styles.innerDisclosure}><summary>Incorporar por DOI o desde mis libros</summary><div className={styles.saveForm}><label htmlFor={`${uid}-doi`}>DOI<input id={`${uid}-doi`} value={doi} maxLength={300} onChange={event => setDoi(event.target.value)} placeholder="10.…/…" /></label><button type="button" className="btn btn-outline" disabled={busy || !allowExternal || !doi.trim()} onClick={() => void action(async signal => { await api("/bibliography", { kind: "remote", requestId: doiKey.current.forPayload({ kind: "remote", provider: "crossref", identifier: doi, allowExternal }), provider: "crossref", identifier: doi, allowExternal }, "POST", signal); await refreshBibliography(); setNotice("Metadatos del DOI consultados e incorporados."); })}>Consultar DOI en Crossref</button></div><div className={styles.saveForm}><label htmlFor={`${uid}-book`}>Libro propio<select id={`${uid}-book`} aria-label="Libro propio para bibliografía" value={bookId} onChange={event => setBookId(event.target.value)}><option value="">Selecciona un libro</option>{books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label><button type="button" className="btn btn-outline" disabled={busy || !bookId} onClick={() => void action(async signal => { await api("/bibliography", { kind: "book", requestId: bookKey.current.forPayload({ kind: "book", bookId }), bookId }, "POST", signal); await refreshBibliography(); })}>Usar sus metadatos</button></div></details>
      <details className={styles.innerDisclosure}>
        <summary>Importar una bibliografía</summary>
        <form onSubmit={event => void submitImport(event)} className={styles.importForm}>
          <label htmlFor={`${uid}-import-file`}>
            Archivo de referencias (.bib, .ris o .json)
            <input ref={importFile} id={`${uid}-import-file`} type="file" accept=".bib,.ris,.json" disabled={busy || loading} onChange={event => void readImportFile(event)} />
          </label>
          <label htmlFor={`${uid}-import-format`}>
            Formato de importación
            <select id={`${uid}-import-format`} aria-label="Formato de importación bibliográfica" value={importFormat} disabled={busy || loading} onChange={event => { setImportFormat(event.target.value as typeof importFormat); setImportError(""); }}>
              <option value="bibtex">BibTeX</option><option value="ris">RIS</option><option value="json">JSON de LexOpen</option>
            </select>
          </label>
          <div className={styles.importField}>
            <label htmlFor={`${uid}-import`}>Contenido de la bibliografía</label>
            <textarea id={`${uid}-import`} rows={6} maxLength={importTextLimit} value={importText} disabled={busy || loading} onChange={event => { setImportText(event.target.value); setImportError(""); setImportNotice(""); }} placeholder="Revisa el archivo o pega aquí tus referencias." />
          </div>
          <div className={styles.actions}>
            <button type="submit" className="btn btn-outline" disabled={busy || loading || !importText.trim()}>Importar referencias</button>
          </div>
          {importError && <p role="alert" className={styles.error}>{importError}</p>}
          {importNotice && <p role="status" className={styles.notice}>{importNotice}</p>}
        </form>
      </details>
    </details>
    <details className={styles.disclosure}><summary>Consultar un registro ORCID público</summary><p className={styles.detail}>Permite contrastar el identificador y el nombre público. No conecta una cuenta ni certifica formación, afiliaciones o experiencia.</p><div className={styles.saveForm}><label htmlFor={`${uid}-orcid`}>ORCID<input id={`${uid}-orcid`} value={orcid} maxLength={100} onChange={event => setOrcid(event.target.value)} placeholder="0000-0000-0000-0000" /></label><button type="button" className="btn btn-outline" disabled={busy || !allowExternal || !orcid.trim()} onClick={() => void action(async signal => setAuthor(await api<Orcid>("/orcid", { orcid, allowExternal }, "POST", signal)))}>Consultar ORCID</button></div>{author && <div className={styles.author}><h4>{author.name}</h4><a href={author.href} target="_blank" rel="noreferrer noopener">{author.id}<ArrowUpRight size={15} aria-hidden="true" /></a><p>{author.notice}</p><p className={styles.detail}>Consultado: {date(author.checkedAt)}</p></div>}</details>
  </div>;
}
