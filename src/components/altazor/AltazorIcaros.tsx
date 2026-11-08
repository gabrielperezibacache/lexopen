"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Feather, Plus, RefreshCw } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import type { IcaroDestination, IcaroJobView, IcaroMemoryView, IcaroView } from "@/lib/altazor/icaros/types";
import { AltazorMessageContent } from "./AltazorMessageContent";
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
  return <>
    <label>Nombre del Ícaro<input name="name" required maxLength={80} defaultValue={profile?.name || ""} placeholder="Por ejemplo: Revisión de citas" /></label>
    <label>Instrucciones del Ícaro<textarea name="instructions" rows={4} maxLength={4000} defaultValue={profile?.instructions || ""} placeholder="Su especialidad, criterios y formato de respuesta." /></label>
    <label>Proveedor del Ícaro<select aria-label="Proveedor del Ícaro" name="provider" defaultValue={profile?.provider || "inherit"}><option value="inherit">Heredar mi configuración de IA</option><option value="study">Proveedor del estudio</option><option value="codex">Mi Codex personal</option></select></label>
    <label>Modelo específico<input name="model" maxLength={160} defaultValue={profile?.model || ""} placeholder="Vacío para heredar el modelo" /></label>
    <p className="altazor-panel-note">El modelo debe estar disponible en el proveedor elegido. La política del estudio y tus permisos se aplican siempre.</p>
    <label className="altazor-check"><input name="memoryEnabled" type="checkbox" defaultChecked={profile?.memoryEnabled ?? false} />Permitir memoria propia de este Ícaro</label>
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
  return <section className="altazor-task-panel" data-testid="altazor-icaros" aria-label="Ícaros de Altazor">
    <header className="altazor-panel-heading"><div><h2><Feather size={22} aria-hidden="true" />Ícaros</h2><p>Asistentes con una especialidad, un modelo y una memoria propia. Tú eliges qué encargarles y qué pueden recordar.</p></div><button type="button" className="btn btn-ghost" onClick={() => { setError(""); void reload().catch(reason => setError(reason.message)); }}><RefreshCw size={16} />Actualizar Ícaros</button></header>
    <p className="altazor-panel-note">{causaId ? "Estos Ícaros pertenecen a esta causa." : "Estos Ícaros pertenecen a tu espacio personal."} Sus memorias no se comparten con otros usuarios ni entre perfiles.</p>
    {error && <p role="alert" className="altazor-error">{error}</p>}
    {!catalog && !error && <p role="status">Consultando tus Ícaros…</p>}
    {selected ? <><button type="button" className="btn btn-ghost" onClick={() => setSelected("")}><ArrowLeft size={16} />Todos mis Ícaros</button><IcaroDetail key={selected} id={selected} active={active} onSaved={reload} /></> : <>
      {catalog?.icaros.length ? <ul className="altazor-profile-list">{catalog.icaros.map(icaro => <li key={icaro.id}><button type="button" className="altazor-profile-card" onClick={() => setSelected(icaro.id)}><strong>{icaro.name}</strong><span>{icaro.destination.model || "Modelo por configurar"} · {icaro.memoryEnabled ? "Memoria propia habilitada" : "Sin memoria"}</span><small>{icaro.enabled ? icaro.destination.permitted ? "Disponible" : "Revisa su proveedor" : "Desactivado"}</small></button></li>)}</ul> : catalog && <p className="altazor-panel-empty">Crea tu primer Ícaro y define su especialidad.</p>}
      {!creating && <button type="button" className="btn btn-primary" disabled={!catalog || Boolean(catalog && catalog.icaros.length >= catalog.limits.profiles)} onClick={() => setCreating(true)}><Plus size={16} />Crear Ícaro</button>}
      {creating && <form className="altazor-panel-form" onSubmit={create}><fieldset disabled={busy}><legend>Nuevo Ícaro</legend><ProfileFields /><div className="altazor-panel-actions"><button className="btn btn-primary" type="submit">{busy ? "Creando…" : "Guardar Ícaro"}</button><button className="btn btn-ghost" type="button" onClick={() => setCreating(false)}>Cancelar</button></div></fieldset></form>}
    </>}
  </section>;
}

const jobLabels: Record<string, string> = { queued: "En cola", running: "Trabajando", completed: "Completado", failed: "No completado", cancelled: "Detenido", blocked: "Acceso no disponible", interrupted: "Interrumpido" };
function IcaroDetail({ id, active, onSaved }: { id: string; active: boolean; onSaved: () => Promise<void> }) {
  const [detail, setDetail] = useState<Detail | null>(null), [busy, setBusy] = useState(false), [executing, setExecuting] = useState(""), [error, setError] = useState("");
  const [instruction, setInstruction] = useState(""), [text, setText] = useState(""), [useMemory, setUseMemory] = useState(false), [allowRemote, setAllowRemote] = useState(false), [sources, setSources] = useState<AltazorSelectedSource[]>([]);
  const [consentDestination, setConsentDestination] = useState("");
  const [memoryJob, setMemoryJob] = useState<IcaroJobView | null>(null);
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
    const payload = { instruction, text, sources: sources.map(source => source.input), useMemory: useMemory && detail.icaro.memoryEnabled, allowRemote: allowRemote && consentDestination === detail.icaro.destination.key, destinationKey: detail.icaro.destination.key, confirmed: true };
    try {
      const result = await change<{ job: IcaroJobView }>(`${url}/jobs`, { ...payload, requestId: jobKeys.current.forPayload(payload) });
      jobKeys.current.complete(payload); setInstruction(""); setText(""); setSources([]); setAllowRemote(false); await reload(); setBusy(false);
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
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form); setBusy(true); setError("");
    const payload = { label: String(fields.get("label") || ""), ...(memoryJob ? { jobId: memoryJob.id } : { body: String(fields.get("body") || "") }), confirmed: true };
    try { await change(`${url}/memory`, { ...payload, requestId: memoryKeys.current.forPayload(payload) }); memoryKeys.current.complete(payload); setMemoryJob(null); form.reset(); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la memoria."); }
    finally { setBusy(false); }
  }
  async function forget(memory: IcaroMemoryView) {
    setBusy(true); setError("");
    try { await change(`${url}/memory/${encodeURIComponent(memory.id)}`, { expectedRevision: memory.revision, confirmed: true }, "DELETE"); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo olvidar este recuerdo."); }
    finally { setBusy(false); }
  }
  if (!detail) return <p role={error ? "alert" : "status"}>{error || "Abriendo Ícaro…"}</p>;
  const { icaro, jobs, memory } = detail;
  return <div className="altazor-icaro-detail" data-testid="altazor-icaro-detail">
    <header className="altazor-panel-heading"><div><h3>{icaro.name}</h3><p>{icaro.destination.provider} · {icaro.destination.model || "Modelo sin configurar"}</p></div><button type="button" className="btn btn-ghost" disabled={busy || Boolean(executing)} onClick={toggle}>{icaro.enabled ? "Desactivar Ícaro" : "Activar Ícaro"}</button></header>
    {error && <p role="alert" className="altazor-error">{error}</p>}
    <details className="altazor-panel-disclosure"><summary>Perfil, modelo y memoria del Ícaro</summary><form key={icaro.revision} className="altazor-panel-form" onSubmit={save}><fieldset disabled={busy || Boolean(executing)}><ProfileFields profile={icaro} /><button type="submit" className="btn btn-primary">Guardar perfil</button></fieldset></form></details>
    {!icaro.destination.permitted && <p className="altazor-notice">El proveedor o modelo no está disponible según tu configuración. Revisa el perfil antes de encargarle trabajo.</p>}
    <form className="altazor-panel-form" onSubmit={submitJob}><fieldset disabled={busy || Boolean(executing) || !icaro.enabled || !icaro.destination.permitted}><legend>Nuevo encargo para {icaro.name}</legend><label>Instrucción del encargo<textarea value={instruction} onChange={event => setInstruction(event.target.value)} required maxLength={6000} rows={3} /></label><label>Texto para este encargo<textarea value={text} onChange={event => setText(event.target.value)} maxLength={10000} rows={4} /></label><details className="altazor-panel-disclosure"><summary>Elegir fuentes · {sources.length}</summary><AltazorSources causaId={icaro.causaId} selected={sources} onChange={setSources} /></details><label className="altazor-check"><input type="checkbox" checked={useMemory && icaro.memoryEnabled} disabled={!icaro.memoryEnabled} onChange={event => setUseMemory(event.target.checked)} />Usar la memoria propia de este Ícaro en el encargo</label>{icaro.destination.remote && <label className="altazor-check"><input type="checkbox" checked={allowRemote && consentDestination === icaro.destination.key} onChange={event => { setConsentDestination(icaro.destination.key); setAllowRemote(event.target.checked); }} />Autorizar el envío del encargo, el texto y las fuentes elegidas a {icaro.destination.provider} · {icaro.destination.model}</label>}<button type="submit" className="btn btn-primary" disabled={!instruction.trim() || icaro.destination.remote && !(allowRemote && consentDestination === icaro.destination.key)}>Encargar a este Ícaro</button></fieldset></form>
    <section className="altazor-panel-jobs" aria-label="Trabajos de este Ícaro"><h3>Encargos</h3>{jobs.length ? jobs.map(job => <article key={job.id} className="altazor-panel-job"><header><strong>{jobLabels[job.status] || "Estado por consultar"}</strong><time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString("es-CL")}</time></header><AltazorMessageContent text={job.instruction} plain />{job.status === "running" && <p role="status">El Ícaro está preparando el resultado.</p>}{job.available && job.result && <AltazorMessageContent text={job.result} />}{!job.available && <p>El resultado ya no está disponible por un cambio en sus fuentes o permisos.</p>}<div className="altazor-panel-actions">{job.status === "queued" && <button className="btn btn-secondary" type="button" disabled={busy || Boolean(executing)} onClick={() => void execute(job)}>Ejecutar encargo</button>}{["queued", "running"].includes(job.status) && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void stop(job)}>Detener encargo</button>}{job.available && job.status === "completed" && job.result && <button className="btn btn-ghost" type="button" disabled={busy || !icaro.memoryEnabled} onClick={() => setMemoryJob(job)}>Conservar un extracto en memoria</button>}</div></article>) : <p className="altazor-panel-note">Todavía no hay encargos para este Ícaro.</p>}</section>
    <section className="altazor-panel-memory" aria-label="Memoria de este Ícaro"><h3>Memoria propia</h3>{!icaro.memoryEnabled && <p className="altazor-panel-note">Activa la memoria en «Perfil, modelo y memoria del Ícaro» para conservar recuerdos nuevos.</p>}<p className="altazor-panel-note">Sólo se conserva lo que confirmas aquí. Desactivar su uso no elimina los recuerdos guardados.</p>{memory.map(item => <article key={item.id}><strong>{item.label}</strong><AltazorMessageContent text={item.available ? item.body : "Recuerdo no disponible por cambios en sus fuentes."} plain /><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void forget(item)}>Olvidar este recuerdo</button></article>)}<details className="altazor-panel-disclosure" open={memoryJob ? true : undefined}><summary>{memoryJob ? "Confirmar el recuerdo del resultado" : "Añadir un recuerdo"}</summary><form key={memoryJob?.id || "manual"} className="altazor-panel-form" onSubmit={saveMemory}><fieldset disabled={busy || !icaro.memoryEnabled}><label>Nombre del recuerdo<input name="label" required maxLength={120} defaultValue={memoryJob?.instruction.slice(0, 120) || ""} /></label>{memoryJob ? <p>Se guardará un extracto de hasta 2.000 caracteres del resultado, con sus fuentes verificadas.</p> : <label>Contenido del recuerdo<textarea name="body" required rows={3} maxLength={2000} /></label>}<div className="altazor-panel-actions"><button type="submit" className="btn btn-primary">Confirmar y guardar recuerdo</button>{memoryJob && <button className="btn btn-ghost" type="button" onClick={() => setMemoryJob(null)}>Cancelar recuerdo</button>}</div></fieldset></form></details></section>
  </div>;
}
