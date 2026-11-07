"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ExternalLink, Radio, RefreshCw, Search } from "lucide-react";
import type { AcademicCallSnapshot as Catalogue } from "@/lib/altazor/academic-calls";
import { formatCivilDate, SANTIAGO_TZ } from "@/lib/chile-time";
import { academicApi, type AcademicProject } from "./academic-ui";
import styles from "./AcademicCallSources.module.css";

type CallSource = Catalogue["sources"][number];
type Subscription = Catalogue["subscriptions"][number];
type CallItem = Subscription["items"][number];
type SourceAction = "subscribe" | "refresh" | "unsubscribe";
type Pending = { action: SourceAction | "save"; sourceId: string; itemId?: string };

const endpoint = "/api/altazor/academic/calls";
const regions = new Intl.DisplayNames(["es"], { type: "region" });
const countryName = (code: string) => /^[A-Z]{2}$/.test(code) ? regions.of(code) || code : code;
const countrySort = new Intl.Collator("es");
const queryKey = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim();
const infoDate = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: SANTIAGO_TZ });
const failure = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

export function AcademicCallSources({ blocked, onOpen, onSaved }: {
  blocked: boolean;
  onOpen: (id: string) => void;
  onSaved: (project: AcademicProject) => void;
}) {
  const [data, setData] = useState<Catalogue | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [country, setCountry] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const operation = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void academicApi<Catalogue>(endpoint, undefined, "GET", controller.signal).then(catalogue => {
      if (!controller.signal.aborted) setData(catalogue);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(failure(reason, "No pudimos abrir el catálogo."));
    });
    return () => {
      controller.abort();
      operation.current?.abort();
      operation.current = null;
    };
  }, [attempt]);

  async function act<T>(next: Pending, request: (signal: AbortSignal) => Promise<T>, accept: (result: T) => void) {
    if (operation.current || blocked) return;
    const controller = new AbortController();
    operation.current = controller;
    setPending(next);
    setError("");
    setNotice("");
    try {
      const result = await request(controller.signal);
      if (!controller.signal.aborted) accept(result);
    } catch (reason) {
      if (!controller.signal.aborted) setError(failure(reason, "No se pudo completar la acción. Inténtalo de nuevo."));
    } finally {
      if (operation.current === controller) { operation.current = null; setPending(null); }
    }
  }

  async function changeSource(action: SourceAction, source: CallSource) {
    const input = { action, sourceId: source.id };
    await act(input, signal => academicApi<Catalogue>(endpoint, input, "POST", signal), result => {
      setData(result);
      const subscription = result.subscriptions.find(entry => entry.sourceId === source.id);
      if (action === "refresh") {
        if (subscription?.error) {
          // The row names the failed source. Announce the outcome even when that row is off-screen.
          setNotice(subscription.items.length ? "La consulta falló. Conservamos la última consulta disponible." : "La fuente no pudo consultarse. Inténtalo de nuevo más tarde.");
        } else setNotice(`Consulta actualizada en ${source.label}.`);
      } else setNotice(action === "subscribe" ? `Ahora sigues ${source.label}. Ya puedes consultar su feed.` : `Dejaste de seguir ${source.label}. Tus fichas guardadas siguen en Mis convocatorias.`);
    });
  }

  async function save(source: CallSource, subscription: Subscription, item: CallItem) {
    const input = { action: "save" as const, sourceId: source.id, itemId: item.id, ...(subscription.checkedAt && { checkedAt: subscription.checkedAt }) };
    await act(input, signal => academicApi<{ workspaceId: string; reused: boolean; workspace: AcademicProject }>(endpoint, input, "POST", signal), result => {
      setData(current => current ? { ...current, subscriptions: current.subscriptions.map(entry => entry.sourceId === source.id ? {
        ...entry, items: entry.items.map(row => row.id === item.id ? { ...row, workspaceId: result.workspaceId } : row),
      } : entry) } : current);
      onSaved(result.workspace);
      setNotice(result.reused ? "La ficha ya está en Mis convocatorias." : "Ficha guardada en Mis convocatorias.");
    });
  }

  const sources = data?.sources ?? [];
  const subscriptions = new Map(data?.subscriptions.map(entry => [entry.sourceId, entry]));
  const countries = [...new Set(sources.map(source => source.country))].sort((a, b) => countrySort.compare(countryName(a), countryName(b)));
  const shownSources = sources.filter(source => !country || source.country === country);
  const key = queryKey(query);
  const results = shownSources.flatMap(source => {
    const subscription = subscriptions.get(source.id);
    return subscription?.items.filter(item => !key || queryKey(`${item.title} ${item.summary} ${source.label}`).includes(key))
      .map(item => ({ source, subscription, item })) ?? [];
  });
  const visibleConsulted = shownSources.some(source => subscriptions.get(source.id)?.checkedAt);
  const disabled = blocked || pending !== null;

  return <section id="convocatorias-oficiales" className={styles.root} aria-labelledby="official-calls-title" tabIndex={-1}>
    <header className={styles.heading}>
      <Radio size={27} strokeWidth={1.5} aria-hidden="true" />
      <div><h3 id="official-calls-title">Convocatorias oficiales</h3>
        <p>Explora fuentes de investigación por país y guarda las convocatorias que quieras seguir.</p></div>
    </header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {!data ? error
      ? <button type="button" className="btn btn-outline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Volver a cargar las fuentes</button>
      : <p role="status" className={styles.muted}>Cargando fuentes oficiales…</p>
      : <>
        <div className={styles.filters} role="group" aria-label="Filtros de convocatorias oficiales">
          <label>País o región<select aria-label="País o región" value={country} onChange={event => setCountry(event.target.value)}>
            <option value="">Todos los países y regiones</option>
            {countries.map(code => <option key={code} value={code}>{countryName(code)}</option>)}
          </select></label>
          <label className={styles.search}>Buscar en los avisos consultados<span><Search size={17} aria-hidden="true" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Título o tema" maxLength={160} />
          </span></label>
        </div>
        <div className={styles.ledger}>
          <section aria-labelledby="official-call-sources-title" className={styles.sources}>
            <h4 id="official-call-sources-title">Fuentes</h4>
            <p className={styles.muted}>Sigue las fuentes con feed y consulta sus avisos cuando quieras. La búsqueda se realiza sobre los avisos ya consultados.</p>
            <ul className={styles.rows}>
              {shownSources.map(source => {
                const subscription = subscriptions.get(source.id);
                const active = pending?.sourceId === source.id ? pending.action : undefined;
                return <li key={source.id} className={styles.source}>
                  <strong>{source.label}</strong>
                  <p className={styles.muted}>{countryName(source.country)} · {source.feed ? subscription ? "En seguimiento" : "Feed público" : "Consulta en el portal"}</p>
                  {subscription?.checkedAt && <p className={styles.muted}>Consultada el <time dateTime={subscription.checkedAt}>{infoDate.format(new Date(subscription.checkedAt))}</time></p>}
                  {subscription?.error && <p className={styles.error}>{subscription.error}{subscription.items.length ? " Se muestran los avisos de la última consulta disponible." : ""}</p>}
                  <div className={styles.actions}>
                    <a className={styles.external} href={source.url} target="_blank" rel="noopener noreferrer">Portal oficial <ExternalLink size={15} aria-hidden="true" /><span className="sr-only"> de {source.label}</span></a>
                    {source.feed && (subscription ? <>
                      <button className="btn btn-outline" type="button" disabled={disabled} onClick={() => void changeSource("refresh", source)} aria-label={`${subscription.checkedAt ? "Actualizar feed" : "Consultar feed"} de ${source.label}`}>
                        <RefreshCw size={16} aria-hidden="true" />{active === "refresh" ? "Consultando…" : subscription.checkedAt ? "Actualizar feed" : "Consultar feed"}
                      </button>
                      <button className="btn btn-ghost" type="button" disabled={disabled} aria-label={`Dejar de seguir ${source.label}`} onClick={() => void changeSource("unsubscribe", source)}>{active === "unsubscribe" ? "Quitando…" : "Dejar de seguir"}</button>
                    </> : <button className="btn btn-outline" type="button" disabled={disabled} aria-label={`Seguir ${source.label}`} onClick={() => void changeSource("subscribe", source)}>{active === "subscribe" ? "Guardando…" : "Seguir fuente"}</button>)}
                  </div>
                </li>;
              })}
            </ul>
            {shownSources.length === 0 && <p className={styles.empty}>El catálogo aún no tiene fuentes en esta selección.</p>}
          </section>
          <section aria-labelledby="official-call-results-title" className={styles.results}>
            <div className={styles.resultTitle}><h4 id="official-call-results-title">Avisos consultados</h4><span className={styles.muted} aria-live="polite">{results.length} {results.length === 1 ? "aviso" : "avisos"}</span></div>
            {results.length ? <ul className={styles.rows}>
              {results.map(({ source, subscription, item }) => <li key={`${source.id}:${item.id}`} className={styles.item}>
                <div className={styles.itemMetadata}><span>{source.label} · {countryName(source.country)}</span>
                  {item.publishedAt && <span>Publicación <time dateTime={item.publishedAt}>{infoDate.format(new Date(item.publishedAt))}</time></span>}
                </div>
                <h5>{item.title}</h5>
                <p className={styles.deadline}>{item.deadline ? <>Cierre informado <time dateTime={item.deadline}>{formatCivilDate(item.deadline)}</time></> : "Cierre por confirmar en las bases"}</p>
                {item.summary && <p className={styles.summary}>{item.summary}</p>}
                {item.changed && <p className={styles.notice}>El aviso cambió desde que guardaste la ficha. Revisa las bases antes de actualizar tus datos.</p>}
                <div className={styles.actions}>
                  <a className={styles.external} href={item.url} target="_blank" rel="noopener noreferrer">Ver aviso oficial <ExternalLink size={15} aria-hidden="true" /><span className="sr-only"> de {item.title}</span></a>
                  {item.workspaceId ? <button type="button" className="btn btn-outline" disabled={disabled} onClick={() => onOpen(item.workspaceId!)} aria-label={`Abrir ficha de ${item.title}`}>Abrir ficha <ArrowRight size={16} aria-hidden="true" /></button>
                    : <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => void save(source, subscription, item)} aria-label={`Guardar ficha de ${item.title}`}>
                      {pending?.sourceId === source.id && pending.itemId === item.id ? "Guardando…" : "Guardar ficha"}
                    </button>}
                </div>
              </li>)}
            </ul> : <p className={styles.empty}>{visibleConsulted ? key ? "No encontramos avisos con esos términos." : "La última consulta no devolvió avisos para esta selección." : "Consulta el feed de una fuente para ver sus avisos aquí. Los portales sin feed se abren en otra pestaña."}</p>}
          </section>
        </div>
      </>}
  </section>;
}
