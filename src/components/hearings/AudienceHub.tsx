"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, FolderOpen, LockKeyhole, Plus, Search, X } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { formatCivilDate, santiagoDateKey, SANTIAGO_TZ } from "@/lib/chile-time";
import type { AudienceHubCatalog, AudienceHubStatus } from "@/lib/hearings/hub-types";
import "./audience-hub.css";

const states = { preparation: "En preparación", live: "En audiencia", closed: "Cerrada" };
const phases = { idle: "Sesión sin iniciar", running: "Tiempo en curso", paused: "Tiempo en pausa", finished: "Sesión finalizada" };
const clock = new Intl.DateTimeFormat("es-CL", { timeZone: SANTIAGO_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const updated = new Intl.DateTimeFormat("es-CL", { timeZone: SANTIAGO_TZ, dateStyle: "short", timeStyle: "short" });
const scheduled = (value: string) => `${formatCivilDate(santiagoDateKey(new Date(value)))} · ${clock.format(new Date(value))} h`;

async function catalog(url: string, signal?: AbortSignal): Promise<AudienceHubCatalog> {
  const response = await fetch(url, { cache: "no-store", signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw Object.assign(new Error(body?.error || "No se pudieron abrir sus mesas. Vuelva a intentarlo."), { status: response.status });
  return body;
}

export function AudienceHub({ userName }: { userName: string }) {
  const id = useId(), router = useRouter(), causeField = useRef<HTMLSelectElement>(null);
  const [query, setQuery] = useState(""), [search, setSearch] = useState(""), [status, setStatus] = useState<AudienceHubStatus>("active"), [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; data?: AudienceHubCatalog; error?: string }>();
  const [open, setOpen] = useState(false), [causaId, setCausaId] = useState(""), [title, setTitle] = useState(""), [creating, setCreating] = useState(false), [createError, setCreateError] = useState(""), [unconfirmed, setUnconfirmed] = useState(false), [createdId, setCreatedId] = useState("");
  const [moreBusy, setMoreBusy] = useState(false);
  const key = JSON.stringify([search, status, attempt]);
  const data = response?.key === key ? response.data : undefined, error = response?.key === key ? response.error : "";
  useEffect(() => {
    const controller = new AbortController();
    void catalog(`/api/hearings?${new URLSearchParams({ q: search, status })}`, controller.signal).then(value => {
      if (!controller.signal.aborted) { setResponse({ key, data: value }); setUnconfirmed(false); }
    }).catch(reason => { if (!controller.signal.aborted) setResponse({ key, error: reason instanceof Error ? reason.message : "No se pudo consultar el panel." }); });
    return () => controller.abort();
  }, [search, status, attempt, key]);
  function toggleCreate() { setOpen(value => !value); if (!open) requestAnimationFrame(() => causeField.current?.focus()); }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || createdId || unconfirmed || !data?.causas.some(item => item.id === causaId && item.canWrite)) return;
    setCreating(true); setCreateError("");
    const result = await apiMutation<{ id: string }>(`/api/causas/${encodeURIComponent(causaId)}/hearings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() }) });
    if (!result.ok) { setCreating(false); setCreateError(result.error); setUnconfirmed(result.status === 0 || result.status >= 500); return; }
    if (typeof result.data.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(result.data.id)) { setCreating(false); setUnconfirmed(true); setCreateError("No se confirmó la dirección de la mesa. Revise sus mesas guardadas antes de crear otra."); return; }
    setCreatedId(result.data.id); setCreating(false);
    router.push(`/audiencias/${encodeURIComponent(result.data.id)}`);
  }
  async function more() {
    if (!data?.nextAfter || moreBusy) return;
    const currentKey = key; setMoreBusy(true);
    try {
      const next = await catalog(`/api/hearings?${new URLSearchParams({ q: search, status, after: data.nextAfter })}`);
      setResponse(previous => previous?.key === currentKey && previous.data ? { key: currentKey, data: { ...next, workspaces: [...previous.data.workspaces, ...next.workspaces.filter(item => !previous.data!.workspaces.some(known => known.id === item.id))] } } : previous);
    } catch (reason) { setResponse(previous => previous?.key === currentKey ? { key: currentKey, error: reason instanceof Error ? reason.message : "No se pudo abrir la siguiente página." } : previous); }
    finally { setMoreBusy(false); }
  }
  return <div className="audience-hub" data-testid="audience-hub">
    <header className="audience-hub-heading"><div><h1>Audiencias en vivo</h1><p>Prepare su intervención y vuelva a su mesa con cada fuente a mano.</p></div><button className="btn btn-primary" type="button" aria-expanded={open} aria-controls={`${id}-create`} onClick={toggleCreate} disabled={!data}><Plus size={17} aria-hidden="true" />Preparar audiencia</button></header>
    <div className="audience-hub-intro"><p><LockKeyhole size={17} aria-hidden="true" /><span>Mesas privadas de <strong>{userName}</strong>. Cada audiencia permanece vinculada a su causa.</span></p><Link href="/cuenta#codex">Mi conexión Codex<ArrowRight size={16} aria-hidden="true" /></Link></div>
    <section id={`${id}-create`} className="audience-hub-create" hidden={!open || !data} aria-labelledby={`${id}-create-title`}>
      <div className="audience-hub-section-heading"><div><h2 id={`${id}-create-title`}>Una mesa para la audiencia</h2><p>Elija el expediente y un nombre reconocible. Podrá fijar fecha, hora y asuntos en Agenda.</p></div><button type="button" className="audience-hub-close" onClick={() => setOpen(false)} aria-label="Cerrar preparación"><X size={20} aria-hidden="true" /></button></div>
      <form onSubmit={create}><label htmlFor={`${id}-cause`}>Causa<select ref={causeField} id={`${id}-cause`} className="select" value={causaId} onChange={event => { setCausaId(event.target.value); setCreatedId(""); }} required disabled={creating}><option value="">Seleccione una causa autorizada</option>{data?.causas.map(item => <option key={item.id} value={item.id} disabled={!item.canWrite}>{item.titulo}{item.rit ? ` · ${item.rit}` : ""}{!item.canWrite ? " · sólo lectura" : ""}</option>)}</select></label><label htmlFor={`${id}-title`}>Nombre de la audiencia<input className="input" id={`${id}-title`} value={title} onChange={event => { setTitle(event.target.value); setCreatedId(""); }} minLength={3} maxLength={180} required disabled={creating} placeholder="Por ejemplo, audiencia preparatoria" /></label><button type="submit" className="btn btn-secondary" disabled={creating || Boolean(createdId) || unconfirmed || !title.trim() || !data?.causas.some(item => item.id === causaId && item.canWrite)}>{creating ? "Preparando su mesa…" : createdId ? "Mesa guardada" : "Crear y abrir panel"}<ArrowRight size={16} aria-hidden="true" /></button></form>
      {createdId && <p className="audience-hub-help" role="status">Mesa guardada. <Link href={`/audiencias/${encodeURIComponent(createdId)}`}>Abrir su panel en vivo</Link></p>}
      {createError && <div className="audience-hub-error" role="alert"><p>{createError}</p>{unconfirmed && <><p>No se confirmó la creación. Actualice las mesas para comprobar si ya se guardó antes de crear otra.</p><button className="btn btn-secondary" type="button" onClick={() => { setStatus("all"); setSearch(""); setQuery(""); setAttempt(value => value + 1); }}>Revisar mis mesas guardadas</button></>}</div>}
      {data?.limited.causas && <p className="audience-hub-help">El selector muestra hasta cuarenta causas accesibles. Use el buscador por título, RIT o tribunal para localizar otra.</p>}
      {data && !data.causas.length && <p className="audience-hub-help">No hay causas para esta búsqueda. Cambie los términos o abra <Link href="/causas">sus expedientes</Link> para preparar uno.</p>}
    </section>
    <section className="audience-hub-ledger" aria-labelledby={`${id}-list-title`}>
      <div className="audience-hub-section-heading"><div><h2 id={`${id}-list-title`}>Mis mesas de audiencia</h2><p>Lecturas y PDF, guion, notas, transcripción y conversación con fuentes en un mismo panel.</p></div><button type="button" className="audience-hub-text-action" onClick={() => setAttempt(value => value + 1)} disabled={creating || !data && !error}>Actualizar mesas</button></div>
      <form className="audience-hub-search" role="search" aria-label="Buscar mesas de audiencia" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); }}><Search size={19} aria-hidden="true" /><label className="sr-only" htmlFor={`${id}-search`}>Buscar causa o mesa</label><input className="input" type="search" id={`${id}-search`} value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Título de la mesa, causa, RIT o tribunal…" /><button type="submit" className="btn btn-secondary">Buscar</button></form>
      <nav className="audience-hub-filters" aria-label="Estado de las mesas">{([["active", "Por preparar y en curso"], ["closed", "Cerradas"], ["all", "Todas"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}</nav>
      {!data && !error && <div className="audience-hub-loading" role="status"><p>Abriendo sus mesas y comprobando el acceso a las causas…</p><div aria-hidden="true" /><div aria-hidden="true" /></div>}
      {error && <div className="audience-hub-error" role="alert"><h3>No se pudo abrir el panel</h3><p>{error}</p><button type="button" className="btn btn-secondary" onClick={() => setAttempt(value => value + 1)}>Reintentar carga de mesas</button></div>}
      {data && !data.workspaces.length && <div className="audience-hub-empty"><h3>{search ? "No hay mesas con esta búsqueda" : status === "closed" ? "Sus mesas cerradas aparecerán aquí" : "Su próxima audiencia empieza aquí"}</h3><p>{search ? "Pruebe el nombre de la causa, el RIT o el tribunal. También puede consultar todas sus mesas." : "Prepare una mesa dentro de una causa autorizada. Sus fuentes, guion y notas permanecerán reunidos para retomarlos después."}</p>{search ? <button type="button" className="audience-hub-text-action" onClick={() => { setSearch(""); setQuery(""); }}>Limpiar búsqueda</button> : <button type="button" className="btn btn-secondary" onClick={() => { setOpen(true); requestAnimationFrame(() => causeField.current?.focus()); }}>Preparar mi primera mesa</button>}</div>}
      {data && data.workspaces.length > 0 && <ol className="audience-hub-list">{data.workspaces.map(item => <li key={item.id} data-testid="audience-hub-workspace"><article><div className="audience-hub-row-title"><div><span className="audience-hub-state" data-state={item.status}>{states[item.status]}</span><h3><Link href={`/audiencias/${encodeURIComponent(item.id)}`}>{item.title}</Link></h3></div><Link className="btn btn-secondary" href={`/audiencias/${encodeURIComponent(item.id)}`}>Abrir panel en vivo<ArrowRight size={16} aria-hidden="true" /></Link></div><p className="audience-hub-cause"><FolderOpen size={16} aria-hidden="true" /><Link href={`/causas/${encodeURIComponent(item.causa.id)}`}>{item.causa.titulo}</Link></p><p className="audience-hub-court">{item.causa.rit || "Sin RIT"} · {item.causa.tribunal}</p><div className="audience-hub-row-meta"><span><CalendarClock size={15} aria-hidden="true" />{item.scheduledFor ? <time dateTime={item.scheduledFor}>{scheduled(item.scheduledFor)} · Chile</time> : "Sin fecha programada"}</span><span>{phases[item.livePhase]}</span><span>Actualizada <time dateTime={item.updatedAt}>{updated.format(new Date(item.updatedAt))}</time></span></div></article></li>)}</ol>}
      {data?.nextAfter && <button type="button" className="btn btn-secondary" disabled={moreBusy} onClick={() => void more()}>{moreBusy ? "Abriendo más mesas…" : "Cargar más mesas"}</button>}
      <p className="audience-hub-help">Abrir el panel no inicia el reloj ni activa el micrófono. La captura y el envío de audio requieren sus propias acciones y confirmaciones.</p>
    </section>
  </div>;
}
