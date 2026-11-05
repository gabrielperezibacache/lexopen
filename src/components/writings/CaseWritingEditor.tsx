"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BookOpen, Check, Download, FileText, History, Plus, Save } from "lucide-react";
import { ContextPanel } from "@/components/ui/ContextPanel";
import { apiMutation } from "@/lib/api-mutation";
import { newUiId } from "@/lib/ui-id";
import { withCaseBookContext } from "@/lib/causas/workflow-links";
import type { WritingDraftList, WritingDraftView, WritingHistory, WritingMutationResult, WritingReferenceView, WritingRevisionView } from "@/lib/writings/types";
import type { WritingSourceCatalog, WritingSourceInput } from "@/lib/writings/source-types";
import "./CaseWritingEditor.css";

type SaveState = "saved" | "pending" | "saving" | "offline" | "error" | "conflict";
type Panel = "sources" | "references" | "history" | "export";
type Fields = { title: string; body: string };
type FailedSave = Fields & { requestId: string; expectedRevision: number };
type ErrorBody = { code?: string };
type ApiError = Error & { status?: number; code?: string };
const labels: Record<SaveState, string> = { saved: "Guardado", pending: "Cambios pendientes", saving: "Guardando…", offline: "Sin conexión · cambios pendientes", error: "No se pudo guardar", conflict: "Hay cambios en otra sesión" };
const same = (a: Fields, b: Fields) => a.title.trim() === b.title.trim() && a.body === b.body;
const dateLabel = (value: string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const unavailable = (error: ApiError) => [401, 403, 404].includes(error.status || 0) || error.code === "writing_source_unavailable";
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal });
  const value = await res.json().catch(() => null);
  if (!res.ok || value === null) throw Object.assign(new Error(value?.error || "No se pudo abrir el escrito. Vuelva a intentarlo."), { status: res.status, code: value?.code });
  return value;
}
async function postJson<T>(url: string, body: unknown) {
  const control = new AbortController(), timeout = setTimeout(() => control.abort(), 30_000);
  try { return await apiMutation<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: control.signal }); }
  finally { clearTimeout(timeout); }
}
function fileDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function errorFrom(result: { status: number; error: string; data?: ErrorBody }): ApiError {
  return Object.assign(new Error(result.error), { status: result.status, code: result.data?.code });
}

export function CaseWritingEditor({ causaId, initialDraftId = "", initialSources = "fact", initialBookId = "" }: { causaId: string; initialDraftId?: string; initialSources?: WritingSourceInput["kind"]; initialBookId?: string }) {
  const base = "/api/causas/" + causaId + "/writings";
  const [list, setList] = useState<WritingDraftList>(), [selected, setSelected] = useState(""), [loaded, setLoaded] = useState<WritingDraftView>();
  const [newTitle, setNewTitle] = useState(""), [busy, setBusy] = useState(false), [creationPending, setCreationPending] = useState(false), [error, setError] = useState(""), [blocked, setBlocked] = useState(false), [recoverable, setRecoverable] = useState(false), [reload, setReload] = useState(0);
  const [listError, setListError] = useState(""), [listAttempt, setListAttempt] = useState(0);
  const guard = useRef<(() => Promise<boolean>) | null>(null);
  const createRequest = useRef<{ requestId: string; title: string; body: string } | null>(null);
  const registerGuard = useCallback((value: (() => Promise<boolean>) | null) => { guard.current = value; }, []);
  const block = useCallback((message: string, allowRecovery = false) => { setBlocked(true); setRecoverable(allowRecovery); setLoaded(undefined); setList(undefined); setError(message); }, []);
  useEffect(() => {
    if (blocked) return;
    const control = new AbortController();
    getJson<WritingDraftList>(base, control.signal).then(data => {
      if (!control.signal.aborted) {
        setList(data);
        setListError("");
        setSelected(previous => previous || initialDraftId || data.drafts.find(item => item.available)?.id || "");
      }
    }).catch((reason: ApiError) => { if (!control.signal.aborted) { if (unavailable(reason)) block(reason.message); else setListError(reason.message); } });
    return () => control.abort();
  }, [base, initialDraftId, block, blocked, listAttempt]);
  useEffect(() => {
    if (!selected || blocked) return;
    const control = new AbortController();
    getJson<WritingDraftView>(base + "/" + selected, control.signal).then(value => {
      if (control.signal.aborted) return;
      setLoaded(value); setError("");
      const url = new URL(location.href);
      // Next copies its internal history state when data is null and updates
      // useSearchParams, keeping the shared navigation on this exact draft.
      if (url.searchParams.get("draft") !== value.id) { url.searchParams.set("draft", value.id); history.replaceState(null, "", url); }
    }).catch((reason: ApiError) => {
      if (!control.signal.aborted) { setLoaded(undefined); setError(reason.message); if (unavailable(reason) && reason.status !== 404) block(reason.message, reason.code === "writing_source_unavailable"); }
    });
    return () => control.abort();
  }, [base, selected, reload, blocked, block]);
  const changed = useCallback((draft: WritingDraftView) => {
    setList(current => current ? { ...current, drafts: current.drafts.map(item => item.id === draft.id ? { id: draft.id, available: true, title: draft.title, revision: draft.revision, updatedAt: draft.updatedAt } : item) } : current);
  }, []);
  async function choose(id: string) {
    if (id === selected || guard.current && !await guard.current()) return;
    setLoaded(undefined); setSelected(id); setError("");
    const url = new URL(location.href); url.searchParams.set("draft", id); history.replaceState(null, "", url);
  }
  async function create() {
    if (guard.current && !await guard.current()) return;
    if (!createRequest.current) { createRequest.current = { requestId: newUiId("writing"), title: newTitle.trim(), body: "" }; setCreationPending(true); }
    setBusy(true); setError("");
    const result = await postJson<WritingMutationResult & ErrorBody>(base, createRequest.current);
    setBusy(false);
    if (!result.ok) {
      const reason = errorFrom(result); setError(reason.message);
      if (unavailable(reason)) block(reason.message);
      if (result.status >= 400 && result.status < 500) { createRequest.current = null; setCreationPending(false); }
      return;
    }
    const draft = result.data.draft; createRequest.current = null; setCreationPending(false); setNewTitle(""); setLoaded(draft);
    setList(current => ({ drafts: [{ id: draft.id, available: true, title: draft.title, revision: draft.revision, updatedAt: draft.updatedAt }, ...(current?.drafts || []).filter(item => item.id !== draft.id)], canWrite: draft.canWrite, limited: current?.limited || false, nextAfter: current?.nextAfter || null }));
    setSelected(draft.id);
    const url = new URL(location.href); url.searchParams.set("draft", draft.id); history.replaceState(null, "", url);
  }
  async function moreDrafts() {
    if (!list?.nextAfter) return;
    setBusy(true);
    try { const next = await getJson<WritingDraftList>(base + "?after=" + encodeURIComponent(list.nextAfter)); setList({ ...next, drafts: [...list.drafts, ...next.drafts.filter(item => !list.drafts.some(previous => previous.id === item.id))] }); }
    catch (reason) { const failure = reason as ApiError; setError(failure.message); if (unavailable(failure)) block(failure.message); }
    finally { setBusy(false); }
  }
  if (blocked) return <section className="writing-empty"><div role="alert"><h2>Escrito protegido</h2><p>{error}</p><p>El contenido permanece oculto porque la causa o alguno de sus respaldos dejó de estar disponible. Vuelva a abrirlo cuando se restablezca el acceso.</p></div><button type="button" className="btn btn-secondary" onClick={() => location.reload()}>Volver a comprobar acceso</button>{recoverable && selected && <BlockedWritingRecovery url={base + "/" + selected} onNoAccess={block} onRecovered={value => { setBlocked(false); setRecoverable(false); setLoaded(value); setSelected(value.id); setError(""); setReload(previous => previous + 1); }} />}</section>;
  return <section className="writing-workbench" aria-label="Escritos privados de la causa">
    <div className="writing-overview">
      <label>Mis escritos de esta causa<select className="select" value={selected} disabled={busy || !list?.drafts.length} onChange={event => void choose(event.target.value)}><option value="">Seleccione un escrito</option>{list?.drafts.map(item => <option key={item.id} value={item.id}>{item.available ? item.title : "Escrito con respaldo no disponible"}</option>)}</select></label>
      {list?.canWrite && <form className="writing-create" onSubmit={event => { event.preventDefault(); void create(); }}><label>Nombre del nuevo escrito<input className="input" value={newTitle} onChange={event => setNewTitle(event.target.value)} minLength={1} maxLength={200} required disabled={busy || creationPending} placeholder="Por ejemplo, observaciones a la prueba" /></label><button className="btn btn-primary" type="submit" disabled={busy || !newTitle.trim()}><Plus size={16} aria-hidden="true" />{creationPending ? "Reintentar creación" : "Nuevo escrito"}</button></form>}
      <p className="writing-overview-note">Sus borradores son privados. La causa conserva el contexto; cada escrito conserva sus versiones y los respaldos que usted incorpora.</p>
      {list?.nextAfter && <button type="button" className="writing-text-link" disabled={busy} onClick={() => void moreDrafts()}>Cargar más escritos</button>}
    </div>
    {error && <p className="writing-message" data-error="true" role="alert">{error}</p>}
    {listError && <div className="writing-message writing-load-recovery" data-error="true" role="alert"><p>{listError}</p><button type="button" className="btn btn-secondary" onClick={() => { setListError(""); setListAttempt(value => value + 1); }}>Reintentar carga de escritos</button></div>}
    {!list && !error && !listError && <p role="status">Abriendo sus escritos…</p>}
    {list && !list.drafts.length && <div className="writing-empty"><h2>Un escrito, con sus antecedentes a mano</h2><p>Cree el primer borrador para redactar sobre una hoja continua. A su lado podrá consultar hechos, recuperar notas de audiencia y elegir pasajes de su biblioteca.</p><p>El guardado es automático. Cada cambio confirmado queda en el historial y puede recuperarse como una versión nueva.</p></div>}
    {selected && !loaded && !error && <p role="status">Abriendo y comprobando respaldos…</p>}
    {loaded && loaded.id === selected && <WritingSession key={selected + ":" + reload} causaId={causaId} initial={loaded} initialSources={initialSources} initialBookId={initialBookId} onSaved={changed} onPrivateBlocked={block} registerGuard={registerGuard} reloadServer={() => { setLoaded(undefined); setReload(value => value + 1); }} />}
  </section>;
}

function WritingSession({ causaId, initial, initialSources, initialBookId, onSaved, onPrivateBlocked, registerGuard, reloadServer }: {
  causaId: string; initial: WritingDraftView; initialSources: WritingSourceInput["kind"]; initialBookId: string;
  onSaved: (draft: WritingDraftView) => void; onPrivateBlocked: (message: string, allowRecovery?: boolean) => void;
  registerGuard: (guard: (() => Promise<boolean>) | null) => void; reloadServer: () => void;
}) {
  const url = "/api/causas/" + causaId + "/writings/" + initial.id;
  const [draft, setDraft] = useState(initial), [fields, setFields] = useState<Fields>({ title: initial.title, body: initial.body });
  const [state, setState] = useState<SaveState>("saved"), [error, setError] = useState(""), [notice, setNotice] = useState(""), [panel, setPanel] = useState<Panel>("sources");
  const [panelOpen, setPanelOpen] = useState(Boolean(initialBookId)), [sourceVisit, setSourceVisit] = useState(0), [historyVisit, setHistoryVisit] = useState(0);
  const [actionBusy, setActionBusy] = useState(false), [pendingAction, setPendingAction] = useState(false);
  const draftRef = useRef(initial), fieldsRef = useRef(fields), stateRef = useRef<SaveState>("saved"), failedSave = useRef<FailedSave | null>(null);
  const flight = useRef<Promise<boolean> | null>(null), mounted = useRef(true), frozen = useRef(false), actionFlight = useRef(false);
  const structural = useRef<{ path: string; payload: Record<string, unknown>; success: string } | null>(null);
  const setSaveState = useCallback((value: SaveState) => { stateRef.current = value; if (mounted.current) setState(value); }, []);
  const publish = useCallback((value: WritingDraftView) => { draftRef.current = value; if (mounted.current) { setDraft(value); onSaved(value); } }, [onSaved]);
  const privateFailure = useCallback((reason: ApiError) => { if (unavailable(reason)) { frozen.current = true; fieldsRef.current = { title: "", body: "" }; failedSave.current = null; structural.current = null; if (mounted.current) onPrivateBlocked(reason.message, reason.code === "writing_source_unavailable"); return true; } return false; }, [onPrivateBlocked]);
  const catalogFailure = useCallback(async (reason: ApiError, signal: AbortSignal) => {
    if (reason.status !== 404) { privateFailure(reason); return; }
    // A revoked candidate is not necessarily part of this draft. Check the
    // actual draft before hiding its text, without replacing local edits.
    try { await getJson<WritingDraftView>(url, signal); }
    catch (failure) { if (!signal.aborted) privateFailure(failure as ApiError); }
  }, [url, privateFailure]);
  const flush = useCallback(async (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (frozen.current || stateRef.current === "conflict" || structural.current || !draftRef.current.canWrite) return !frozen.current && stateRef.current !== "conflict" && !structural.current && same(fieldsRef.current, draftRef.current);
    const run = async () => {
      while (!same(fieldsRef.current, draftRef.current) || failedSave.current) {
        if (!fieldsRef.current.title.trim()) { if (mounted.current) setError("Añada un título para guardar el escrito."); setSaveState("error"); return false; }
        const payload = failedSave.current || { ...fieldsRef.current, expectedRevision: draftRef.current.revision, requestId: newUiId("writing-save") };
        failedSave.current = payload; setSaveState("saving"); if (mounted.current) setError("");
        const control = new AbortController(), timeout = setTimeout(() => control.abort(), 30_000);
        const result = await apiMutation<WritingMutationResult & ErrorBody>(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: control.signal });
        clearTimeout(timeout);
        if (!result.ok) {
          const reason = errorFrom(result);
          if (privateFailure(reason)) return false;
          if (result.status === 409) { failedSave.current = null; setSaveState("conflict"); }
          else { if (result.status >= 400 && result.status < 500) failedSave.current = null; setSaveState(result.status === 0 ? "offline" : "error"); }
          if (mounted.current) setError(reason.message); return false;
        }
        const saved = result.data.draft;
        failedSave.current = null;
        if (!same(saved, payload)) {
          publish(saved); setSaveState("conflict"); if (mounted.current) setError("La petición anterior ya se guardó, pero existe una versión posterior. Sus cambios locales se mantienen para que los revise."); return false;
        }
        publish(saved);
        if (same(fieldsRef.current, payload)) { fieldsRef.current = { title: saved.title, body: saved.body }; if (mounted.current) setFields(fieldsRef.current); }
      }
      fieldsRef.current = { title: draftRef.current.title, body: draftRef.current.body };
      if (mounted.current) { setFields(fieldsRef.current); setError(""); }
      setSaveState("saved");
      return true;
    };
    const task = run(); flight.current = task;
    try { return await task; } finally { if (flight.current === task) flight.current = null; }
  }, [url, privateFailure, publish, setSaveState]);
  useEffect(() => {
    mounted.current = true; registerGuard(flush);
    return () => {
      mounted.current = false; registerGuard(null);
      // A SPA history traversal can unmount without a link click or unload.
      // Continue the same bounded queue with ref-only progress; do not lose its tail.
      if (!frozen.current && stateRef.current !== "conflict" && !structural.current && (flight.current || failedSave.current || !same(fieldsRef.current, draftRef.current))) void flush();
    };
  }, [flush, registerGuard]);
  useEffect(() => {
    if (state !== "pending" || actionBusy) return;
    const timer = setTimeout(() => { void flush(); }, 900);
    return () => clearTimeout(timer);
  }, [state, fields, actionBusy, flush]);
  useEffect(() => {
    const pending = () => Boolean(failedSave.current || flight.current || structural.current || !same(fieldsRef.current, draftRef.current));
    const leaving = (event: BeforeUnloadEvent) => { if (pending()) { event.preventDefault(); event.returnValue = ""; } };
    const link = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !pending()) return;
      const anchor = (event.target as Element)?.closest("a");
      if (!anchor || anchor.hasAttribute("download") || anchor.target && anchor.target !== "_self") return;
      const target = new URL(anchor.href, location.href);
      if (target.href.split("#")[0] === location.href.split("#")[0] || !["http:", "https:"].includes(target.protocol)) return;
      event.preventDefault(); event.stopPropagation();
      void flush().then(ok => { if (ok) location.assign(target.href); });
    };
    window.addEventListener("beforeunload", leaving); document.addEventListener("click", link, true);
    return () => { window.removeEventListener("beforeunload", leaving); document.removeEventListener("click", link, true); };
  }, [flush]);
  function edit(patch: Partial<Fields>) {
    fieldsRef.current = { ...fieldsRef.current, ...patch }; setFields(fieldsRef.current); setNotice("");
    if (stateRef.current !== "conflict") setSaveState(failedSave.current ? stateRef.current : "pending");
  }
  async function commit(path?: string, payload?: Record<string, unknown>, success?: string) {
    if (actionFlight.current) return;
    actionFlight.current = true; setActionBusy(true);
    if (!structural.current) {
      if (!await flush() || !path || !payload) { actionFlight.current = false; setActionBusy(false); return; }
      structural.current = { path, payload: { ...payload, requestId: newUiId("writing-action"), expectedRevision: draftRef.current.revision }, success: success || "Escrito actualizado." };
    }
    frozen.current = true; setActionBusy(true); setPendingAction(true); setError("");
    const action = structural.current;
    const result = await postJson<WritingMutationResult & ErrorBody>(url + action.path, action.payload);
    actionFlight.current = false;
    if (!mounted.current) return;
    setActionBusy(false);
    if (!result.ok) {
      const reason = errorFrom(result); if (privateFailure(reason)) return;
      if (result.status >= 400 && result.status < 500) { structural.current = null; setPendingAction(false); frozen.current = false; }
      setSaveState(result.status === 409 ? "conflict" : result.status === 0 ? "offline" : "error"); setError(reason.message); return;
    }
    structural.current = null; setPendingAction(false); frozen.current = false;
    publish(result.data.draft); fieldsRef.current = { title: result.data.draft.title, body: result.data.draft.body }; setFields(fieldsRef.current);
    setSaveState("saved"); setNotice(action.success); setPanelOpen(false);
  }
  async function download(format: "markdown" | "text" | "docx") {
    if (!await flush()) return;
    setActionBusy(true); setError("");
    try {
      const response = await fetch(url + "/export?format=" + format, { cache: "no-store" });
      if (!response.ok) { const value = await response.json(); throw Object.assign(new Error(value.error || "No se pudo exportar."), { status: response.status, code: value.code }); }
      fileDownload(await response.blob(), "lexopen-escrito." + (format === "markdown" ? "md" : format === "docx" ? "docx" : "txt"));
      setNotice("Archivo descargado con los respaldos que se acaban de comprobar.");
    } catch (reason) { const failure = reason as ApiError; if (!privateFailure(failure)) setError(failure.message); }
    finally { if (mounted.current) setActionBusy(false); }
  }
  const operating = actionBusy || pendingAction, locked = operating || !draft.canWrite;
  const panelId = `writing-tools-${draft.id}`;
  const panelTitles: Record<Panel, string> = { sources: "Fuentes para el escrito", references: "Respaldos incorporados", history: "Historial del escrito", export: "Exportar el escrito" };
  function choosePanel(value: Panel) {
    setPanel(value); setPanelOpen(true);
    if (value === "sources") setSourceVisit(visit => visit + 1);
    if (value === "history") setHistoryVisit(visit => visit + 1);
  }
  const feedback = <>
    {error && <div className="writing-message writing-session-message" data-error="true" role="alert"><p>{error}</p>{state === "conflict" ? <div className="writing-actions"><button type="button" className="btn btn-secondary" onClick={() => fileDownload(new Blob([fieldsRef.current.title + "\n\n" + fieldsRef.current.body + "\n\nCopia local sin nueva corroboración de respaldos."], { type: "text/plain;charset=utf-8" }), "lexopen-copia-local.txt")}>Conservar copia local</button><button type="button" className="btn btn-secondary" onClick={reloadServer}>Descartar cambios locales y cargar actual</button></div> : <div className="writing-actions"><button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={() => { if (structural.current) void commit(); else void flush(); }}>Reintentar guardado</button></div>}</div>}
    {!error && notice && <p className="writing-message writing-session-message" role="status">{notice}</p>}
  </>;
  return <div data-testid="writing-editor" className="writing-session">
    <nav className="writing-toolstrip" aria-label="Herramientas del escrito">
      <button type="button" className="btn btn-secondary" aria-controls={panelId} aria-expanded={panelOpen && panel === "sources"} onClick={() => choosePanel("sources")}><BookOpen size={16} aria-hidden="true" />Incorporar fuentes</button>
      <button type="button" className="btn btn-ghost" aria-controls={panelId} aria-expanded={panelOpen && panel === "references"} onClick={() => choosePanel("references")}>Referencias ({draft.references.length})</button>
      <details className="writing-more-tools"><summary>Otras herramientas</summary><div><button type="button" aria-controls={panelId} onClick={() => choosePanel("history")}><History size={16} aria-hidden="true" />Historial</button><button type="button" aria-controls={panelId} onClick={() => choosePanel("export")}><Download size={16} aria-hidden="true" />Exportar</button></div></details>
    </nav>
    {!panelOpen && feedback}
    <div className="context-workspace writing-layout">
      <div className="writing-paper">
        <div className="writing-paper-meta"><span><FileText size={18} aria-hidden="true" />Escrito privado · versión {draft.revision}</span><span className="writing-status" data-state={state} role="status" aria-live="polite">{state === "saved" && <Check size={16} aria-hidden="true" />}{labels[state]}</span></div>
        {draft.canWrite && <div className="writing-actions writing-actions-top"><button type="button" className="btn btn-primary" disabled={locked || state === "conflict" || state === "saved"} onClick={() => void flush()}><Save size={16} aria-hidden="true" />Guardar ahora</button></div>}
        <label className="writing-title-label" htmlFor="writing-title">Título del escrito</label><input id="writing-title" className="writing-title" value={fields.title} onChange={event => edit({ title: event.target.value })} maxLength={200} disabled={locked} />
        <label className="writing-body-label" htmlFor="writing-body">Texto del escrito</label><textarea id="writing-body" className="writing-body" value={fields.body} onChange={event => edit({ body: event.target.value })} maxLength={100_000} rows={20} disabled={locked} placeholder="Empiece a redactar. Puede incorporar un hecho, una nota o un pasaje desde el cuaderno de fuentes…" spellCheck />
        <p className="writing-help">El texto se guarda automáticamente al dejar de escribir. Los marcadores [^R1] enlazan los respaldos incorporados; consérvelos junto a la afirmación correspondiente. Las conclusiones requieren revisión profesional.</p><p className="writing-help">{fields.body.length.toLocaleString("es-CL")} de 100.000 caracteres · último guardado: {dateLabel(draft.updatedAt)}</p>
      </div>
      <ContextPanel id={panelId} title={panelTitles[panel]} open={panelOpen} onClose={() => setPanelOpen(false)} className="writing-companion" headerActions={<p className="writing-panel-status" data-state={state} role="status" aria-live="polite">{labels[state]} · versión {draft.revision}</p>}>
        {panelOpen && feedback}
        <div className="context-panel-tools" aria-label="Cuaderno del escrito">{([["sources","Añadir"],["references","Respaldos"],["history","Versiones"],["export","Descargar"]] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={panel === value} onClick={() => choosePanel(value)}>{label}</button>)}</div>
        <div hidden={panel !== "sources"}><SourcePicker causaId={causaId} draftId={draft.id} active={panelOpen && panel === "sources"} visit={sourceVisit} initialKind={initialSources} initialBookId={initialBookId} disabled={locked || state === "conflict"} add={async source => { await commit("/sources", { source }, "Fuente incorporada al final del escrito. Sus citas quedan vinculadas a esta versión."); }} onCatalogError={catalogFailure} /></div>
        <div hidden={panel !== "references"} className="writing-companion-panel"><p>Los pasajes vinculados a esta versión vuelven a comprobarse al abrir o exportar el escrito.</p><References causaId={causaId} draftId={draft.id} references={draft.references} /><Warnings warnings={draft.warnings} /></div>
        <div hidden={panel !== "history"}><HistoryPanel url={url} visit={historyVisit} active={panelOpen && panel === "history"} current={draft.revision} canWrite={draft.canWrite} disabled={operating || state === "conflict"} restore={revision => commit("/restore", { targetRevision: revision }, "Versión recuperada como un nuevo guardado. El historial anterior se conserva.")} onPrivateError={privateFailure} /></div>
        <section hidden={panel !== "export"}><p>Se comprueban los respaldos y el acceso antes de preparar la descarga. Los cambios pendientes se guardan primero.</p><div className="writing-actions"><button type="button" className="btn btn-primary" disabled={operating || state === "conflict"} onClick={() => void download("docx")}><Download size={16} aria-hidden="true" />Descargar Word</button></div><details><summary>Otros formatos</summary><div className="writing-actions"><button type="button" className="btn btn-secondary" disabled={operating || state === "conflict"} onClick={() => void download("markdown")}>Descargar Markdown</button><button type="button" className="btn btn-secondary" disabled={operating || state === "conflict"} onClick={() => void download("text")}>Descargar TXT</button></div></details></section>
      </ContextPanel>
    </div>
  </div>;
}

function SourcePicker({ causaId, draftId, active, visit, initialKind, initialBookId, disabled, add, onCatalogError }: { causaId: string; draftId: string; active: boolean; visit: number; initialKind: WritingSourceInput["kind"]; initialBookId: string; disabled: boolean; add: (source: WritingSourceInput) => Promise<void>; onCatalogError: (error: ApiError, signal: AbortSignal) => Promise<void> }) {
  const [kind, setKind] = useState<WritingSourceInput["kind"]>(initialBookId ? "book" : initialKind), [query, setQuery] = useState(""), [search, setSearch] = useState(""), [bookId, setBookId] = useState(initialBookId);
  const [cursor, setCursor] = useState(""), [attempt, setAttempt] = useState(0);
  const [bookOptions, setBookOptions] = useState<{ visit: number; books: WritingSourceCatalog["books"] }>({ visit, books: [] });
  const books = bookOptions.visit === visit ? bookOptions.books : [];
  const sourceId = useId(), kinds = ["fact", "note", "book"] as const;
  const requestKey = JSON.stringify([kind, search, bookId, cursor, attempt, visit]);
  const [catalogState, setCatalogState] = useState<{ key: string; catalog?: WritingSourceCatalog; error?: string }>();
  const catalog = catalogState?.key === requestKey ? catalogState.catalog : undefined, error = catalogState?.key === requestKey ? catalogState.error : "", loading = !catalog && !error;
  useEffect(() => {
    if (!active) return;
    const control = new AbortController(), params = new URLSearchParams({ kind });
    if (search) params.set("q", search); if (bookId && kind === "book") params.set("bookId", bookId); if (cursor) params.set("after", cursor);
    getJson<WritingSourceCatalog>("/api/causas/" + causaId + "/writing-sources?" + params, control.signal).then(value => {
      if (control.signal.aborted) return;
      setCatalogState({ key: requestKey, catalog: value });
      if (kind === "book") {
        setBookOptions({ visit, books: value.books });
        if (!bookId && value.books.length === 1) setBookId(value.books[0].id);
      }
    }).catch(async (reason: ApiError) => {
      if (control.signal.aborted) return;
      setCatalogState({ key: requestKey, error: reason.message });
      if (unavailable(reason)) setBookOptions({ visit, books: [] });
      await onCatalogError(reason, control.signal);
    });
    return () => control.abort();
  }, [causaId, active, visit, kind, search, bookId, cursor, onCatalogError, requestKey]);
  function chooseKind(value: WritingSourceInput["kind"]) {
    if (value === kind) return;
    setKind(value); setSearch(""); setQuery(""); setCursor("");
  }
  return <div className="writing-companion-panel"><h2>Cuaderno de fuentes</h2><p>Elija qué incorporar. El pasaje o la nota se añaden al final con su referencia; su texto actual se guarda primero.</p>
    <div className="writing-source-kinds" role="tablist" aria-label="Origen del respaldo" onKeyDown={event => {
      let index = (kinds as readonly string[]).indexOf(kind);
      if (event.key === "ArrowRight") index = (index + 1) % kinds.length;
      else if (event.key === "ArrowLeft") index = (index + kinds.length - 1) % kinds.length;
      else if (event.key === "Home") index = 0;
      else if (event.key === "End") index = kinds.length - 1;
      else return;
      event.preventDefault(); chooseKind(kinds[index]); (event.currentTarget.children[index] as HTMLButtonElement).focus();
    }}>{([["fact", "Hechos"], ["note", "Notas de audiencia"], ["book", "Biblioteca"]] as const).map(([value, label]) => <button type="button" role="tab" id={sourceId + "-" + value} aria-controls={sourceId + "-panel"} aria-selected={kind === value} tabIndex={kind === value ? 0 : -1} key={value} onClick={() => chooseKind(value)}>{label}</button>)}</div>
    <div role="tabpanel" id={sourceId + "-panel"} aria-labelledby={sourceId + "-" + kind} aria-busy={loading}>
      <form className="writing-source-search" onSubmit={event => { event.preventDefault(); setCursor(""); setSearch(query.trim()); }}>
        {kind === "book" && <label>Libro o sentencia<select className="select" value={bookId} onChange={event => { setBookId(event.target.value); setCursor(""); }}><option value="">Seleccione un volumen</option>{bookId && !books.some(book => book.id === bookId) && <option value={bookId}>Volumen seleccionado desde la biblioteca</option>}{books.map(book => <option key={book.id} value={book.id}>{book.title}{book.owned ? "" : " · colección compartida"}</option>)}</select></label>}
        <label>Buscar en {kind === "fact" ? "los hechos" : kind === "note" ? "las notas" : "el volumen"}<input className="input" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder={kind === "book" ? "Palabras del pasaje…" : "Texto o título…"} /></label>
        <button className="btn btn-secondary" type="submit" disabled={loading || kind === "book" && !bookId}>Buscar fuentes</button>
      </form>
      {loading && <p role="status">Comprobando fuentes disponibles…</p>}
      {error && <div className="writing-message writing-load-recovery" data-error="true" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary" onClick={() => setAttempt(value => value + 1)}>Reintentar carga de fuentes</button>{kind === "book" && bookId && <button type="button" className="btn btn-secondary" onClick={() => { setBookId(""); setSearch(""); setQuery(""); setCursor(""); }}>Cambiar volumen</button>}</div>}
      {catalog && <><p className="writing-help">{catalog.coverage.scope}</p><Warnings warnings={catalog.warnings} /><ul className="writing-candidates">{catalog.candidates.map((candidate, index) => <li key={JSON.stringify(candidate.input) + ":" + index} data-testid="writing-source-candidate"><span className="writing-review">{candidate.review}</span><h3>{candidate.title}</h3><p className="writing-candidate-text">{candidate.text}</p><p>{candidate.citationCount ? candidate.citationCount + " respaldo" + (candidate.citationCount === 1 ? "" : "s") + " documental" + (candidate.citationCount === 1 ? "" : "es") : "Observación personal · sin respaldo documental"}</p><Warnings warnings={candidate.warnings} /><p className="writing-candidate-origin"><a href={withCaseBookContext(candidate.href, causaId, draftId)} target="_blank" rel="noreferrer">Abrir origen</a></p><button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => void add(candidate.input)}>Incorporar al escrito</button></li>)}</ul>{!catalog.candidates.length && <p>{kind === "book" && !bookId ? "Seleccione uno de sus libros o un volumen de una colección compartida para consultar pasajes." : "No hay resultados disponibles para esta selección. Puede revisar los antecedentes y volver a buscar."}</p>}{catalog.nextAfter && <button type="button" className="writing-text-link" disabled={loading} onClick={() => setCursor(catalog.nextAfter!)}>Ver siguiente página de fuentes</button>}</>}
    </div>
  </div>;
}

function Warnings({ warnings }: { warnings: string[] }) { return warnings.length ? <ul className="writing-warnings">{[...new Set(warnings)].map(warning => <li key={warning}>{warning}</li>)}</ul> : null; }
function BlockedWritingRecovery({ url, onRecovered, onNoAccess }: { url: string; onRecovered: (draft: WritingDraftView) => void; onNoAccess: (message: string) => void }) {
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  const receipt = useRef<{ requestId: string; expectedRevision: number; targetRevision: number } | null>(null);
  const running = useRef(false);
  const privateError = useCallback((reason: ApiError) => { if ([401, 403, 404].includes(reason.status || 0)) onNoAccess(reason.message); return false; }, [onNoAccess]);
  async function recover(revision?: number) {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      if (!receipt.current) {
        if (!revision) return;
        const latest = await getJson<WritingHistory>(url + "/history"), expectedRevision = latest.revisions[0]?.revision;
        if (!expectedRevision) throw new Error("No se encontró una versión para recuperar.");
        receipt.current = { requestId: newUiId("writing-recover"), expectedRevision, targetRevision: revision }; setPending(true);
      }
      const result = await postJson<WritingMutationResult & ErrorBody>(url + "/restore", receipt.current);
      if (!result.ok) {
        if (result.status >= 400 && result.status < 500) { receipt.current = null; setPending(false); }
        throw errorFrom(result);
      }
      receipt.current = null; setPending(false); onRecovered(result.data.draft);
    } catch (reason) { const failure = reason as ApiError; setError(failure.message); privateError(failure); }
    finally { running.current = false; setBusy(false); }
  }
  return <div className="writing-blocked-history"><p>Puede consultar el registro de versiones y recuperar una anterior que conserve todos sus respaldos autorizados. El texto de una versión sólo se muestra cuando supera de nuevo la comprobación.</p>{error && <p className="writing-message" data-error="true" role="alert">{error}</p>}{pending && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void recover()}>Reintentar recuperación</button>}<HistoryPanel url={url} current={0} canWrite disabled={busy || pending} restore={recover} onPrivateError={privateError} /></div>;
}
function References({ causaId, draftId, references }: { causaId: string; draftId: string; references: WritingReferenceView[] }) {
  return <ul className="writing-reference-list">{!references.length && <li><p>Este escrito aún no tiene respaldos incorporados. Puede añadirlos desde el cuaderno de fuentes.</p></li>}{references.map(reference => <li key={reference.id} data-testid="writing-reference"><h3>{reference.id} · {reference.source.title}</h3><p>{reference.source.kind === "document" ? "Pasaje del expediente" : reference.source.kind === "fact" ? "Hecho del expediente" : reference.source.kind === "note" ? "Nota de audiencia" : "Pasaje de biblioteca"}</p><a href={withCaseBookContext(reference.source.href, causaId, draftId)} target="_blank" rel="noreferrer">Volver al origen</a><Warnings warnings={reference.source.warnings} />{reference.source.citations.map((citation, index) => <div key={citation.sourceKey + ":" + index}><blockquote>{citation.quote}</blockquote><p><a href={withCaseBookContext(citation.href, causaId, draftId)} target="_blank" rel="noreferrer">{citation.reference} · {citation.locator}</a></p><Warnings warnings={citation.warnings} /><details><summary>Datos de cotejo del pasaje</summary><p>Base: {citation.verificationBasis === "retained_text" ? "texto conservado; original no conservado" : "original conservado"}</p><p className="writing-help">SHA-256 del pasaje: {citation.quoteSha256}</p></details></div>)}</li>)}</ul>;
}
function HistoryPanel({ url, active = true, visit = 0, current, canWrite, disabled, restore, onPrivateError }: { url: string; active?: boolean; visit?: number; current: number; canWrite: boolean; disabled: boolean; restore: (revision: number) => Promise<void>; onPrivateError: (error: ApiError) => boolean }) {
  const previewElement = useRef<HTMLElement>(null), chosenRevision = useRef<number | undefined>(undefined);
  const [validated, setValidated] = useState("");
  const [history, setHistory] = useState<WritingHistory>(), [before, setBefore] = useState<number>(), [preview, setPreview] = useState<WritingRevisionView>(), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const checkKey = JSON.stringify([url, current, before, visit]), ready = validated === checkKey;
  useEffect(() => {
    if (!active) return;
    const control = new AbortController();
    void (async () => {
      try {
        const value = await getJson<WritingHistory>(url + "/history" + (before ? "?before=" + before : ""), control.signal);
        const revision = chosenRevision.current;
        const checkedPreview = revision === undefined ? undefined : await getJson<WritingRevisionView>(url + "/history/" + revision, control.signal);
        if (!control.signal.aborted) { setHistory(value); setPreview(checkedPreview); setError(""); setValidated(checkKey); }
      } catch (reason) { if (!control.signal.aborted) { const failure = reason as ApiError; setError(failure.message); if ([401,403,404].includes(failure.status || 0)) onPrivateError(failure); } }
    })();
    return () => control.abort();
  }, [url, active, before, checkKey, onPrivateError]);
  async function open(revision: number) {
    chosenRevision.current = revision; setPreview(undefined); setError(""); setLoading(true);
    try { setPreview(await getJson<WritingRevisionView>(url + "/history/" + revision)); requestAnimationFrame(() => previewElement.current?.scrollIntoView({ block: "start", behavior: "instant" })); }
    catch (reason) { const failure = reason as ApiError; setError(failure.message); if ([401, 403, 404].includes(failure.status || 0)) onPrivateError(failure); }
    finally { setLoading(false); }
  }
  const changeLabel = { created: "Creación", saved: "Guardado", source_added: "Fuente incorporada", restored: "Recuperación" };
  return <div className="writing-companion-panel">
    <h2>Historial del escrito</h2>
    <p>Cada guardado confirmado conserva el texto y sus referencias. Abra una versión para revisarla antes de recuperarla como un nuevo guardado.</p>
    {error && <p className="writing-message" data-error="true" role="alert">{error}</p>}
    {loading && <p role="status">Comprobando la versión y sus fuentes…</p>}
    {ready && preview && <article className="writing-history-preview" ref={previewElement}>
      <h3>Vista previa · versión {preview.revision}</h3>
      <p>{preview.title}</p>
      <pre>{preview.body || "Sin texto guardado."}</pre>
      <Warnings warnings={preview.warnings} />
      <p>{preview.references.length} referencias conservadas en esta versión.</p>
      {canWrite && preview.canRestore && preview.revision !== current && <button type="button" className="btn btn-primary" disabled={disabled || loading} onClick={async () => { await restore(preview.revision); chosenRevision.current = undefined; setPreview(undefined); }}>Recuperar como nueva versión</button>}
    </article>}
    <ol className="writing-history-list">{ready && history?.revisions.map(item => <li key={item.revision} data-testid="writing-history-entry">
      {!item.available ? <p>Versión {item.revision} no disponible.</p> : <button type="button" disabled={loading || disabled} aria-pressed={preview?.revision === item.revision} onClick={() => void open(item.revision)}>
        Versión {item.revision}{item.revision === current ? " · actual" : ""}
        <time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time>
        <span>{changeLabel[item.change]}{item.restoredFrom ? " desde la versión " + item.restoredFrom : ""}</span>
        <span className="writing-history-action">{preview?.revision === item.revision ? "Versión abierta" : "Ver versión"}<FileText size={16} aria-hidden="true" /></span>
      </button>}
    </li>)}</ol>
    {!ready && !error && <p role="status">Comprobando el historial y sus fuentes…</p>}
    {ready && history?.nextBefore && <button type="button" className="writing-text-link" disabled={loading} onClick={() => { chosenRevision.current = undefined; setBefore(history.nextBefore!); setPreview(undefined); }}>Ver versiones anteriores</button>}
    {before && <button type="button" className="writing-text-link" onClick={() => { chosenRevision.current = undefined; setBefore(undefined); setPreview(undefined); }}>Volver a las recientes</button>}
  </div>;
}
