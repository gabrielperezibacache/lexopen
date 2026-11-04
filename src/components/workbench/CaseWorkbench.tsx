"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileCheck2, Play, RefreshCw, Square } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { newUiId } from "@/lib/ui-id";
import type { WorkbenchRunView } from "@/lib/workbench/service";
import type { WorkbenchDestination } from "@/lib/workbench/policy";
import type { WorkbenchMode } from "@/lib/workbench/schemas";
import type { workbenchSourceCatalog } from "@/lib/workbench/sources";
import "./CaseWorkbench.css";
type Catalog = Awaited<ReturnType<typeof workbenchSourceCatalog>>;
type Source = Catalog["sources"][number];
type Capabilities = { runtime: { available: boolean; reason: string }; destinations: Record<WorkbenchMode, WorkbenchDestination>; canWrite: boolean; setupHref: string };
type RunList = { runs: ({ id: string; available: false } | { id: string; available: true; objective: string; status: string; createdAt: string })[]; limited: boolean };
const labels: Record<string, string> = { queued: "Preparado", running: "En ejecución", awaiting_review: "Listo para revisar", imported: "Incorporado al escrito", cancelled: "Cancelado", interrupted: "Interrumpido", failed: "No completado", blocked: "Requiere revisar las fuentes" };
const providerNames: Record<string, string> = { local_recipe: "Cuaderno local sin IA", codex: "Codex personal", openai: "OpenAI", ollama: "Ollama", azure: "Azure OpenAI", groq: "Groq", hermes: "Hermes", custom: "Proveedor del estudio" };
const providerLabel = (value: string) => providerNames[value] || "Proveedor configurado";
const dateLabel = (date: string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
async function get<T>(url: string): Promise<T> { const response = await fetch(url, { cache: "no-store" }), data = await response.json(); if (!response.ok) throw Error(data.error || "No se pudo abrir la Mesa"); return data; }
async function post<T>(url: string, body: unknown): Promise<T> { const result = await apiMutation<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!result.ok) throw Error(result.error); return result.data; }

export function CaseWorkbench({ causaId }: { causaId: string }) {
  const base = `/api/causas/${causaId}/workbench`;
  const [capabilities, setCapabilities] = useState<Capabilities>(), [catalog, setCatalog] = useState<Catalog>(), [history, setHistory] = useState<RunList>();
  const [selection, setSelection] = useState<Source[]>([]), [objective, setObjective] = useState(""), [mode, setMode] = useState<WorkbenchMode>("source_packet"), [remoteConsent, setRemoteConsent] = useState("");
  const [run, setRun] = useState<WorkbenchRunView>(), [activeId, setActiveId] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const request = useRef<{ signature: string; id: string } | null>(null), currentRun = useRef("");
  const destination = capabilities?.destinations[mode];
  const activeStatus = run?.status;
  const consentKey = JSON.stringify([destination?.key, objective.trim(), selection.map(source => [source.fragmentId, source.versionId, source.quote])]);
  const allowRemote = remoteConsent === consentKey;
  const refreshHistory = useCallback(() => get<RunList>(base).then(setHistory), [base]);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { const [caps, sources] = await Promise.all([get<Capabilities>(base + "/capabilities"), get<Catalog>(base + "/sources"), refreshHistory()]); setCapabilities(caps); setCatalog(sources); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, [base, refreshHistory]);
  useEffect(() => { const timer = setTimeout(() => { void refresh(); }, 0); return () => clearTimeout(timer); }, [refresh]);
  useEffect(() => {
    if (!activeId) return;
    let stopped = false, pending = false;
    currentRun.current = activeId;
    const load = async () => {
      if (pending) return; pending = true;
      try { const next = await get<WorkbenchRunView>(`${base}/${activeId}`); if (!stopped && currentRun.current === activeId) setRun(next); }
      catch (reason) { if (!stopped) { setRun(undefined); setError((reason as Error).message); } }
      finally { pending = false; }
    };
    void load(); const timer = activeStatus && !["queued", "running"].includes(activeStatus) ? undefined : setInterval(() => { if (!document.hidden) void load(); }, 1_500);
    return () => { stopped = true; clearInterval(timer); };
  }, [base, activeId, activeStatus]);
  async function execute(id: string) {
    setError("");
    setRun(previous => previous?.id === id ? { ...previous, status: "running" } : previous);
    try { const next = await post<WorkbenchRunView>(`${base}/${id}`, { action: "execute" }); if (currentRun.current === id) setRun(next); await refreshHistory(); }
    catch (reason) { setError((reason as Error).message); }
  }
  async function prepare(event: React.FormEvent) {
    event.preventDefault(); if (!destination) return;
    setBusy(true); setError("");
    const payload = { objective, mode, destinationKey: destination.key, allowRemote: destination.remote && allowRemote, sources: selection.map(({ fragmentId, versionId, quote }) => ({ fragmentId, versionId, quote })) };
    const signature = JSON.stringify(payload); if (request.current?.signature !== signature) request.current = { signature, id: newUiId() };
    try { const result = await post<{ run: WorkbenchRunView }>(base, { ...payload, requestId: request.current.id }); currentRun.current = result.run.id; setActiveId(result.run.id); setRun(result.run); request.current = null; await refreshHistory(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function cancel() { if (!run) return; setBusy(true); setError(""); try { await post(`${base}/${run.id}`, { action: "cancel" }); setRun(await get(`${base}/${run.id}`)); await refreshHistory(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  async function incorporate() { if (!run) return; setBusy(true); setError(""); try { await post(`${base}/${run.id}`, { action: "import" }); setRun(await get(`${base}/${run.id}`)); await refreshHistory(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  function toggle(source: Source) { setSelection(current => current.some(item => item.fragmentId === source.fragmentId) ? current.filter(item => item.fragmentId !== source.fragmentId) : current.length < 8 ? [...current, source] : current); }
  async function more() { if (!catalog?.nextAfter) return; setBusy(true); try { setCatalog(await get(`${base}/sources?after=${encodeURIComponent(catalog.nextAfter)}`)); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  const running = run?.status === "running";
  return <div className="workbench" data-testid="case-workbench">
    <div className="workbench-toolbar"><p>Tu mesa privada en esta causa. Elige pasajes conservados, prepara archivos y revisa el resultado antes de incorporarlo al escrito.</p><button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw size={16} aria-hidden="true" />Actualizar estado</button></div>
    {error && <p role="alert" className="workbench-error">{error}</p>}
    {loading && <p role="status">Abriendo tu mesa y las fuentes accesibles…</p>}
    {capabilities && !capabilities.runtime.available && <aside className="workbench-setup"><h2>Preparar el ejecutor local</h2><p>{capabilities.runtime.reason}</p><Link href={capabilities.setupHref}>Ver la guía de preparación</Link><p>Las fuentes y el objetivo pueden revisarse aquí. La creación de archivos requiere el ejecutor preparado.</p></aside>}
    <div className="workbench-columns">
      <form onSubmit={prepare} className="workbench-prepare">
        <h2>Preparar un trabajo</h2>
        <label className="workbench-field" htmlFor="workbench-objective">Objetivo del trabajo<textarea id="workbench-objective" value={objective} onChange={event => setObjective(event.target.value)} minLength={10} maxLength={2_000} required rows={4} placeholder="Por ejemplo: ordenar los antecedentes de pago y señalar qué información falta." /></label>
        <label className="workbench-field" htmlFor="workbench-mode">Tipo de trabajo<select id="workbench-mode" value={mode} onChange={event => { setMode(event.target.value as WorkbenchMode); setRemoteConsent(""); }}><option value="source_packet">Cuaderno de fuentes · sin IA</option><option value="assisted_draft">Propuesta de borrador · con mi IA configurada</option></select></label>
        {destination && <div className="workbench-destination"><strong>{mode === "source_packet" ? "Archivos creados localmente" : `Destino: ${providerLabel(destination.provider)} · ${destination.model || "modelo sin seleccionar"}`}</strong><p>{destination.endpoint}</p><p>{mode === "source_packet" ? "La receta reúne los pasajes elegidos; no realiza inferencias jurídicas ni envía contenido a un modelo." : "Sólo el objetivo y estos pasajes se envían al proveedor elegido. El contenedor que crea los archivos trabaja sin red."}</p>{!destination.permitted && <p role="status">La política o configuración actual no permite este destino. Elige el cuaderno sin IA o revisa Mi cuenta y Configuración.</p>}{destination.remote && <label className="workbench-check"><input type="checkbox" checked={allowRemote} onChange={event => setRemoteConsent(event.target.checked ? consentKey : "")} />Permito enviar este objetivo y los pasajes seleccionados a este proveedor remoto para este trabajo.</label>}</div>}
        <fieldset className="workbench-source-picker"><legend>Pasajes seleccionados · {selection.length} de 8</legend><p>{catalog?.coverage || "Abriendo fuentes…"}</p>
          {selection.length > 0 && <ul className="workbench-selected">{selection.map((source, index) => <li key={source.fragmentId}><span>R{index + 1} · {source.title}</span><button type="button" onClick={() => toggle(source)} aria-label={`Quitar ${source.title}`}>Quitar</button></li>)}</ul>}
          {catalog?.sources.length === 0 && <p>Aún no hay pasajes preparados accesibles. <Link href={`/causas/${causaId}#documentos`}>Abre un documento y prepara sus fuentes</Link> para elegir una versión conservada.</p>}
          {catalog?.sources.map(source => <div className="workbench-source" key={source.fragmentId}><label className="workbench-check"><input type="checkbox" checked={selection.some(item => item.fragmentId === source.fragmentId)} disabled={selection.length >= 8 && !selection.some(item => item.fragmentId === source.fragmentId)} onChange={() => toggle(source)} /><span><strong>{source.title}</strong><span className="workbench-source-meta">{source.pageNumber ? `Página ${source.pageNumber}` : "Pasaje conservado"} · {dateLabel(source.createdAt)} · versión {source.versionId.slice(-8)}</span></span></label><details><summary>Leer el pasaje{source.partial ? " abreviado" : ""}</summary><blockquote>{source.quote}</blockquote><Link href={source.href}>Cotejar la versión conservada</Link></details></div>)}
          {catalog?.nextAfter && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void more()}>Ver más pasajes</button>}
        </fieldset>
        <p className="workbench-note">Se conservará una copia identificada de cada pasaje seleccionado. Ningún otro documento de la causa se incorpora automáticamente.</p>
        <button className="btn btn-primary" type="submit" disabled={busy || !capabilities?.canWrite || !capabilities.runtime.available || !destination?.permitted || selection.length === 0 || objective.trim().length < 10 || Boolean(destination?.remote && !allowRemote)}>{busy ? "Preparando…" : "Preparar trabajo"}</button>
      </form>
      <section className="workbench-result" aria-labelledby="workbench-result-title">
        <h2 id="workbench-result-title">Revisar el resultado</h2>
        {!run && <p>Abre un trabajo guardado o prepara uno nuevo. Aquí aparecerán sus pasos, archivos y fuentes.</p>}
        {run && <><div className="workbench-run-heading"><h3>{run.objective}</h3><p role="status" aria-live="polite">{labels[run.status] || run.status}</p></div><p className="workbench-note">Destino guardado: {providerLabel(run.destination.provider)}{run.destination.model !== "none" ? ` · ${run.destination.model}` : ""} · {run.destination.endpoint}</p>
          <details className="workbench-references"><summary>Pasajes y versiones guardados para este trabajo</summary>{run.sources.map(source => <div key={source.marker}><h4>{source.marker} · {source.title}</h4><blockquote>{source.text}</blockquote><Link href={source.href}>Cotejar fuente · versión {source.versionId.slice(-8)}</Link>{source.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>)}</details>
          {run.status === "queued" && <><p>La selección quedó guardada. Al ejecutar, se comprueban de nuevo tus permisos y el destino elegido.</p><button type="button" className="btn btn-primary" onClick={() => void execute(run.id)} disabled={busy}><Play size={16} aria-hidden="true" />Ejecutar trabajo</button></>}
          {(running || run.status === "queued") && <button type="button" className="btn btn-ghost" onClick={() => void cancel()} disabled={busy}><Square size={15} aria-hidden="true" />Cancelar trabajo</button>}
          <ol className="workbench-events">{run.events.map(event => <li key={event.id}><time dateTime={event.createdAt}>{dateLabel(event.createdAt)}</time><span>{event.message}</span></li>)}</ol>
          {run.status === "interrupted" && <p>El Host se interrumpió antes de terminar. Los originales se conservan. Prepara un nuevo trabajo; este resultado no puede incorporarse.</p>}
          {run.body && <><p className="workbench-note">Propuesta de trabajo: revisa el razonamiento y la pertinencia jurídica. El cotejo de los pasajes no valida las conclusiones.</p><pre className="workbench-preview" tabIndex={0} aria-label="Vista previa del borrador">{run.body}</pre><div className="workbench-actions">{run.artifacts.map(artifact => <a className="btn btn-ghost" href={`${base}/${run.id}/artifacts/${artifact.id}`} key={artifact.id}><Download size={16} aria-hidden="true" />Descargar {artifact.name.endsWith(".docx") ? "DOCX" : "Markdown"}</a>)}{run.status === "awaiting_review" && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void incorporate()}><FileCheck2 size={16} aria-hidden="true" />Revisado: incorporar al escrito</button>}{run.draftId && <Link className="btn btn-primary" href={`/causas/${causaId}/escritos?draft=${run.draftId}`}>Abrir escrito incorporado</Link>}</div></>}
        </>}
      </section>
    </div>
    <section className="workbench-history" aria-labelledby="workbench-history-title"><h2 id="workbench-history-title">Tus trabajos guardados</h2>{history?.runs.length === 0 && <p>Aún no has preparado trabajos en esta causa.</p>}<ul>{history?.runs.map(item => <li key={item.id}>{item.available ? <button type="button" aria-pressed={activeId === item.id} onClick={() => { setRun(undefined); setError(""); setActiveId(item.id); }}><span>{item.objective}</span><span>{labels[item.status] || item.status} · {dateLabel(item.createdAt)}</span></button> : <span>Trabajo no disponible con las fuentes y permisos actuales.</span>}</li>)}</ul>{history?.limited && <p>Se muestran los veinte trabajos más recientes.</p>}</section>
  </div>;
}
