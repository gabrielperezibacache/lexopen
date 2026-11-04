"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, FileCheck2, Play, RefreshCw, Square } from "lucide-react";
import { ContextPanel } from "@/components/ui/ContextPanel";
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
type Stage = "prepare" | "execute" | "review";
type Tool = "sources" | "saved_sources" | "history" | "events";
const labels: Record<string, string> = { queued: "Preparado", running: "En ejecución", awaiting_review: "Listo para revisar", imported: "Incorporado al escrito", cancelled: "Cancelado", interrupted: "Interrumpido", failed: "No completado", blocked: "Requiere revisar las fuentes" };
const providerNames: Record<string, string> = { local_recipe: "Cuaderno local sin IA", codex: "Codex personal", openai: "OpenAI", ollama: "Ollama", azure: "Azure OpenAI", groq: "Groq", hermes: "Hermes", custom: "Proveedor del estudio" };
const providerLabel = (value: string) => providerNames[value] || "Proveedor configurado";
const dateLabel = (date: string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
async function get<T>(url: string, signal?: AbortSignal): Promise<T> { const response = await fetch(url, { cache: "no-store", signal }), data = await response.json(); if (!response.ok) throw Error(data.error || "No se pudo abrir la Mesa"); return data; }
async function post<T>(url: string, body: unknown): Promise<T> { const result = await apiMutation<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!result.ok) throw Error(result.error); return result.data; }

export function CaseWorkbench({ causaId }: { causaId: string }) {
  const base = `/api/causas/${causaId}/workbench`, query = useSearchParams();
  const requestedId = query.get("trabajo"), activeId = requestedId && /^[a-zA-Z0-9_-]{1,100}$/.test(requestedId) ? requestedId : "";
  const [capabilities, setCapabilities] = useState<Capabilities>(), [catalog, setCatalog] = useState<Catalog>(), [history, setHistory] = useState<RunList>();
  const [selection, setSelection] = useState<Source[]>([]), [objective, setObjective] = useState(""), [mode, setMode] = useState<WorkbenchMode>("source_packet"), [remoteConsent, setRemoteConsent] = useState("");
  const [savedRun, setRun] = useState<WorkbenchRunView>(), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>(activeId ? "execute" : "prepare"), [panelOpen, setPanelOpen] = useState(false), [tool, setTool] = useState<Tool>("sources");
  const run = savedRun?.id === activeId ? savedRun : undefined;
  const request = useRef<{ signature: string; id: string } | null>(null), currentRun = useRef(""), published = useRef({ id: "", status: "" });
  const destination = capabilities?.destinations[mode], activeStatus = run?.status;
  const consentKey = JSON.stringify([destination?.key, objective.trim(), selection.map(source => [source.fragmentId, source.versionId, source.quote])]);
  const allowRemote = remoteConsent === consentKey;
  const refreshHistory = useCallback(() => get<RunList>(base).then(setHistory), [base]);
  const publish = useCallback((next: WorkbenchRunView) => {
    setRun(next);
    if (published.current.id !== next.id || published.current.status !== next.status) setStage(["queued", "running"].includes(next.status) ? "execute" : "review");
    published.current = { id: next.id, status: next.status };
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { const [caps, sources] = await Promise.all([get<Capabilities>(base + "/capabilities"), get<Catalog>(base + "/sources"), refreshHistory()]); setCapabilities(caps); setCatalog(sources); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, [base, refreshHistory]);
  useEffect(() => { const timer = setTimeout(() => { void refresh(); }, 0); return () => clearTimeout(timer); }, [refresh]);
  useEffect(() => {
    currentRun.current = activeId;
    if (!activeId) return;
    let stopped = false, pending = false;
    const control = new AbortController();
    const load = async () => {
      if (pending) return; pending = true;
      try { const next = await get<WorkbenchRunView>(`${base}/${activeId}`, control.signal); if (!stopped && currentRun.current === activeId) publish(next); }
      catch (reason) { if (!stopped) { setRun(undefined); setError((reason as Error).message); } }
      finally { pending = false; }
    };
    void load(); const timer = activeStatus && !["queued", "running"].includes(activeStatus) ? undefined : setInterval(() => { if (!document.hidden) void load(); }, 1_500);
    return () => { stopped = true; control.abort(); clearInterval(timer); };
  }, [base, activeId, activeStatus, publish]);
  function chooseRun(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return;
    currentRun.current = id; setRun(undefined); setError(""); setStage("execute"); setPanelOpen(false);
    const url = new URL(location.href); url.searchParams.set("trabajo", id); window.history.pushState(null, "", url);
  }
  async function execute(id: string) {
    setError(""); setRun(previous => previous?.id === id ? { ...previous, status: "running" } : previous);
    try { const next = await post<WorkbenchRunView>(`${base}/${id}`, { action: "execute" }); if (currentRun.current === id) publish(next); await refreshHistory(); }
    catch (reason) { setError((reason as Error).message); }
  }
  async function prepare(event: React.FormEvent) {
    event.preventDefault(); if (!destination) return;
    setBusy(true); setError("");
    const payload = { objective, mode, destinationKey: destination.key, allowRemote: destination.remote && allowRemote, sources: selection.map(({ fragmentId, versionId, quote }) => ({ fragmentId, versionId, quote })) };
    const signature = JSON.stringify(payload); if (request.current?.signature !== signature) request.current = { signature, id: newUiId() };
    try { const result = await post<{ run: WorkbenchRunView }>(base, { ...payload, requestId: request.current.id }); currentRun.current = result.run.id; const url = new URL(location.href); url.searchParams.set("trabajo", result.run.id); window.history.pushState(null, "", url); publish(result.run); request.current = null; await refreshHistory(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function cancel() { if (!run) return; const id = run.id; setBusy(true); setError(""); try { await post(`${base}/${id}`, { action: "cancel" }); const next = await get<WorkbenchRunView>(`${base}/${id}`); if (currentRun.current === id) publish(next); await refreshHistory(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  async function incorporate() { if (!run) return; const id = run.id; setBusy(true); setError(""); try { await post(`${base}/${id}`, { action: "import" }); const next = await get<WorkbenchRunView>(`${base}/${id}`); if (currentRun.current === id) publish(next); await refreshHistory(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  function toggle(source: Source) { setSelection(current => current.some(item => item.fragmentId === source.fragmentId) ? current.filter(item => item.fragmentId !== source.fragmentId) : current.length < 8 ? [...current, source] : current); }
  async function more() { if (!catalog?.nextAfter) return; setBusy(true); try { setCatalog(await get(`${base}/sources?after=${encodeURIComponent(catalog.nextAfter)}`)); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  function showTool(value: Tool) { setTool(value); setPanelOpen(true); }
  const canCancel = run && ["queued", "running"].includes(run.status);
  const cancelControl = canCancel && <button type="button" className="btn btn-ghost" onClick={() => void cancel()} disabled={busy}><Square size={15} aria-hidden="true" />Cancelar trabajo</button>;
  const panelId = "workbench-tools", shownStage = activeId ? stage : "prepare";
  return <div className="workbench" data-testid="case-workbench">
    <div className="workbench-toolbar"><p>Elige fuentes, crea los archivos y revisa el resultado antes de incorporarlo al escrito.</p><button type="button" className="btn btn-ghost" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw size={16} aria-hidden="true" />Actualizar estado</button></div>
    {error && <p role="alert" className="workbench-error">{error}</p>}{loading && <p role="status">Abriendo tu mesa y las fuentes accesibles…</p>}
    {requestedId && !activeId && <p role="alert" className="workbench-error">El identificador del trabajo no es válido. Elige uno de tus trabajos guardados.</p>}
    {capabilities && !capabilities.runtime.available && <aside className="workbench-setup"><h2>Preparar el ejecutor local</h2><p>{capabilities.runtime.reason}</p><Link href={capabilities.setupHref}>Ver la guía de preparación</Link></aside>}
    <nav className="workbench-stages" aria-label="Etapas del trabajo">{([["prepare","Preparar"],["execute","Ejecutar"],["review","Revisar"]] as const).map(([value,label]) => <button type="button" key={value} aria-current={shownStage === value ? "step" : undefined} disabled={value !== "prepare" && !run || value === "review" && Boolean(run && ["queued","running"].includes(run.status))} onClick={() => setStage(value)}>{label}</button>)}</nav>
    <div className="workbench-tools"><button type="button" className="btn btn-secondary" aria-controls={panelId} aria-expanded={panelOpen && tool === (shownStage === "prepare" ? "sources" : "saved_sources")} onClick={() => showTool(shownStage === "prepare" ? "sources" : "saved_sources")}>{shownStage === "prepare" ? `Elegir pasajes (${selection.length} de 8)` : "Fuentes del trabajo"}</button><button type="button" className="btn btn-ghost" aria-controls={panelId} aria-expanded={panelOpen && tool === "history"} onClick={() => showTool("history")}>Trabajos guardados</button></div>
    {run && <div className="workbench-current"><p role="status" aria-live="polite">{labels[run.status] || run.status}</p>{cancelControl}</div>}
    <div className="context-workspace">
      <div className="workbench-canvas">
        <form onSubmit={prepare} className="workbench-prepare" hidden={shownStage !== "prepare"}>
          <h2>Preparar un trabajo</h2><label className="workbench-field" htmlFor="workbench-objective">Objetivo del trabajo<textarea id="workbench-objective" value={objective} onChange={event => setObjective(event.target.value)} minLength={10} maxLength={2_000} required rows={4} placeholder="Por ejemplo: ordenar los antecedentes de pago y señalar qué información falta." /></label>
          <label className="workbench-field" htmlFor="workbench-mode">Tipo de trabajo<select id="workbench-mode" value={mode} onChange={event => { setMode(event.target.value as WorkbenchMode); setRemoteConsent(""); }}><option value="source_packet">Cuaderno de fuentes · sin IA</option><option value="assisted_draft">Propuesta de borrador · con mi IA configurada</option></select></label>
          {destination && <div className="workbench-destination"><strong>{mode === "source_packet" ? "Archivos creados localmente" : `Destino: ${providerLabel(destination.provider)} · ${destination.model || "modelo sin seleccionar"}`}</strong><p>{destination.endpoint}</p><p>{mode === "source_packet" ? "Reúne los pasajes elegidos sin realizar inferencias ni enviar contenido a un modelo." : "Sólo el objetivo y estos pasajes se envían al proveedor elegido. La creación de archivos trabaja sin red."}</p>{!destination.permitted && <p role="status">La política o configuración actual no permite este destino. Elige el cuaderno sin IA o revisa Mi cuenta y Configuración.</p>}{destination.remote && <label className="workbench-check"><input type="checkbox" checked={allowRemote} onChange={event => setRemoteConsent(event.target.checked ? consentKey : "")} />Permito enviar este objetivo y los pasajes seleccionados a este proveedor remoto para este trabajo.</label>}</div>}
          <h3>Fuentes elegidas · {selection.length} de 8</h3>{selection.length ? <ul className="workbench-selected">{selection.map((source,index) => <li key={source.fragmentId}><span>R{index+1} · {source.title}</span><button type="button" onClick={() => toggle(source)} aria-label={`Quitar ${source.title}`}>Quitar</button></li>)}</ul> : <p>Abre «Elegir pasajes» y selecciona las versiones que quieras usar.</p>}
          <p className="workbench-note">Se conservará una copia identificada de cada pasaje elegido. Ningún otro documento se incorpora automáticamente.</p><button className="btn btn-primary" type="submit" disabled={busy || !capabilities?.canWrite || !capabilities.runtime.available || !destination?.permitted || selection.length === 0 || objective.trim().length < 10 || Boolean(destination?.remote && !allowRemote)}>{busy ? "Preparando…" : "Preparar trabajo"}</button>
        </form>
        <section className="workbench-result" aria-labelledby="workbench-result-title" hidden={shownStage === "prepare"}>
          <h2 id="workbench-result-title">{shownStage === "execute" ? "Ejecutar el trabajo guardado" : "Revisar el resultado"}</h2>
          {!run && <p>Comprobando el trabajo y tus permisos actuales…</p>}
          {run && <><div className="workbench-run-heading"><h3>{run.objective}</h3></div><p className="workbench-note">Destino guardado: {providerLabel(run.destination.provider)}{run.destination.model !== "none" ? ` · ${run.destination.model}` : ""} · {run.destination.endpoint}</p>
            {run.status === "queued" && <><p>La selección quedó guardada. Al ejecutar, se comprueban de nuevo los permisos y el destino elegido.</p><button type="button" className="btn btn-primary" onClick={() => void execute(run.id)} disabled={busy}><Play size={16} aria-hidden="true" />Ejecutar trabajo</button></>}
            {run.status === "running" && <p>Creando los archivos. Puedes cancelar desde el estado del trabajo.</p>}
            {run.status === "interrupted" && <p>El Host se interrumpió antes de terminar. Prepara otro trabajo; este resultado no puede incorporarse.</p>}
            {run.body && <><p className="workbench-note">Propuesta para revisión profesional. El cotejo de los pasajes no valida las conclusiones.</p><pre className="workbench-preview" tabIndex={0} aria-label="Vista previa del borrador">{run.body}</pre><div className="workbench-actions">{run.artifacts.map(artifact => <a className="btn btn-ghost" href={`${base}/${run.id}/artifacts/${artifact.id}`} key={artifact.id}><Download size={16} aria-hidden="true" />Descargar {artifact.name.endsWith(".docx") ? "DOCX" : "Markdown"}</a>)}{run.status === "awaiting_review" && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void incorporate()}><FileCheck2 size={16} aria-hidden="true" />Revisado: incorporar al escrito</button>}{run.draftId && <Link className="btn btn-primary" href={`/causas/${causaId}/escritos?draft=${run.draftId}`}>Abrir escrito incorporado</Link>}</div></>}
            <button type="button" className="workbench-activity-link" aria-controls={panelId} onClick={() => showTool("events")}>Ver actividad del trabajo</button>
          </>}
        </section>
      </div>
      <ContextPanel id={panelId} title="Fuentes y trabajos" open={panelOpen} onClose={() => setPanelOpen(false)} headerActions={cancelControl}>
        <div className="context-panel-tools" aria-label="Herramientas de la Mesa"><button type="button" aria-pressed={tool === "sources"} onClick={() => setTool("sources")}>Elegir pasajes</button>{run && <button type="button" aria-pressed={tool === "saved_sources"} onClick={() => setTool("saved_sources")}>Fuentes guardadas</button>}<button type="button" aria-pressed={tool === "history"} onClick={() => setTool("history")}>Trabajos</button>{run && <button type="button" aria-pressed={tool === "events"} onClick={() => setTool("events")}>Actividad</button>}</div>
        <fieldset className="workbench-source-picker" hidden={tool !== "sources"}><legend>Pasajes seleccionados · {selection.length} de 8</legend><p>{catalog?.coverage || "Abriendo fuentes…"}</p>
          {catalog?.sources.length === 0 && <p>Aún no hay pasajes preparados accesibles. <Link href={`/causas/${causaId}#documentos`}>Abre un documento y prepara sus fuentes</Link>.</p>}
          {catalog?.sources.map(source => <div className="workbench-source" key={source.fragmentId}><label className="workbench-check"><input type="checkbox" checked={selection.some(item => item.fragmentId === source.fragmentId)} disabled={selection.length >= 8 && !selection.some(item => item.fragmentId === source.fragmentId)} onChange={() => toggle(source)} /><span><strong>{source.title}</strong><span className="workbench-source-meta">{source.pageNumber ? `Página ${source.pageNumber}` : "Pasaje conservado"} · {dateLabel(source.createdAt)} · versión {source.versionId.slice(-8)}</span></span></label><details><summary>Leer el pasaje{source.partial ? " abreviado" : ""}</summary><blockquote>{source.quote}</blockquote><Link href={source.href}>Cotejar la versión conservada</Link></details></div>)}
          {catalog?.nextAfter && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void more()}>Ver más pasajes</button>}<button type="button" className="btn btn-secondary" onClick={() => setPanelOpen(false)}>Volver al trabajo con {selection.length} pasajes</button>
        </fieldset>
        <section hidden={tool !== "saved_sources"} className="workbench-references"><h3>Pasajes y versiones guardados para este trabajo</h3>{run?.sources.map(source => <div key={source.marker}><h4>{source.marker} · {source.title}</h4><blockquote>{source.text}</blockquote><Link href={source.href}>Cotejar fuente · versión {source.versionId.slice(-8)}</Link>{source.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>)}</section>
        <section className="workbench-history" hidden={tool !== "history"}><h3>Tus trabajos guardados</h3>{history?.runs.length === 0 && <p>Aún no has preparado trabajos en esta causa.</p>}<ul>{history?.runs.map(item => <li key={item.id}>{item.available ? <button type="button" aria-pressed={activeId === item.id} onClick={() => chooseRun(item.id)}><span>{item.objective}</span><span>{labels[item.status] || item.status} · {dateLabel(item.createdAt)}</span></button> : <span>Trabajo no disponible con las fuentes y permisos actuales.</span>}</li>)}</ul>{history?.limited && <p>Se muestran los veinte trabajos más recientes.</p>}</section>
        <section hidden={tool !== "events"}><h3>Actividad del trabajo</h3><ol className="workbench-events">{run?.events.map(event => <li key={event.id}><time dateTime={event.createdAt}>{dateLabel(event.createdAt)}</time><span>{event.message}</span></li>)}</ol></section>
      </ContextPanel>
    </div>
  </div>;
}
