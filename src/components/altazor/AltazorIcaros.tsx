"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Feather, Plus, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import type { IcaroDestination, IcaroJobView, IcaroMemoryRef, IcaroMemoryView, IcaroView } from "@/lib/altazor/icaros/types";
import { AltazorMessageContent } from "./AltazorMessageContent";
import { IcaroMemoryChoices } from "./IcaroMemoryChoices";
import { AltazorSources, type AltazorSelectedSource } from "./AltazorSources";
import "./AltazorTaskPanels.css";

const base = "/api/altazor/icaros";
type Catalog = { icaros: IcaroView[]; destinations: { study: IcaroDestination; codex: IcaroDestination }; limits: { profiles: number } };
type Detail = { icaro: IcaroView; jobs: IcaroJobView[]; memory: IcaroMemoryView[] };
async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw Object.assign(Error(value.error || "No se pudo consultar este Ícaro."), { status: response.status });
  return value;
}
async function change<T>(url: string, data: unknown, method = "POST"): Promise<T> {
  const result = await apiMutation<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  if (!result.ok) throw Error(result.error);
  return result.data;
}
function ProfileFields({ profile }: { profile?: IcaroView }) {
  const en = useI18n().locale === "en";
  return <>
    <label>{en ? "Ícaro name" : "Nombre del Ícaro"}<input name="name" required maxLength={80} defaultValue={profile?.name || ""} placeholder={en ? "For example, citation review" : "Por ejemplo, revisión de citas"} /></label>
    <label>{en ? "Ícaro instructions" : "Instrucciones del Ícaro"}<textarea name="instructions" rows={4} maxLength={4000} defaultValue={profile?.instructions || ""} placeholder={en ? "Specialty, criteria and response format." : "Su especialidad, criterios y formato de respuesta."} /></label>
    <label>{en ? "Ícaro provider" : "Proveedor del Ícaro"}<select aria-label={en ? "Ícaro provider" : "Proveedor del Ícaro"} name="provider" defaultValue={profile?.provider || "inherit"}><option value="inherit">{en ? "Use my AI settings" : "Heredar mi configuración de IA"}</option><option value="study">{en ? "Firm provider" : "Proveedor del estudio"}</option><option value="codex">{en ? "My Codex account" : "Mi Codex personal"}</option></select></label>
    <label>{en ? "Specific model" : "Modelo específico"}<input name="model" maxLength={160} defaultValue={profile?.model || ""} placeholder={en ? "Leave blank to inherit the model" : "Vacío para heredar el modelo"} /></label>
    <p className="altazor-panel-note">{en ? "Choose a model available from the selected provider. Firm policy and your permissions apply." : "El modelo debe estar disponible en el proveedor elegido. La política del estudio y tus permisos se aplican siempre."}</p>
    <label className="altazor-check"><input name="memoryEnabled" type="checkbox" defaultChecked={profile?.memoryEnabled ?? false} />{en ? "Enable private memory for this Ícaro" : "Permitir memoria propia de este Ícaro"}</label>
  </>;
}
function profileValues(form: HTMLFormElement) {
  const fields = new FormData(form);
  return { name: String(fields.get("name") || ""), instructions: String(fields.get("instructions") || ""), provider: String(fields.get("provider") || "inherit"), model: String(fields.get("model") || ""), memoryEnabled: fields.get("memoryEnabled") === "on" };
}
export function AltazorIcaros({ causaId, active = true }: { causaId?: string | null; active?: boolean }) {
  return <IcarosPanel key={causaId || "personal"} causaId={causaId} active={active} />;
}
function IcarosPanel({ causaId, active }: { causaId?: string | null; active: boolean }) {
  const en = useI18n().locale === "en";
  const [catalog, setCatalog] = useState<Catalog | null>(null), [selected, setSelected] = useState(""), [creating, setCreating] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const keys = useRef(createSubmissionKeys());
  const query = causaId ? `?${new URLSearchParams({ causaId })}` : "";
  const reload = useCallback(async (signal?: AbortSignal) => { const result = await read<Catalog>(base + query, signal); if (!signal?.aborted) setCatalog(result); }, [query]);
  useEffect(() => {
    if (!active) return;
    const control = new AbortController();
    queueMicrotask(() => { if (!control.signal.aborted) void reload(control.signal).catch(reason => { if (!control.signal.aborted) { if ([403, 404].includes(reason.status)) setCatalog(null); setError(reason.message); } }); });
    return () => control.abort();
  }, [active, reload]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const payload = { ...profileValues(event.currentTarget), causaId: causaId || null, confirmed: true };
    try {
      const result = await change<{ icaro: IcaroView }>(base, { ...payload, requestId: keys.current.forPayload(payload) });
      keys.current.complete(payload); setCreating(false); await reload(); setSelected(result.icaro.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo crear el Ícaro. Tus instrucciones se conservan."); }
    finally { setBusy(false); }
  }
  return <section className="altazor-task-panel" data-testid="altazor-icaros" aria-label={en ? "Altazor’s Ícaros" : "Ícaros de Altazor"}>
    <header className="altazor-panel-heading"><div><h2><Feather size={22} aria-hidden="true" />Ícaros</h2><p>{causaId ? (en ? "Case specialists" : "Especialistas de esta causa") : (en ? "Personal specialists" : "Especialistas de tu espacio personal")}</p></div><button type="button" className="btn btn-ghost" onClick={() => { setError(""); void reload().catch(reason => setError(reason.message)); }}><RefreshCw size={16} />{en ? "Refresh Ícaros" : "Actualizar Ícaros"}</button></header>
    {error && <p role="alert" className="altazor-error">{error}</p>}
    {!catalog && !error && <p role="status">{en ? "Loading your Ícaros…" : "Consultando tus Ícaros…"}</p>}
    {selected ? <><button type="button" className="btn btn-ghost" onClick={() => setSelected("")}><ArrowLeft size={16} />{en ? "All my Ícaros" : "Todos mis Ícaros"}</button><IcaroDetail key={selected} id={selected} active={active} onSaved={reload} /></> : <>
      {catalog?.icaros.length ? <ul className="altazor-profile-list">{catalog.icaros.map(icaro => <li key={icaro.id}><button type="button" className="altazor-profile-card" onClick={() => setSelected(icaro.id)}><strong>{icaro.name}</strong><span>{icaro.destination.model || (en ? "No model configured" : "Modelo por configurar")} · {icaro.memoryEnabled ? (en ? "Private memory enabled" : "Memoria propia habilitada") : (en ? "No memory" : "Sin memoria")}</span><small>{icaro.enabled ? icaro.destination.permitted ? (en ? "Available" : "Disponible") : (en ? "Check provider" : "Revisa su proveedor") : (en ? "Disabled" : "Desactivado")}</small></button></li>)}</ul> : catalog && <p className="altazor-panel-empty">{en ? "Create your first Ícaro and choose its specialty." : "Crea tu primer Ícaro y define su especialidad."}</p>}
      {!creating && <button type="button" className="btn btn-primary" disabled={!catalog || Boolean(catalog && catalog.icaros.length >= catalog.limits.profiles)} onClick={() => setCreating(true)}><Plus size={16} />{en ? "Create Ícaro" : "Crear Ícaro"}</button>}
      {creating && <form className="altazor-panel-form" onSubmit={create}><fieldset disabled={busy}><legend>{en ? "New Ícaro" : "Nuevo Ícaro"}</legend><ProfileFields /><div className="altazor-panel-actions"><button className="btn btn-primary" type="submit">{busy ? (en ? "Creating…" : "Creando…") : (en ? "Save Ícaro" : "Guardar Ícaro")}</button><button className="btn btn-ghost" type="button" onClick={() => setCreating(false)}>{en ? "Cancel" : "Cancelar"}</button></div></fieldset></form>}
    </>}
  </section>;
}

function IcaroRecord({ summary, children, job = false }: { summary: ReactNode; children: ReactNode; job?: boolean }) {
  const [open, setOpen] = useState(false);
  return <details className={job ? "altazor-panel-job" : undefined} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className={job ? "altazor-job-summary" : undefined}>{summary}</summary>
    {open && children}
  </details>;
}

const spanishJobStatus: Record<string, string> = { queued: "En cola", running: "Trabajando", completed: "Completado", failed: "No completado", cancelled: "Detenido", blocked: "Acceso no disponible", interrupted: "Interrumpido" };
const englishJobStatus: Record<string, string> = { queued: "Queued", running: "Working", completed: "Completed", failed: "Failed", cancelled: "Stopped", blocked: "Access unavailable", interrupted: "Interrupted" };
function IcaroDetail({ id, active, onSaved }: { id: string; active: boolean; onSaved: () => Promise<void> }) {
  const en = useI18n().locale === "en";
  const [visibleCount, setVisibleCount] = useState(5);
  const [supportOpened, setSupportOpened] = useState(false);
  const jobHistory = useRef<HTMLElement>(null);
  const memoryDetails = useRef<HTMLDetailsElement>(null);
  const memoryEditor = useRef<HTMLDetailsElement>(null);
  const memoryName = useRef<HTMLInputElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null), [busy, setBusy] = useState(false), [executing, setExecuting] = useState(""), [error, setError] = useState("");
  const [instruction, setInstruction] = useState(""), [text, setText] = useState(""), [memorySelection, setMemorySelection] = useState<IcaroMemoryRef[]>([]), [allowRemote, setAllowRemote] = useState(false), [sources, setSources] = useState<AltazorSelectedSource[]>([]);
  const [consentDestination, setConsentDestination] = useState("");
  const [memoryJobId, setMemoryJobId] = useState<string | null>(null);
  const memoryJob = detail?.jobs.find(job => job.id === memoryJobId && job.available && job.status === "completed");
  const jobKeys = useRef(createSubmissionKeys()), memoryKeys = useRef(createSubmissionKeys());
  const url = `${base}/${encodeURIComponent(id)}`;
  const reload = useCallback(async (signal?: AbortSignal) => { const result = await read<Detail>(url, signal); if (!signal?.aborted) setDetail(result); }, [url]);
  useEffect(() => {
    if (!active) return;
    const control = new AbortController();
    const refresh = () => void reload(control.signal).catch(reason => { if (!control.signal.aborted) { if ([403, 404].includes(reason.status)) setDetail(null); setError(reason.message); } });
    queueMicrotask(refresh); const timer = window.setInterval(refresh, 6000);
    return () => { control.abort(); window.clearInterval(timer); };
  }, [active, reload]);
  function reviewExtract(job: IcaroJobView) {
    setMemoryJobId(job.id);
    if (memoryDetails.current) memoryDetails.current.open = true;
    if (memoryEditor.current) memoryEditor.current.open = true;
    requestAnimationFrame(() => memoryName.current?.focus());
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return; setBusy(true); setError("");
    try { await change(url, { ...profileValues(event.currentTarget), expectedRevision: detail.icaro.revision, confirmed: true }, "PATCH"); await reload(); await onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo actualizar el perfil."); }
    finally { setBusy(false); }
  }
  async function execute(job: IcaroJobView) {
    setExecuting(job.id); setError("");
    try { await change(`${base}/jobs/${encodeURIComponent(job.id)}/execute`, {}); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo confirmar el resultado. Consulta el estado antes de repetir."); await reload().catch(() => {}); }
    finally { setExecuting(previous => previous === job.id ? "" : previous); }
  }
  async function submitJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return; setBusy(true); setError("");
    const payload = { instruction, text, sources: sources.map(source => source.input), memorySelection, useMemory: memorySelection.length > 0, allowRemote: allowRemote && consentDestination === detail.icaro.destination.key, destinationKey: detail.icaro.destination.key, confirmed: true };
    try {
      const result = await change<{ job: IcaroJobView }>(`${url}/jobs`, { ...payload, requestId: jobKeys.current.forPayload(payload) });
      jobKeys.current.complete(payload); setInstruction(""); setText(""); setSources([]); setMemorySelection([]); setAllowRemote(false); await reload(); setBusy(false);
      if (result.job.status === "queued") await execute(result.job);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "El encargo no se pudo registrar. Tu texto se conserva."); }
    finally { setBusy(false); }
  }
  async function stop(job: IcaroJobView) {
    setBusy(true); setError("");
    try { await change(`${base}/jobs/${encodeURIComponent(job.id)}/cancel`, {}); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se confirmó la cancelación."); }
    finally { setBusy(false); }
  }
  async function toggle() {
    if (!detail) return; setBusy(true); setError("");
    try { await change(url, { expectedRevision: detail.icaro.revision, enabled: !detail.icaro.enabled, confirmed: true }, "PATCH"); await reload(); await onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo actualizar el Ícaro."); }
    finally { setBusy(false); }
  }
  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (memoryJobId && !memoryJob) return;
    const form = event.currentTarget, fields = new FormData(form); setBusy(true); setError("");
    const payload = { label: String(fields.get("label") || ""), ...(memoryJob ? { jobId: memoryJob.id } : { body: String(fields.get("body") || "") }), confirmed: true };
    try { await change(`${url}/memory`, { ...payload, requestId: memoryKeys.current.forPayload(payload) }); memoryKeys.current.complete(payload); setMemoryJobId(null); form.reset(); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la memoria."); }
    finally { setBusy(false); }
  }
  async function forget(memory: IcaroMemoryView) {
    setBusy(true); setError("");
    try { await change(`${url}/memory/${encodeURIComponent(memory.id)}`, { expectedRevision: memory.revision, confirmed: true }, "DELETE"); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo olvidar este recuerdo."); }
    finally { setBusy(false); }
  }
  if (!detail) return <p role={error ? "alert" : "status"}>{error || (en ? "Opening Ícaro…" : "Abriendo Ícaro…")}</p>;
  const { icaro, jobs, memory } = detail;
  const staleMemory = memorySelection.some(ref => !icaro.memoryEnabled || !memory.some(item => item.available && item.id === ref.id && item.hash === ref.hash && item.revision === ref.revision));
  const visibleJobs = jobs.filter((job, index) => index < visibleCount || job.status === "queued" || job.status === "running");
  const jobLabels = en ? englishJobStatus : spanishJobStatus;
  function showMoreJobs() {
    const next = jobs.findIndex((job, index) => index >= visibleCount && job.status !== "queued" && job.status !== "running");
    if (next < 0) return;
    setVisibleCount(next + 5);
    requestAnimationFrame(() => jobHistory.current?.querySelectorAll<HTMLElement>(".altazor-job-summary")[next]?.focus());
  }
  return <div className="altazor-icaro-detail" data-testid="altazor-icaro-detail">
    <header className="altazor-panel-heading"><div><h3>{icaro.name}</h3><p>{icaro.destination.provider} · {icaro.destination.model || (en ? "No model configured" : "Modelo sin configurar")}</p></div></header>
    {error && <p role="alert" className="altazor-error">{error}</p>}
    {!icaro.destination.permitted && <p className="altazor-notice">{en ? "Check the provider and model in the profile before assigning work." : "Revisa el proveedor y modelo del perfil antes de crear un encargo."}</p>}
    {!icaro.enabled && <p className="altazor-notice">{en ? "This Ícaro is disabled. You can enable it in its profile." : "Este Ícaro está desactivado. Puedes activarlo en su perfil."}</p>}
    <form className="altazor-panel-form" onSubmit={submitJob}>
      <fieldset disabled={busy || Boolean(executing) || !icaro.enabled || !icaro.destination.permitted}>
        <legend>{en ? "New assignment" : "Nuevo encargo"}</legend>
        <label>{en ? "Assignment objective" : "Objetivo del encargo"}<textarea value={instruction} onChange={event => setInstruction(event.target.value)} required maxLength={6000} rows={3} /></label>
        <details className="altazor-panel-disclosure" onToggle={event => { if (event.currentTarget.open) setSupportOpened(true); }}><summary>{en ? "Supporting text and sources" : "Texto de apoyo y fuentes"}{sources.length > 0 && ` · ${sources.length}`}</summary>
          <label>{en ? "Text for this assignment" : "Texto para este encargo"}<textarea value={text} onChange={event => setText(event.target.value)} maxLength={10000} rows={4} /></label>
          {supportOpened && <AltazorSources causaId={icaro.causaId} selected={sources} onChange={setSources} />}
        </details>
        {(icaro.memoryEnabled || memorySelection.length > 0) && <details className="altazor-panel-disclosure">
          <summary>{en ? "Choose memories" : "Elegir recuerdos"} · {memorySelection.length}</summary>
          <IcaroMemoryChoices memory={icaro.memoryEnabled ? memory : []} selection={memorySelection} onChange={setMemorySelection} />
        </details>}
        {staleMemory && <p role="alert">{en ? "Review the selected memories before sending." : "Revisa los recuerdos elegidos antes de enviar."}</p>}
        {icaro.destination.remote && <label className="altazor-check"><input type="checkbox" checked={allowRemote && consentDestination === icaro.destination.key} onChange={event => {
          setConsentDestination(icaro.destination.key); setAllowRemote(event.target.checked);
        }} />{en ? "Authorize sending this assignment, text, sources and selected memories to" : "Autorizar el envío del encargo, el texto, las fuentes y los recuerdos elegidos a"} {icaro.destination.provider} · {icaro.destination.model}</label>}
        <button type="submit" className="btn btn-primary" disabled={!instruction.trim() || staleMemory || icaro.destination.remote && !(allowRemote && consentDestination === icaro.destination.key)}>
          {en ? "Assign to this Ícaro" : "Encargar a este Ícaro"}
        </button>
      </fieldset>
    </form>
    <section ref={jobHistory} className="altazor-panel-jobs" aria-label={en ? "Assignments for this Ícaro" : "Trabajos de este Ícaro"}>
      <h3>{en ? "Recent assignments" : "Encargos recientes"}</h3>
      {visibleJobs.map(job => <IcaroRecord key={job.id} job summary={<>
          <strong>{job.instruction.length > 100 ? job.instruction.slice(0, 99) + "…" : job.instruction || (en ? "Assignment unavailable" : "Encargo no disponible")}</strong>
          <span>{jobLabels[job.status] || (en ? "Status unavailable" : "Estado por consultar")} · <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString(en ? "en" : "es-CL")}</time></span>
        </>}>
        {job.instruction.length > 100 && <AltazorMessageContent text={job.instruction} plain />}
        {job.available && job.result && <AltazorMessageContent text={job.result} />}
        {job.available && !job.result && ["failed", "interrupted", "cancelled"].includes(job.status) && <p>{en ? "This assignment ended without a result." : "El encargo terminó sin un resultado."}</p>}
        {!job.available && <p>{en ? "The sources or permissions for this result have changed." : "El resultado ya no está disponible por un cambio en sus fuentes o permisos."}</p>}
        <div className="altazor-panel-actions">
          {job.status === "queued" && <button className="btn btn-secondary" type="button" disabled={busy || Boolean(executing)} onClick={() => void execute(job)}>{en ? "Run assignment" : "Ejecutar encargo"}</button>}
          {["queued", "running"].includes(job.status) && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void stop(job)}>{en ? "Stop assignment" : "Detener encargo"}</button>}
          {job.available && job.status === "completed" && job.result && icaro.memoryEnabled && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => reviewExtract(job)}>{en ? "Save an excerpt to memory" : "Conservar un extracto en memoria"}</button>}
        </div>
      </IcaroRecord>)}
      {!jobs.length && <p className="altazor-panel-note">{en ? "No assignments yet." : "Todavía no hay encargos."}</p>}
      {visibleJobs.length < jobs.length && <button type="button" className="btn btn-ghost" onClick={showMoreJobs}>{en ? "Show more assignments" : "Ver más encargos"}</button>}
    </section>
    <section aria-label={en ? "Memory for this Ícaro" : "Memoria de este Ícaro"}>
      <details ref={memoryDetails} className="altazor-panel-disclosure"><summary>{en ? "Saved memories" : "Recuerdos guardados"} · {memory.length}</summary>
        {memory.length === 0 && icaro.memoryEnabled && <p>{en ? "No memories saved for this Ícaro yet." : "Este Ícaro aún no tiene recuerdos guardados."}</p>}
        {memory.map(item => <IcaroRecord key={item.id} summary={item.label}>
          <AltazorMessageContent text={item.available ? item.body : (en ? "The sources for this memory have changed." : "Recuerdo no disponible por cambios en sus fuentes.")} plain />
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void forget(item)}>{en ? "Forget this memory" : "Olvidar este recuerdo"}</button>
        </IcaroRecord>)}
        {!icaro.memoryEnabled && <p>{en ? "Enable memory in the profile to save new entries." : "Activa la memoria en el perfil para guardar recuerdos nuevos."}</p>}
        {icaro.memoryEnabled && <details ref={memoryEditor} className="altazor-panel-disclosure"><summary>{memoryJobId ? (en ? "Review excerpt" : "Revisar extracto") : (en ? "Add a memory" : "Añadir un recuerdo")}</summary>
          <form key={memoryJobId || "manual"} className="altazor-panel-form" onSubmit={saveMemory}><fieldset disabled={busy}>
            <label>{en ? "Memory name" : "Nombre del recuerdo"}<input ref={memoryName} name="label" required maxLength={120} defaultValue={memoryJob?.instruction.slice(0, 120) || ""} /></label>
            {memoryJob ? <><p>{en ? "Excerpt to save with its verified sources" : "Extracto que se guardará con sus fuentes verificadas"}</p><AltazorMessageContent text={memoryJob.result.slice(0, 2000)} plain /></> : memoryJobId ? <p role="alert">{en ? "This result is no longer available." : "El resultado ya no está disponible."}</p> : <label>{en ? "Memory text" : "Contenido del recuerdo"}<textarea name="body" required maxLength={2000} rows={3} /></label>}
            <div className="altazor-panel-actions"><button type="submit" className="btn btn-primary" disabled={Boolean(memoryJobId && !memoryJob)}>{en ? "Confirm and save memory" : "Confirmar y guardar recuerdo"}</button>
              {memoryJobId && <button type="button" className="btn btn-ghost" onClick={() => setMemoryJobId(null)}>{en ? "Cancel excerpt" : "Cancelar recuerdo"}</button>}
            </div>
          </fieldset></form>
        </details>}
      </details>
    </section>
    <details className="altazor-panel-disclosure"><summary>{en ? "Profile, model and memory settings" : "Perfil, modelo y memoria del Ícaro"}</summary>
      <form key={icaro.revision} className="altazor-panel-form" onSubmit={save}><fieldset disabled={busy || Boolean(executing)}>
        <ProfileFields profile={icaro} /><button type="submit" className="btn btn-primary">{en ? "Save profile" : "Guardar perfil"}</button>
      </fieldset></form>
      <button type="button" className="btn btn-ghost" disabled={busy || Boolean(executing)} onClick={toggle}>
        {icaro.enabled ? (en ? "Disable Ícaro" : "Desactivar Ícaro") : (en ? "Enable Ícaro" : "Activar Ícaro")}
      </button>
    </details>
  </div>;
}
