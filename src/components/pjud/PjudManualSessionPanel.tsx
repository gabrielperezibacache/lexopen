"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ExternalLink, LoaderCircle, LogIn, X } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { MANUAL_OJV_MATERIAS, type ManualOjvMateria, type ManualOjvUiResponse, type ManualOjvUiSession } from "@/lib/pjud/manual-session-contract";
import { PjudCuadernosCoverage } from "./PjudCuadernosCoverage";
import "./pjud-manual-session.css";

const endpoint = "/api/pjud/manual-session";
const workingPhases = new Set(["opening", "waiting-login", "waiting-user-confirmation", "listing", "importing"]);

function actionError(status: number, message: string) {
  if (status === 401) return "Su sesión de LexOpen terminó. Vuelva a ingresar antes de continuar.";
  if (status === 403) return "Su cuenta no tiene permiso para realizar esta acción desde este equipo.";
  if (status === 429) return "Espere un momento antes de repetir la solicitud.";
  if (status === 0) return "No se pudo confirmar la respuesta. Actualice el estado antes de repetir una importación.";
  return /^Error \d+$/.test(message) ? "No se pudo completar la solicitud. Actualice el estado y vuelva a intentarlo." : message;
}

function phaseLabel(session: ManualOjvUiSession | null) {
  switch (session?.phase) {
    case "opening": return "Abriendo el acceso oficial";
    case "waiting-login": return "Complete su ingreso en la ventana oficial";
    case "waiting-user-confirmation": return "Hay una confirmación pendiente en la OJV";
    case "ready": return session.listedAt ? "Elija las causas que desea incorporar" : "Conexión preparada. Consulte Mis Causas";
    case "listing": return "Consultando las causas de su cuenta";
    case "importing": return "Importando y leyendo los cuadernos";
    case "completed": return "La importación terminó";
    case "error": return "La consulta necesita atención";
    case "closed": return "Conexión cerrada";
    default: return "Ingrese con su cuenta judicial";
  }
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function PjudManualSessionPanel() {
  const [data, setData] = useState<ManualOjvUiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [materia, setMateria] = useState<ManualOjvMateria | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [reviewingNextBatch, setReviewingNextBatch] = useState(false);
  const snapshot = useRef<ManualOjvUiResponse | null>(null);
  const mounted = useRef(false);
  const revision = useRef(0);
  const listVersion = useRef<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const pendingAction = useRef<string | null>(null);
  const candidatesRef = useRef<HTMLDivElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const importInitiated = useRef(false);

  const forgetPrivateState = useCallback(() => {
    snapshot.current = null;
    listVersion.current = null;
    setData(null);
    setSelected(new Set());
    setQuery("");
    setPage(0);
    setReviewingNextBatch(false);
    importInitiated.current = false;
  }, []);

  const accept = useCallback((next: ManualOjvUiResponse) => {
    snapshot.current = next;
    setData(next);
    if (listVersion.current !== (next.session?.listedAt ?? null)) {
      listVersion.current = next.session?.listedAt ?? null;
      setSelected(new Set());
      setPage(0);
      setQuery("");
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    async function poll() {
      controller = new AbortController();
      const token = revision.current;
      const timeout = window.setTimeout(() => controller?.abort(), 15_000);
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => null);
        if (disposed || revision.current !== token) return;
        if (!response.ok || typeof body?.capabilities?.available !== "boolean") {
          if (response.status === 401 || response.status === 403 || response.status === 404) forgetPrivateState();
          setLoadError(actionError(response.status, body?.error || "No se pudo comprobar el ingreso manual."));
        } else {
          accept(body as ManualOjvUiResponse);
          setLoadError("");
        }
      } catch {
        if (!disposed && revision.current === token) setLoadError("No se pudo actualizar la conexión. Sus causas y su selección se conservan en esta pantalla.");
      } finally {
        window.clearTimeout(timeout);
        if (!disposed) {
          setLoading(false);
          const session = snapshot.current?.session;
          if (session && session.phase !== "closed") timer = setTimeout(poll, workingPhases.has(session.phase) ? 1500 : 10_000);
        }
      }
    }
    void poll();
    return () => { disposed = true; controller?.abort(); if (timer) clearTimeout(timer); };
  }, [refreshKey, accept, forgetPrivateState]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
      const session = snapshot.current?.session;
      // An accepted import continues on the Host; read-only sessions close when leaving.
      if (session && session.phase !== "closed" && session.phase !== "importing" && pendingAction.current !== "import") {
        void apiMutation(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close", sessionId: session.id }), keepalive: true });
      }
    };
  }, []);

  async function act(action: "start" | "list" | "import" | "focus" | "close") {
    if (pending.current) return;
    if (action === "import" && (!selected.size || selected.size > (data?.capabilities.importLimit ?? 20))) return;
    const controller = new AbortController();
    pending.current = controller;
    pendingAction.current = action;
    revision.current += 1;
    setBusy(action);
    setError("");
    const body = { action, ...(action !== "start" ? { sessionId: data?.session?.id } : {}),
      ...(action === "list" && materia !== "all" ? { materias: [materia] } : {}),
      ...(action === "import" ? { candidateIds: [...selected] } : {}) };
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await apiMutation<ManualOjvUiResponse>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!mounted.current || pending.current !== controller) return;
      if (!response.ok) { if (response.status === 401 || response.status === 403) forgetPrivateState(); setError(actionError(response.status, response.error)); }
      else {
        revision.current += 1; accept(response.data); setLoadError("");
        if (action === "import") { setSelected(new Set()); setReviewingNextBatch(false); importInitiated.current = true; }
        if (action === "list" || action === "start") setReviewingNextBatch(true);
        if (action === "close") { importInitiated.current = false; setReviewingNextBatch(false); }
      }
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; pendingAction.current = null; if (mounted.current) { setBusy(null); setRefreshKey(value => value + 1); } }
    }
  }

  const session = data?.session ?? null;
  const canStart = Boolean(data?.capabilities.available && data.capabilities.allowed);
  const connectionOpen = Boolean(session && session.phase !== "closed");
  const canResume = Boolean(connectionOpen && !session?.authenticated && (session?.phase === "error" || session?.phase === "completed"));
  const backgroundBusy = session?.phase === "opening" || session?.phase === "listing" || session?.phase === "importing";
  const canShowWindow = connectionOpen && !backgroundBusy;
  const canRead = Boolean(session?.authenticated && !backgroundBusy && session.phase !== "closed");
  const limit = data?.capabilities.importLimit ?? 20;
  const pageSize = Math.max(1, Math.min(limit, 20));
  const candidates = useMemo(() => session?.candidates ?? [], [session?.candidates]);
  const filtered = useMemo(() => {
    const value = normalizeSearch(query.trim());
    return value ? candidates.filter(item => normalizeSearch(`${item.rit} ${item.tribunal} ${item.caratula || ""}`).includes(value)) : candidates;
  }, [candidates, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const allVisibleSelected = visible.length > 0 && visible.every(item => selected.has(item.id));
  const currentStep = session?.phase === "importing" || (session?.result && !reviewingNextBatch) ? 3 : session?.authenticated ? 2 : 1;
  const awaitingUser = session?.phase === "waiting-login" || session?.phase === "waiting-user-confirmation";
  const result = session?.result;
  const expires = session?.expiresAt ? new Date(session.expiresAt) : null;

  useEffect(() => {
    if (session?.phase !== "completed" || !session.result || !importInitiated.current) return;
    importInitiated.current = false;
    resultHeadingRef.current?.focus({ preventScroll: true });
    resultHeadingRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [session?.phase, session?.result]);

  function continueReview() {
    setReviewingNextBatch(true);
    window.requestAnimationFrame(() => {
      candidatesRef.current?.focus({ preventScroll: true });
      candidatesRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }

  function toggle(id: string) {
    setError("");
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < limit) next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    if (!allVisibleSelected && new Set([...selected, ...visible.map(item => item.id)]).size > limit) {
      setError(`Puede importar hasta ${limit} causas por grupo. Quite algunas de la selección para añadir otras.`);
      return;
    }
    setError("");
    setSelected(previous => { const next = new Set(previous); visible.forEach(item => allVisibleSelected ? next.delete(item.id) : next.add(item.id)); return next; });
  }

  return <section id="ingreso-manual" className="pjud-manual" aria-labelledby="pjud-manual-title" aria-busy={Boolean(busy) || backgroundBusy}>
    <div className="pjud-manual-intro">
      <div><h2 id="pjud-manual-title">Su cuenta judicial, su cartera</h2><p>Ingrese personalmente en la página oficial de ClaveÚnica. Después, elija las causas: LexOpen las incorporará y consultará sus cuadernos disponibles.</p></div>
      <Link href="/causas/monitoreo#alta-rol" className="pjud-manual-crosslink">Consultar por RIT/ROL <ArrowUpRight size={17} aria-hidden="true" /></Link>
    </div>

    <ol className="pjud-manual-steps" aria-label="Pasos de incorporación">
      {["Ingresar en OJV", "Revisar las causas", "Importar y sincronizar"].map((label, index) => <li key={label} aria-current={currentStep === index + 1 ? "step" : undefined} data-done={currentStep > index + 1}><span>{currentStep > index + 1 ? <Check size={17} aria-hidden="true" /> : index + 1}</span>{label}</li>)}
    </ol>

    {loadError && <div className="pjud-manual-message" data-tone="error" role="alert"><p>{loadError}</p><button className="btn btn-ghost" type="button" disabled={Boolean(busy)} onClick={() => setRefreshKey(value => value + 1)}>Actualizar estado</button></div>}
    {error && <div className="pjud-manual-message" data-tone="error" role="alert"><p>{error}</p></div>}
    {loading && !data && <p className="pjud-manual-status" role="status"><LoaderCircle size={18} aria-hidden="true" />Comprobando el ingreso manual…</p>}

    {data && <>
      {!canStart && <div className="pjud-manual-message" role="status"><p>{data.capabilities.reason || "El ingreso manual se abre en el equipo Host de LexOpen. Acceda desde ese equipo para continuar."}</p><p>Puede consultar causas públicas por RIT/ROL y tribunal desde la cartera.</p></div>}
      <div className="pjud-manual-connection">
        <div className="pjud-manual-connection-copy"><h3>{phaseLabel(session)}</h3>
          {!connectionOpen && <p>La contraseña se escribe sólo en ClaveÚnica. Esta conexión temporal permite revisar las causas antes de incorporarlas al estudio.</p>}
          {session?.phase === "opening" && <p>Se está preparando una ventana del navegador en este equipo. Espere a que aparezca el formulario con el encabezado PJUD.</p>}
          {awaitingUser && <p>Continúe en la ventana temporal abierta por LexOpen, distinta de su navegador habitual, con el encabezado PJUD. Complete allí su identificación y cualquier confirmación del portal. El ingreso dispone de hasta 15 minutos. LexOpen detectará su regreso a la OJV.</p>}
          {canRead && <p>Conexión temporal{expires && !Number.isNaN(expires.getTime()) ? ` hasta las ${expires.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Santiago" })}` : ""}. Puede importar varios grupos mientras esté abierta.</p>}
          {session?.error && <p className="pjud-manual-error" role="alert">{session.error}</p>}
        </div>
        <div className="pjud-manual-actions">
          {(!connectionOpen || canResume) && <button className="btn btn-primary" type="button" disabled={!canStart || Boolean(busy) || loading} onClick={() => void act("start")}><LogIn size={18} aria-hidden="true" />{busy === "start" ? "Preparando ingreso…" : canResume ? "Reanudar ingreso con ClaveÚnica" : "Ingresar con ClaveÚnica"}</button>}
          {canShowWindow && <button className="btn btn-secondary" type="button" disabled={!canStart || Boolean(busy) || loading} onClick={() => void act("focus")}><ExternalLink size={18} aria-hidden="true" />{busy === "focus" ? "Mostrando ventana…" : "Mostrar ventana oficial"}</button>}
          {connectionOpen && <button className="btn btn-ghost" type="button" disabled={Boolean(busy)} onClick={() => void act("close")}><X size={17} aria-hidden="true" />{session?.phase === "importing" ? "Detener y cerrar conexión" : "Cerrar conexión"}</button>}
        </div>
      </div>

      {canRead && (!result || reviewingNextBatch) && <form className="pjud-manual-query" onSubmit={event => { event.preventDefault(); void act("list"); }}>
        <div className="pjud-manual-query-field"><label id="pjud-manual-materia-label" htmlFor="pjud-manual-materia">Materia</label><select id="pjud-manual-materia" aria-labelledby="pjud-manual-materia-label" className="input" value={materia} disabled={Boolean(busy)} onChange={event => setMateria(event.target.value as ManualOjvMateria | "all")}><option value="all">Todas las materias disponibles</option>{MANUAL_OJV_MATERIAS.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
        <button className="btn btn-secondary" type="submit" disabled={Boolean(busy)}>{busy === "list" ? "Solicitando consulta…" : session?.listedAt ? "Volver a consultar Mis Causas" : "Consultar Mis Causas"}</button>
      </form>}
      {session?.phase === "listing" && <p className="pjud-manual-status" role="status"><LoaderCircle size={18} aria-hidden="true" />Consultando el listado y esperando una respuesta nueva de la OJV…</p>}

      {result && <details className="pjud-manual-receipt" open={!reviewingNextBatch}>
        <summary>{reviewingNextBatch ? "Recibo de la importación anterior" : "Importación terminada"}</summary>
        <section className="pjud-manual-result" aria-labelledby="pjud-manual-result-title">
        <div className="pjud-manual-list-heading"><div><h3 ref={resultHeadingRef} tabIndex={-1} id="pjud-manual-result-title">Resultado de la importación</h3><p role="status">{result.created} {result.created === 1 ? "causa creada" : "causas creadas"} · {result.linked} {result.linked === 1 ? "vinculada" : "vinculadas"} · {result.inserted} movimientos nuevos</p></div><Link className="btn btn-secondary" href="/causas/monitoreo">Ver mi cartera <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
        {(result.syncPartial > 0 || result.syncFailed > 0) && <p className="pjud-manual-message" data-tone="warning" role="status">La incorporación incluye lecturas pendientes: {result.syncPartial} {result.syncPartial === 1 ? "parcial" : "parciales"} y {result.syncFailed} {result.syncFailed === 1 ? "con error" : "con errores"}. Revise cada causa antes de reintentar; las que tienen enlace ya están en su cartera.</p>}
        <ul className="pjud-manual-result-list">{result.items.map(item => <li key={item.causaId}><div><Link href={`/causas/${encodeURIComponent(item.causaId)}`} className="pjud-manual-case-link">{item.rit} <ArrowUpRight size={16} aria-hidden="true" /></Link><p>{item.tribunal}</p></div><PjudCuadernosCoverage coverage={item.cuadernosCoverage} compact />{item.note && <p className="pjud-manual-result-note">{item.note}</p>}</li>)}</ul>
        {canRead && !reviewingNextBatch && <button type="button" className="pjud-manual-text-action" onClick={continueReview}>Continuar con otras causas de este listado</button>}
      </section></details>}

      {session?.listedAt && connectionOpen && session.phase !== "importing" && (!result || reviewingNextBatch) && <div ref={candidatesRef} tabIndex={-1} id="pjud-manual-candidates" className="pjud-manual-candidates">
        <div className="pjud-manual-list-heading"><div><h3>Revise antes de importar</h3><p>{candidates.length} {candidates.length === 1 ? "causa recibida" : "causas recibidas"}{session.materiasTried.length ? ` · ${session.materiasTried.join(", ")}` : ""}. Consultar el listado no incorpora causas a su cartera.</p></div><span className="pjud-manual-selection" role="status">{selected.size} {selected.size === 1 ? "seleccionada" : "seleccionadas"}</span></div>
        {candidates.length > 0 ? <>
          <label className="pjud-manual-search" htmlFor="pjud-manual-search">Filtrar el listado<input id="pjud-manual-search" className="input" type="search" value={query} placeholder="RIT/ROL, tribunal o carátula" onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
          <div className="pjud-manual-list-actions"><button type="button" className="pjud-manual-text-action" disabled={!canRead || Boolean(busy) || !visible.length} onClick={toggleVisible}>{allVisibleSelected ? "Quitar selección de esta página" : "Seleccionar esta página"}</button>{selected.size > 0 && <button type="button" className="pjud-manual-text-action" disabled={!canRead || Boolean(busy)} onClick={() => setSelected(new Set())}>Quitar toda la selección</button>}<span>Hasta {limit} causas por grupo</span></div>
          {visible.length > 0 ? <ul className="pjud-manual-case-list">{visible.map(item => <li key={item.id}><label><input type="checkbox" checked={selected.has(item.id)} disabled={!canRead || Boolean(busy) || (!selected.has(item.id) && selected.size >= limit)} onChange={() => toggle(item.id)} /><span><strong>{item.rit}</strong><span>{item.tribunal}</span>{item.caratula && <span>{item.caratula}</span>}{item.estado && <small>{item.estado}</small>}</span></label></li>)}</ul> : <p className="pjud-manual-empty">Ninguna causa coincide con el filtro. Pruebe con otro RIT/ROL o tribunal.</p>}
          <div className="pjud-manual-pagination"><p>{filtered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} de ${filtered.length}` : "Sin coincidencias"}</p><div><button className="btn btn-ghost" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button><button className="btn btn-ghost" type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div></div>
          <div className="pjud-manual-import"><div><h3>Incorporar a mi cartera</h3><p>Se crearán o vincularán sólo las causas seleccionadas. LexOpen consultará todos sus cuadernos disponibles y mostrará las lecturas que queden pendientes.</p>
            {selected.size > 0 && <ul className="pjud-manual-selected" aria-label="Causas seleccionadas">{candidates.filter(item => selected.has(item.id)).map(item => <li key={item.id}><span><strong>{item.rit}</strong> · {item.tribunal}</span><button type="button" className="btn btn-ghost" disabled={!canRead || Boolean(busy)} aria-label={`Quitar ${item.rit}, ${item.tribunal} de la selección`} onClick={() => toggle(item.id)}><X size={17} aria-hidden="true" /></button></li>)}</ul>}
          </div><button className="btn btn-primary" type="button" disabled={!canRead || Boolean(busy) || selected.size === 0 || selected.size > limit} onClick={() => void act("import")}>Importar {selected.size || "las"} {selected.size === 1 ? "causa" : "causas seleccionadas"}</button></div>
        </> : <p className="pjud-manual-empty">La OJV no devolvió causas en esta consulta. Puede probar otra materia o volver a consultar; esta respuesta no acredita ausencia de causas.</p>}
      </div>}

      {session?.phase === "importing" && <div className="pjud-manual-progress" role="status"><LoaderCircle size={22} aria-hidden="true" /><div><h3>Recuperando los cuadernos de sus causas</h3><p>{session.progress ? `${session.progress.completed} de ${session.progress.total} causas procesadas${session.progress.currentRit ? ` · ${session.progress.currentRit}` : ""}` : "Preparando la importación…"}</p><p>La importación continuará si cambia de sección. Al volver, podrá consultar su resultado.</p></div></div>}


    </>}
    <footer className="pjud-manual-footer"><p><ExternalLink size={16} aria-hidden="true" />El ingreso ocurre en la página oficial. La conexión temporal dura hasta 30 minutos y no guarda la contraseña en LexOpen.</p><p>Las actualizaciones posteriores dependen del monitoreo configurado en el Host. Las causas privadas requieren una sesión OJV vigente.</p></footer>
  </section>;
}
