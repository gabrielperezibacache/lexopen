"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import type { AltazorMemoryView, MemoryNodeView, MemoryEdgeView, MemorySupportInput, MemorySupportView } from "@/lib/altazor/memory-types";
import styles from "./AltazorMemory.module.css";

type SourcePage = { books: { id: string; title: string }[]; sources: { label: string; quote: string; input: MemorySupportInput }[]; nextAfter: string | number | null; notice: string };
type Target = { id: string; target: "node" | "edge"; revision: number };

function graphTitleLines(title: string, width: number) {
  // Reserve a full glyph width so wide letters and unbroken words stay inside
  // the node too. The complete title remains in both the SVG and its list.
  const limit = Math.max(6, Math.floor((width - 32) / 15)), lines: string[] = [];
  let current = "";
  for (const word of title.trim().split(/\s+/u)) {
    const letters = Array.from(word);
    if (current && Array.from(current).length + letters.length + 1 > limit) { lines.push(current); current = ""; }
    while (letters.length > limit) { lines.push(letters.splice(0, limit).join("")); }
    const rest = letters.join("");
    if (rest) current = current ? `${current} ${rest}` : rest;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [title];
}

export function AltazorMemory({ causaId = null }: { causaId?: string | null }) { return <MemoryPanel key={causaId || "personal"} causaId={causaId} />; }

function MemoryPanel({ causaId }: { causaId: string | null }) {
  const { locale } = useI18n(), en = locale === "en", uid = useId();
  const tr = (es: string, english: string) => en ? english : es;
  const [data, setData] = useState<AltazorMemoryView | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null), [armed, setArmed] = useState<string | null>(null);
  const [label, setLabel] = useState(""), [body, setBody] = useState(""), [kind, setKind] = useState<"concept" | "claim">("concept");
  const [sourceMode, setSourceMode] = useState<"manual" | "book" | "evidence">("manual"), [bookId, setBookId] = useState(""), [after, setAfter] = useState<string | number | null>(null), [sourceIndex, setSourceIndex] = useState("");
  const [catalog, setCatalog] = useState<SourcePage | null>(null), [sourceLoading, setSourceLoading] = useState(false);
  const [fromId, setFromId] = useState(""), [toId, setToId] = useState(""), [relation, setRelation] = useState("");
  const [edit, setEdit] = useState<{ id: string; target: "node" | "edge"; revision: number; label: string; body: string } | null>(null);
  const createKeys = useRef(createSubmissionKeys()), edgeKeys = useRef(createSubmissionKeys()), changeKeys = useRef(createSubmissionKeys());
  const graphNodes = useRef<(SVGGElement | null)[]>([]), graphFrame = useRef<HTMLDivElement>(null), live = useRef(true);
  const [graphWidth, setGraphWidth] = useState(640);
  const query = causaId ? `?causaId=${encodeURIComponent(causaId)}` : "";
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/altazor/memory${query}`, { cache: "no-store", signal });
      const value = await response.json(); if (signal?.aborted || !live.current) return;
      if (!response.ok) { setData(null); setError(value.error || (en ? "Memory could not be loaded. Try refreshing." : "No se pudo cargar la memoria. Vuelve a actualizar.")); return; }
      setData(value); setError("");
    } catch { if (!signal?.aborted && live.current) { setData(null); setError(en ? "Memory could not be loaded. Check the connection and retry." : "No se pudo cargar la memoria. Revisa la conexión y reintenta."); } }
  }, [query, en]);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial cancellable request hydrates the private memory panel
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    const frame = graphFrame.current;
    if (!frame) return;
    const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width > 0) setGraphWidth(Math.floor(width)); });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [data?.nodes.length]);
  useEffect(() => {
    if (sourceMode === "manual") return;
    const controller = new AbortController(), params = new URLSearchParams({ kind: sourceMode });
    if (causaId) params.set("causaId", causaId); if (bookId) params.set("bookId", bookId); if (after !== null) params.set("after", String(after));
    void fetch(`/api/altazor/memory/sources?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const value = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) setError(value.error || (en ? "Sources are unavailable." : "Las fuentes no están disponibles.")); else setCatalog(value);
    }).catch(() => { if (!controller.signal.aborted) setError(en ? "Sources could not be loaded. Try again." : "No se pudieron cargar las fuentes. Reintenta."); }).finally(() => { if (!controller.signal.aborted) setSourceLoading(false); });
    return () => controller.abort();
  }, [sourceMode, bookId, after, causaId, en]);
  async function mutate(path: string, method: "POST" | "PATCH", payload: Record<string, unknown>, keys: ReturnType<typeof createSubmissionKeys>) {
    if (busy) return false; setBusy(true); setError(""); setNotice("");
    const envelope = { path, method, payload }, requestId = keys.forPayload(envelope);
    const result = await apiMutation(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId }) });
    if (!live.current) return false;
    setBusy(false);
    if (!result.ok) { setError(result.error); return false; }
    keys.complete(envelope); setNotice(en ? "Memory updated." : "Memoria actualizada."); setArmed(null); await load(); return true;
  }
  const chosenSupport: MemorySupportInput | undefined = sourceMode === "manual" ? { kind: "manual" } : catalog?.sources[Number(sourceIndex)]?.input;
  async function create(event: FormEvent) {
    event.preventDefault(); if (!data || !chosenSupport || sourceMode !== "manual" && sourceIndex === "") return;
    if (await mutate("/api/altazor/memory", "POST", { causaId, expectedEpoch: data.epoch, label, body, kind: sourceMode === "manual" ? "preference" : kind, supports: [chosenSupport] }, createKeys.current)) { setLabel(""); setBody(""); }
  }
  async function change(target: Target, action: "confirm" | "reject" | "forget" | "edit", content?: { label: string; body: string }) {
    return mutate(`/api/altazor/memory/${target.id}`, "PATCH", { causaId, target: target.target, expectedRevision: target.revision, action, ...content }, changeKeys.current);
  }
  async function relate(event: FormEvent) {
    event.preventDefault(); if (!data) return;
    const from = data.nodes.find(node => node.id === fromId), to = data.nodes.find(node => node.id === toId);
    const support = from?.kind === "preference" && to?.kind === "preference" ? { kind: "manual" as const } : sourceMode !== "manual" && sourceIndex !== "" ? chosenSupport : undefined;
    if (!support) { setError(tr("Selecciona un pasaje de respaldo en «Añadir recuerdo» para relacionar conceptos o afirmaciones.", "Select a supporting passage under Add memory to connect concepts or claims.")); return; }
    if (await mutate("/api/altazor/memory/edges", "POST", { causaId, expectedEpoch: data.epoch, fromId, toId, relation, body: "", supports: [support] }, edgeKeys.current)) setRelation("");
  }
  function supports(items: MemorySupportView[]) {
    return <ul className={styles.supports}>{items.map((item, index) => <li key={index}>{item.href ? <a href={item.href}>{item.title}</a> : <strong>{tr("Preferencia registrada por ti", "Preference recorded by you")}</strong>}<p>{item.notice}</p>{item.kind !== "manual" && <blockquote>{item.quote}</blockquote>}</li>)}</ul>;
  }
  function actions(item: MemoryNodeView | MemoryEdgeView, target: "node" | "edge") {
    const value = { id: item.id, target, revision: item.revision };
    return <div className={styles.actions}>
      {item.status === "proposed" && <><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void change(value, "confirm")}>{tr("Confirmar recuerdo", "Confirm memory")}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void change(value, "reject")}>{tr("Descartar propuesta", "Dismiss proposal")}</button></>}
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEdit({ ...value, label: "label" in item ? item.label : item.relation, body: item.body })}>{tr("Editar", "Edit")}</button>
      {armed === item.id ? <><span>{tr("Se quitará de la memoria activa y no se borrará su fuente.", "This removes the active memory and keeps its source.")}</span><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void change(value, "forget")}>{tr("Sí, olvidar", "Yes, forget")}</button><button type="button" className="btn btn-ghost" onClick={() => setArmed(null)}>{tr("Conservar", "Keep")}</button></> : <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setArmed(item.id)}>{tr("Olvidar", "Forget")}</button>}
    </div>;
  }
  const shown = data?.nodes.slice(0, 8) || [], columns = graphWidth < 700 ? 1 : graphWidth < 1050 ? 2 : 3, width = Math.max(160, graphWidth), nodeWidth = (width - 84 - (columns - 1) * 40) / columns;
  const shownIds = new Set(shown.map(node => node.id)), allGraphEdges = data?.edges.filter(edge => shownIds.has(edge.fromId) && shownIds.has(edge.toId)) || [], graphEdges = allGraphEdges.slice(0,12);
  const nodeRows = new Map(shown.map((node,index) => [node.id, Math.floor(index / columns)])), points = new Map<string, { x: number; y: number; height: number; lines: string[]; index: number }>();
  let graphHeight = 12;
  for (let row = 0; row < Math.ceil(shown.length / columns); row++) {
    const nodes = shown.slice(row * columns, (row + 1) * columns), touching = graphEdges.filter(edge => nodeRows.get(edge.fromId) === row || nodeRows.get(edge.toId) === row).length;
    const top = graphHeight + 28 + touching * 10, wrapped = nodes.map((node,index) => graphTitleLines(`${row * columns + index + 1}. ${node.label}`, nodeWidth)), height = Math.max(...wrapped.map(lines => lines.length * 20 + 48), 88);
    nodes.forEach((node,index) => points.set(node.id, { x: 64 + index * (nodeWidth + 40), y: top, height, lines: wrapped[index], index: row * columns + index }));
    graphHeight = top + height + 16;
  }
  const port = (nodeId: string, edgeId: string) => { const point = points.get(nodeId)!, links = graphEdges.filter(edge => edge.fromId === nodeId || edge.toId === nodeId), order = links.findIndex(edge => edge.id === edgeId); return point.x + 18 + (nodeWidth - 36) * (order + 1) / (links.length + 1); };
  const corridor = (nodeId: string, edgeId: string) => { const row = nodeRows.get(nodeId), links = graphEdges.filter(edge => nodeRows.get(edge.fromId) === row || nodeRows.get(edge.toId) === row); return points.get(nodeId)!.y - 18 - links.findIndex(edge => edge.id === edgeId) * 10; };
  const markerId = `${uid.replace(/[^A-Za-z0-9_-]/g, "")}-memory-arrow`;
  const selectedNode = data?.nodes.find(node => node.id === selected);
  return <section className={styles.root} aria-labelledby={`${uid}-heading`} data-testid="altazor-memory">
    <div className={styles.heading}><div><h2 id={`${uid}-heading`}>{tr("Mi memoria", "My memory")}</h2><p>{causaId ? tr("Privada para ti, dentro de esta causa.", "Private to you, within this case.") : tr("Tus preferencias y conexiones entre ideas, bajo tu control.", "Your preferences and connections between ideas, under your control.")}</p></div><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void load()}>{tr("Actualizar", "Refresh")}</button></div>
    <p className={styles.note}>{tr("Sólo los recuerdos confirmados se usan al responder. Una confirmación expresa tu revisión; no certifica la verdad de una afirmación.", "Only confirmed memories are used in answers. Confirmation records your review; it does not certify a claim as true.")}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {!data && !error && <p role="status">{tr("Cargando tu memoria…", "Loading your memory…")}</p>}
    {data && <>
      {shown.length > 0 ? <figure className={styles.figure}><figcaption>{tr("Conexiones de tu memoria", "Connections in your memory")} <a href={`#${uid}-list`}>{tr("Ver la lista completa", "View the complete list")}</a></figcaption><div ref={graphFrame} className={styles.graphFrame}><svg className={styles.graph} width={width} height={graphHeight} viewBox={`0 0 ${width} ${graphHeight}`} role="group" aria-label={tr("Mapa de recuerdos; flechas para moverte y Enter para seleccionar", "Memory map; use arrows to move and Enter to select")}>
        <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L6 4 L1 7" className={styles.graphArrow}/></marker></defs>
        {graphEdges.map((edge,index) => { const from = points.get(edge.fromId)!, to = points.get(edge.toId)!, fromX = port(edge.fromId,edge.id), toX = port(edge.toId,edge.id), fromY = corridor(edge.fromId,edge.id), toY = corridor(edge.toId,edge.id), rail = 12 + index * 3; const route = from.y === to.y ? `M${fromX} ${from.y} V${fromY} H${toX} V${to.y - 3}` : `M${fromX} ${from.y} V${fromY} H${rail} V${toY} H${toX} V${to.y - 3}`; return <g key={edge.id} aria-hidden="true" data-selected={selected === edge.fromId || selected === edge.toId} className={styles.graphConnection}><path d={route} markerEnd={`url(#${markerId})`} className={styles.graphLine}/><circle cx={fromX} cy={from.y} r="3" className={styles.graphStart}/></g>; })}
        {shown.map((node, index) => { const point = points.get(node.id)!; return <g key={node.id} ref={element => { graphNodes.current[index] = element; }} role="button" tabIndex={0} aria-label={`${node.label}. ${node.status === "confirmed" ? tr("Confirmado", "Confirmed") : tr("Propuesto", "Proposed")}`} aria-pressed={selected === node.id} className={styles.graphNode} data-status={node.status} onClick={() => setSelected(node.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(node.id); } else { const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? columns : event.key === "ArrowUp" ? -columns : 0; if (step) { event.preventDefault(); graphNodes.current[((index + step) % shown.length + shown.length) % shown.length]?.focus(); } } }}><title>{node.label}</title><rect x={point.x} y={point.y} width={nodeWidth} height={point.height} rx="10"/><text x={point.x + 16} y={point.y + 26}>{point.lines.map((line,lineIndex) => <tspan key={lineIndex} x={point.x + 16} dy={lineIndex ? 20 : 0}>{line}</tspan>)}</text><text x={point.x + 16} y={point.y + point.height - 16} className={styles.graphStatus}>{node.status === "confirmed" ? tr("Confirmado", "Confirmed") : tr("Propuesto", "Proposed")}</text></g>; })}
      </svg></div>{graphEdges.length > 0 && <ol className={styles.graphRelations} aria-label={tr("Relaciones del mapa", "Map relationships")}>{graphEdges.map(edge => <li key={edge.id}><span className={styles.relationEndpoint}><small>{tr("Desde", "From")}</small><span>{points.get(edge.fromId)!.index + 1}. {shown.find(node => node.id === edge.fromId)!.label}</span></span><span className={styles.relationLabel}><ArrowRight size={18} aria-hidden="true"/>{edge.relation}</span><span className={styles.relationEndpoint}><small>{tr("Hacia", "To")}</small><span>{points.get(edge.toId)!.index + 1}. {shown.find(node => node.id === edge.toId)!.label}</span></span></li>)}</ol>}{(data.nodes.length > 8 || allGraphEdges.length > 12) && <p className={styles.note}>{tr("El mapa muestra hasta ocho recuerdos y doce relaciones. La lista conserva todos los recuerdos de esta ventana.", "The map shows up to eight memories and twelve relationships. The list retains all memories in this window.")}</p>}</figure> : <p className={styles.empty}>{tr("Empieza por una preferencia útil, como el tono que prefieres al redactar. Después puedes conectar ideas con pasajes de tu biblioteca.", "Start with a useful preference, such as your preferred writing tone. Then connect ideas to passages from your library.")}</p>}
      <div id={`${uid}-list`} className={styles.list} tabIndex={-1}><h3>{tr("Recuerdos y respaldos", "Memories and supporting sources")}</h3>{data.nodes.map(node => <article key={node.id} className={styles.item} data-selected={selected === node.id}><button type="button" className={styles.itemButton} onClick={() => setSelected(selected === node.id ? null : node.id)} aria-expanded={selected === node.id}><span>{node.label}</span><span className={styles.status}>{node.status === "confirmed" ? tr("Confirmado", "Confirmed") : tr("Por confirmar", "Awaiting confirmation")}</span></button>{selected === node.id && <div className={styles.detail}><p className={styles.body}>{node.body}</p>{supports(node.supports)}{actions(node, "node")}</div>}</article>)}</div>
      {selectedNode && data.edges.filter(edge => edge.fromId === selectedNode.id || edge.toId === selectedNode.id).map(edge => <article className={styles.item} key={edge.id}><h4>{data.nodes.find(node => node.id === edge.fromId)?.label} · {edge.relation} · {data.nodes.find(node => node.id === edge.toId)?.label}</h4><p className={styles.status}>{edge.status === "confirmed" ? tr("Relación confirmada", "Confirmed relationship") : tr("Relación por confirmar", "Relationship awaiting confirmation")}</p>{edge.body && <p>{edge.body}</p>}{supports(edge.supports)}{actions(edge, "edge")}</article>)}
      {data.unavailable.length > 0 && <div className={styles.unavailable}><p>{tr("Hay recuerdos cuyo respaldo ya no puede comprobarse. Se ocultan su contenido y sus relaciones. Puedes olvidarlos sin borrar los originales.", "Some memories no longer have a verifiable source. Their content and relationships are hidden. You can forget them without deleting originals.")}</p>{data.unavailable.map((item, index) => <button key={item.id} type="button" className="btn btn-ghost" disabled={busy} onClick={() => void change(item, "forget")}>{tr("Olvidar recuerdo no disponible", "Forget unavailable memory")} {index + 1}</button>)}</div>}
      {data.limited && <p className={styles.note}>{tr("Esta ventana está acotada. La memoria admite cien recuerdos y ciento cincuenta relaciones activas.", "This window is bounded. Memory supports one hundred active memories and one hundred and fifty relationships.")}</p>}
      {edit && <form className={styles.form} onSubmit={event => { event.preventDefault(); void change(edit, "edit", { label: edit.label, body: edit.body }).then(ok => { if (ok) setEdit(null); }); }}><h3>{tr("Revisar recuerdo", "Review memory")}</h3><label>{tr("Título", "Title")}<input value={edit.label} maxLength={edit.target === "edge" ? 100 : 160} required onChange={event => setEdit({ ...edit, label: event.target.value })} /></label><label>{tr("Detalle", "Details")}<textarea value={edit.body} maxLength={2000} rows={3} onChange={event => setEdit({ ...edit, body: event.target.value })} /></label><p className={styles.note}>{tr("Al editar volverá a quedar pendiente de confirmación.", "Editing requires a new confirmation.")}</p><div className={styles.actions}><button type="submit" className="btn btn-primary" disabled={busy}>{tr("Guardar propuesta", "Save proposal")}</button><button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>{tr("Cancelar edición", "Cancel editing")}</button></div></form>}
      <details className={styles.composer}><summary>{tr("Añadir recuerdo", "Add memory")}</summary><form onSubmit={event => void create(event)} className={styles.form}>
        <label>{tr("Origen", "Source")}<select value={sourceMode} onChange={event => { setSourceMode(event.target.value as typeof sourceMode); setBookId(""); setAfter(null); setSourceIndex(""); setCatalog(null); setSourceLoading(event.target.value !== "manual"); }}><option value="manual">{tr("Preferencia personal", "Personal preference")}</option><option value="book">{tr("Pasaje de mi biblioteca", "Passage from my library")}</option>{causaId && <option value="evidence">{tr("Documento de esta causa", "Document from this case")}</option>}</select></label>
        {sourceMode !== "manual" && <div className={styles.sourcePicker}>{sourceLoading && <p role="status">{tr("Cargando pasajes…", "Loading passages…")}</p>}{sourceMode === "book" && <label>{tr("Libro", "Book")}<select value={bookId} disabled={sourceLoading} onChange={event => { setBookId(event.target.value); setAfter(null); setSourceIndex(""); }}><option value="">{tr("Selecciona un libro", "Choose a book")}</option>{catalog?.books.map(book => <option value={book.id} key={book.id}>{book.title}</option>)}</select></label>}<label>{tr("Pasaje de respaldo", "Supporting passage")}<select value={sourceIndex} disabled={sourceLoading || !catalog?.sources.length} onChange={event => setSourceIndex(event.target.value)}><option value="">{tr("Selecciona un pasaje", "Choose a passage")}</option>{catalog?.sources.map((source, index) => <option value={index} key={index}>{source.label} · {source.quote.slice(0, 90)}</option>)}</select></label>{catalog && <p className={styles.note}>{catalog.notice}</p>}{sourceIndex !== "" && catalog?.sources[Number(sourceIndex)] && <blockquote className={styles.sourceQuote}>{catalog.sources[Number(sourceIndex)].quote}</blockquote>}{catalog?.nextAfter !== null && catalog?.nextAfter !== undefined && <button type="button" className="btn btn-ghost" disabled={sourceLoading} onClick={() => { setAfter(catalog.nextAfter); setSourceIndex(""); }}>{tr("Pasajes siguientes", "Next passages")}</button>}{sourceMode === "book" && bookId && after !== null && <button type="button" className="btn btn-ghost" onClick={() => setAfter(null)}>{tr("Volver al inicio del libro", "Return to the beginning")}</button>}</div>}
        {sourceMode !== "manual" && <label>{tr("Tipo de recuerdo", "Memory type")}<select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="concept">{tr("Concepto", "Concept")}</option><option value="claim">{tr("Afirmación para revisión", "Claim for review")}</option></select></label>}
        <label>{sourceMode === "manual" ? tr("Qué prefieres recordar", "What you want remembered") : tr("Idea o afirmación", "Idea or claim")}<input value={label} required minLength={2} maxLength={160} onChange={event => setLabel(event.target.value)} /></label><label>{tr("Detalle opcional", "Optional details")}<textarea value={body} rows={3} maxLength={2000} onChange={event => setBody(event.target.value)} /></label><button type="submit" className="btn btn-primary" disabled={busy || !label.trim() || sourceMode !== "manual" && sourceIndex === ""}>{busy ? tr("Guardando…", "Saving…") : tr("Guardar propuesta", "Save proposal")}</button>
      </form></details>
      {data.nodes.length > 1 && <details className={styles.composer}><summary>{tr("Conectar dos recuerdos", "Connect two memories")}</summary><form onSubmit={event => void relate(event)} className={styles.form}><label>{tr("Desde", "From")}<select required value={fromId} onChange={event => setFromId(event.target.value)}><option value="">{tr("Selecciona un recuerdo", "Choose a memory")}</option>{data.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><label>{tr("Hacia", "To")}<select required value={toId} onChange={event => setToId(event.target.value)}><option value="">{tr("Selecciona otro recuerdo", "Choose another memory")}</option>{data.nodes.filter(node => node.id !== fromId).map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><label>{tr("Cómo se relacionan", "How they relate")}<input value={relation} required minLength={2} maxLength={100} onChange={event => setRelation(event.target.value)} /></label><p className={styles.note}>{tr("Las preferencias se conectan como aportes tuyos. Para conceptos o afirmaciones, se usará el pasaje seleccionado en «Añadir recuerdo».", "Preferences connect as your own input. Concepts and claims use the passage selected under Add memory.")}</p><button type="submit" className="btn btn-primary" disabled={busy || !fromId || !toId || fromId === toId}>{tr("Proponer relación", "Propose relationship")}</button></form></details>}
    </>}
  </section>;
}
