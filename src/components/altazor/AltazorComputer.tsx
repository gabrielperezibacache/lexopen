"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CircleAlert, ExternalLink, FileText, Maximize2, Minimize2, Monitor, MousePointer2, RefreshCw, Square } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { operationKey } from "@/lib/client-submission-key";
import { AltazorSecretUse } from "./AltazorSecretUse";
import { AltazorMessageContent } from "./AltazorMessageContent";
import type { ComputerReading, ComputerReadRequest } from "@/lib/altazor/computer/reading";
import type { ConnectorInventory } from "@/lib/altazor/connectors/types";
import { desktopPoint } from "@/lib/altazor/computer/coordinates";
import { COMPUTER_ATTACHMENT_FORMATS, computerTurnNeedsHelp, type ComputerFile, type ComputerReview, type ComputerSessionView, type ComputerStatus } from "@/lib/altazor/computer/types";
import styles from "./AltazorComputer.module.css";

const api = "/api/altazor/computer";
const stateLabel: Record<string, string> = { disabled: "Desactivado", unconfigured: "Por preparar", configured: "Escritorio preparado", error: "Requiere comprobación", creating: "Creación pendiente", starting: "Escritorio iniciándose", ready: "Escritorio disponible", unknown: "Creación sin confirmar", closed: "Escritorio detenido", expired: "Acceso vencido", stopped: "Escritorio detenido" };
type ActionReply = { action: { id: string; status: string; result: { held?: boolean; cancelled?: boolean; stopped?: boolean } | null } };
type PanelProps = { causaId?: string | null; active?: boolean; preferredSessionId?: string | null; review?: ComputerReview };

function ComputerReadingPanel({ sessionId, available }: { sessionId: string; available: boolean }) {
  const id = useId();
  const [source, setSource] = useState<"browser" | "document">("browser"), [path, setPath] = useState(""), [query, setQuery] = useState("");
  const [reading, setReading] = useState<ComputerReading | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = useRef<ComputerReadRequest | null>(null), requestEpoch = useRef(0);
  useEffect(() => () => { requestEpoch.current++; }, []);
  async function read(next?: { offset?: number; elementOffset?: number }) {
    if (!available || busy) return;
    const input: ComputerReadRequest = next && request.current
      ? { ...request.current, ...next }
      : { source, ...(source === "document" ? { path: path.trim() } : {}), ...(query.trim() ? { query: query.trim() } : {}), limit: 6000, elementLimit: 40 };
    const epoch = ++requestEpoch.current;
    request.current = input;
    setBusy(true); setError("");
    try {
      const result = await apiMutation<{ reading: ComputerReading }>(`${api}/sessions/${encodeURIComponent(sessionId)}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (epoch !== requestEpoch.current) return;
      if (!result.ok) { setReading(null); setError(result.error); return; }
      request.current = input; setReading(result.data.reading);
    } catch { if (epoch === requestEpoch.current) { setReading(null); setError("No se pudo leer el contenido. Puede volver a intentarlo."); } }
    finally { if (epoch === requestEpoch.current) setBusy(false); }
  }
  return <details className={styles.reading}>
    <summary><FileText size={17} aria-hidden="true" />Leer como texto</summary>
    <p>Consulta el texto de la página o de un archivo del escritorio sin capturas de pantalla. Se muestran bloques acotados para revisar sólo lo que necesitas.</p>
    {!available && <p role="status">Devuelve el control a Altazor para consultar el contenido del escritorio.</p>}
    <form onSubmit={event => { event.preventDefault(); void read(); }}>
      <div className={styles.readingFields}>
        <label htmlFor={`${id}-source`}>Contenido<select id={`${id}-source`} value={source} disabled={busy || !available} onChange={event => { setSource(event.target.value as "browser" | "document"); setReading(null); }}><option value="browser">Página del navegador interno</option><option value="document">Documento o PDF del escritorio</option></select></label>
        {source === "document" && <label htmlFor={`${id}-path`}>Ruta del archivo en la carpeta de trabajo<input id={`${id}-path`} value={path} required maxLength={500} placeholder="informes/contrato.pdf" disabled={busy || !available} onChange={event => { setPath(event.target.value); setReading(null); }} /></label>}
        <label htmlFor={`${id}-query`}>Buscar contenido (opcional)<input id={`${id}-query`} value={query} maxLength={160} disabled={busy || !available} onChange={event => { setQuery(event.target.value); setReading(null); }} /></label>
      </div>
      <button type="submit" disabled={busy || !available || source === "document" && !path.trim()}>{busy ? "Leyendo contenido…" : "Leer contenido"}</button>
    </form>
    {available && error && <p className={styles.error} role="alert">{error}</p>}
    {available && reading && <section className={styles.readingResult} aria-label="Contenido leído como texto">
      <header><strong>{reading.title || "Contenido del escritorio"}</strong><span>{reading.method === "dom" ? "Texto del navegador" : reading.method === "pdf-text" ? "Texto del PDF" : "Texto del documento"} · {reading.totalChars.toLocaleString("es-CL")} caracteres</span></header>
      {reading.url && <p className={styles.readingAddress}>{reading.url}</p>}
      {reading.warning && <p className={styles.expiry}>{reading.warning}</p>}
      <p className={styles.readingRange}>Bloque desde el carácter {reading.offset.toLocaleString("es-CL")}.</p>
      <pre tabIndex={0} aria-label="Texto extraído del escritorio">{reading.text || "No se encontró texto en este bloque."}</pre>
      {reading.items.length > 0 && <details className={styles.controls}><summary>Enlaces y controles · {reading.items.length}</summary><ul>{reading.items.map(item => <li key={item.ref}><span>{item.role}</span> {item.label}{item.url && <small>{item.url}</small>}</li>)}</ul></details>}
      <div className={styles.actions}>
        {reading.offset > 0 && <button type="button" disabled={busy || !available} onClick={() => void read({ offset: 0 })}>Volver al primer bloque</button>}
        {reading.nextOffset !== null && <button type="button" disabled={busy || !available} onClick={() => void read({ offset: reading.nextOffset! })}>Siguiente bloque de texto</button>}
        {reading.nextElementOffset !== null && <button type="button" disabled={busy || !available} onClick={() => void read({ elementOffset: reading.nextElementOffset! })}>Más enlaces y controles</button>}
      </div>
    </section>}
  </details>;
}

function ComputerScreen({ sessionId, frame, active, working, held, busy, canWork, onFrame, onAction }: { sessionId: string; frame: number; active: boolean; working: boolean; held: boolean; busy: boolean; canWork: boolean; onFrame: (value: number) => void; onAction: (body: Record<string, unknown>) => Promise<void> }) {
  const id = useId(), viewer = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(0), [screenWidth, setScreenWidth] = useState(1280), [fullscreen, setFullscreen] = useState(false);
  const [automatic, setAutomatic] = useState(true), [notice, setNotice] = useState("");
  const [loadedSource, setLoadedSource] = useState(""), [failedSource, setFailedSource] = useState("");
  const [capturedAt, setCapturedAt] = useState(0);
  const screenshotSource = `${api}/sessions/${encodeURIComponent(sessionId)}/screenshot?frame=${frame}${held ? "" : "&passive=1"}`;
  const loading = loadedSource !== screenshotSource && failedSource !== screenshotSource;
  const error = failedSource === screenshotSource ? "No se pudo cargar la captura actual. Comprueba la sesión o vuelve a actualizarla." : "";
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === viewer.current);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.fullscreenElement !== viewer.current) return;
      event.preventDefault(); event.stopPropagation();
      void document.exitFullscreen().catch(() => {});
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("fullscreenchange", changed); document.removeEventListener("keydown", escape, true); };
  }, []);
  useEffect(() => {
    if (!active || !automatic || held || !working || loading || error) return;
    let timer: number | undefined;
    const schedule = () => { window.clearTimeout(timer); if (document.visibilityState !== "hidden") timer = window.setTimeout(() => onFrame(Date.now()), 8000); };
    schedule(); document.addEventListener("visibilitychange", schedule);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", schedule); };
  }, [active, automatic, held, working, loading, error, frame, onFrame]);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === viewer.current) await document.exitFullscreen();
      else if (viewer.current?.requestFullscreen) await viewer.current.requestFullscreen();
      else setNotice("Este navegador no permite pantalla completa. Puedes ampliar la vista con los controles de tamaño.");
    } catch { setNotice("No se pudo abrir la pantalla completa. Puedes ampliar la vista con los controles de tamaño."); }
  }
  return <section ref={viewer} className={styles.viewer} aria-label="Visor del escritorio">
    <div className={styles.viewerHeader}><div><h3>Vista del escritorio</h3><p>{held ? "Control manual · actualización automática pausada" : working ? "Altazor está trabajando" : "Escritorio disponible"}{capturedAt > 0 && <> · captura {new Date(capturedAt).toLocaleTimeString("es-CL")}</>}</p></div><button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}{fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}</button></div>
    <div className={styles.viewerTools} aria-label="Ampliación del escritorio">{[[0, "Vista completa"], [1, "100 %"], [1.5, "150 %"], [2, "200 %"]].map(([value, label]) => <button type="button" key={value} aria-pressed={zoom === value} onClick={() => setZoom(Number(value))}>{label}</button>)}<label className={styles.check}><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} />Actualizar mientras trabaja</label><button type="button" disabled={busy || loading} onClick={() => onFrame(Date.now())}><RefreshCw size={15} aria-hidden="true" />Actualizar captura</button></div>
    <p id={`${id}-help`} className={styles.viewerHint}>{held ? "Haz clic en la captura para elegir un campo. " : "Toma el control para usar el ratón o el teclado. "}Puedes ampliar y desplazar la vista; con teclado, enfócala y usa las flechas. Escape sale de pantalla completa.</p>
    <div className={styles.screen} tabIndex={0} role="region" aria-label="Vista del escritorio con desplazamiento" aria-describedby={`${id}-help`} aria-busy={loading}>
      <Image unoptimized src={screenshotSource} width={1280} height={800} alt="Captura del escritorio privado en contenedor" style={{ ...(zoom ? { width: `${screenWidth * zoom}px`, maxWidth: "none" } : {}), ...(error ? { visibility: "hidden" } : {}) }} onLoad={event => { setScreenWidth(event.currentTarget.naturalWidth); setLoadedSource(screenshotSource); setCapturedAt(Date.now()); }} onError={() => setFailedSource(screenshotSource)} className={held && !loading && !error ? styles.controllable : undefined} onClick={event => { if (!held || busy || !canWork || loading || error) return; const image = event.currentTarget, point = desktopPoint({ x: event.clientX, y: event.clientY }, image.getBoundingClientRect(), { width: image.naturalWidth, height: image.naturalHeight }); if (point) void onAction({ action: "input", input: { action: "click", args: point } }); }} />
      {loading && <span className={styles.frameLoading} role="status">Actualizando captura…</span>}
    </div>
    {error && <p className={styles.error} role="alert">{error}<button type="button" onClick={() => onFrame(Date.now())}>Volver a cargar captura</button></p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
  </section>;
}
export function AltazorComputer(props: PanelProps) {
  return <ComputerPanel key={`${props.causaId || "personal"}:${props.preferredSessionId || "default"}`} {...props} />;
}

function ComputerPanel({ causaId, active = true, preferredSessionId, review }: PanelProps) {
  const uid = useId(), tokenRef = useRef<HTMLInputElement>(null), openedFromLink = useRef(false), selectedRef = useRef(""), selectionEpoch = useRef(0);
  const [status, setStatus] = useState<ComputerStatus | null>(null), [view, setView] = useState<ComputerSessionView | null>(null), [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [linkFailure, setLinkFailure] = useState(false);
  const [observedAt, setObservedAt] = useState(0);
  const [renewConfirmed, setRenewConfirmed] = useState(false), [renewKey, setRenewKey] = useState("");
  const [text, setText] = useState(""), [files, setFiles] = useState<File[]>([]), [approved, setApproved] = useState(false), [messageKey, setMessageKey] = useState(""), [createKey, setCreateKey] = useState("");
  const [frame, setFrame] = useState(0), [manualText, setManualText] = useState("");
  const [inventory, setInventory] = useState<ConnectorInventory | null>(null), [connections, setConnections] = useState<string[]>([]);
  const chat = useRef<HTMLDivElement>(null), followChat = useRef(true);
  const [newMessages, setNewMessages] = useState(false);
  const title = useRef<HTMLHeadingElement>(null), approvalHeading = useRef<HTMLHeadingElement>(null);
  const helpMessage = useRef<HTMLElement>(null), openedReview = useRef(false);
  const query = causaId ? `?causaId=${encodeURIComponent(causaId)}` : "";
  const selectSession = useCallback((id: string) => { selectedRef.current = id; selectionEpoch.current++; followChat.current = true; setNewMessages(false); setSelected(id); setView(null); setRenewConfirmed(false); setRenewKey(""); }, []);
  const refresh = useCallback(async () => {
    const requested = preferredSessionId || new URLSearchParams(location.search).get("escritorio");
    const parameters = new URLSearchParams(query);
    if (requested) parameters.set("sessionId", requested);
    const response = await fetch(`${api}${parameters.size ? `?${parameters}` : ""}`, { cache: "no-store" }), data = await response.json();
    if (!response.ok) { selectSession(""); setStatus(null); setInventory(null); setLinkFailure(Boolean(requested)); throw new Error(data.error || "No se pudo consultar el computador opcional."); }
    setObservedAt(Date.now());
    setStatus(data.computer);
    if (!openedFromLink.current) {
      openedFromLink.current = true;
      if (requested && data.computer.sessions.some((session: { id: string }) => session.id === requested)) selectSession(requested);
    }
    if (data.computer.configured && data.computer.workspaceId) {
      const inventoryReply = await fetch(`/api/altazor/connectors?workspaceId=${encodeURIComponent(data.computer.workspaceId)}`, { cache: "no-store" });
      if (inventoryReply.ok) setInventory((await inventoryReply.json()).connectors); else setInventory(null);
    } else setInventory(null);
  }, [preferredSessionId, query, selectSession]);
  const loadSession = useCallback(async (id: string) => {
    const epoch = selectionEpoch.current;
    const response = await fetch(`${api}/sessions/${encodeURIComponent(id)}`, { cache: "no-store" }), data = await response.json();
    if (selectedRef.current !== id || epoch !== selectionEpoch.current) return;
    setObservedAt(Date.now());
    if (!response.ok) {
      if ([403, 404].includes(response.status)) { selectSession(""); setLinkFailure(true); }
      if (response.status === 410) { setView(null); setLinkFailure(true); }
      throw new Error(data.error || "No se pudo consultar la sesión.");
    }
    setView(data);
  }, [selectSession]);
  useEffect(() => { if (!active) return; let live = true; queueMicrotask(() => { if (live) void refresh().catch(cause => { if (live) setError(cause instanceof Error ? cause.message : "No se pudo consultar el computador."); }).finally(() => { if (live) setLoading(false); }); }); return () => { live = false; }; }, [active, refresh]);
  useEffect(() => {
    if (!active || !selected) return;
    let live = true, running = false;
    const poll = () => { if (!live || running) return; running = true; void loadSession(selected).catch(cause => { if (live) setError(cause instanceof Error ? cause.message : "No se pudo consultar la sesión."); }).finally(() => { running = false; }); };
    queueMicrotask(poll); const timer = setInterval(poll, 6000);
    return () => { live = false; clearInterval(timer); };
  }, [active, selected, loadSession]);
  const chatSignature = view?.turns.map(turn => `${turn.index}:${turn.text}:${turn.working}:${turn.actionCount ?? turn.steps.length}:${turn.help?.stepIndex ?? ""}`).join("|") || "";
  useEffect(() => {
    const element = chat.current;
    if (!element) return;
    if (followChat.current) { element.scrollTop = element.scrollHeight; setNewMessages(false); }
    else setNewMessages(true);
  }, [chatSignature]);
  useEffect(() => {
    if (!active) { openedReview.current = false; return; }
    if (!review || !preferredSessionId || view?.session.id !== preferredSessionId || openedReview.current) return;
    openedReview.current = true;
    const heading = review === "approval" ? approvalHeading.current : helpMessage.current;
    (heading ?? title.current)?.focus();
  }, [active, review, preferredSessionId, view]);
  async function mutate<T>(url: string, body: unknown): Promise<T | null> {
    setBusy(true); setError(""); setNotice("");
    try { const result = await apiMutation<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!result.ok) { setError(result.error); return null; } return result.data; }
    finally { setBusy(false); }
  }
  async function configure(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      const result = await mutate<{ computer: ComputerStatus }>(api, { action: "configure", causaId: causaId || null, endpoint: form.get("endpoint"), token: form.get("token"), provider: form.get("provider"), dedicated: form.get("dedicated") === "on" });
      if (result) { setStatus(result.computer); setNotice("Gateway comprobado y reservado para este profesional y este espacio."); }
    } finally { if (tokenRef.current) tokenRef.current.value = ""; }
  }
  async function verify() {
    if (!status?.workspaceId) return;
    const result = await mutate<{ computer: ComputerStatus }>(api, { action: "verify", workspaceId: status.workspaceId, confirmed: true });
    if (result) { setStatus(result.computer); setNotice("El gateway respondió con un proveedor y contenedores disponibles."); }
  }
  async function start() {
    if (!status?.workspaceId) return;
    const requestId = createKey || operationKey(); setCreateKey(requestId);
    const result = await mutate<{ session: { id: string } }>(`${api}/sessions`, { workspaceId: status.workspaceId, requestId, connectors: [...connections].sort(), confirmed: true });
    if (result) { selectSession(result.session.id); setCreateKey(""); await refresh().catch(() => {}); }
  }
  async function renew() {
    if (!selected || !renewConfirmed) return;
    const requestId = renewKey || operationKey(); setRenewKey(requestId);
    const result = await mutate<ActionReply>(`${api}/sessions/${encodeURIComponent(selected)}/actions`, { action: "renew", requestId, confirmed: true, causaId: causaId || null });
    if (!result) return;
    if (result.action.status !== "completed") { setNotice("No se confirmó la renovación. Compruebe el estado antes de repetirla."); return; }
    selectionEpoch.current++;
    setRenewConfirmed(false); setRenewKey(""); setLinkFailure(false);
    await refresh().catch(() => {}); await loadSession(selected).catch(() => {});
    setNotice("Acceso mantenido. Se conservó la misma sesión del escritorio y sus aplicaciones.");
  }
  async function action(body: Record<string, unknown>) {
    if (!selected) return;
    const result = await mutate<ActionReply>(`${api}/sessions/${encodeURIComponent(selected)}/actions`, { ...body, requestId: operationKey(), confirmed: true });
    if (!result) return;
    if (result.action.status !== "completed") { setNotice("El gateway no confirmó la acción. Compruebe el escritorio antes de repetirla."); return; }
    if (body.action === "close" && result.action.result?.stopped) { selectSession(""); await refresh().catch(() => {}); setNotice("El gateway confirmó que detuvo este escritorio. Sus archivos pueden permanecer en el gateway."); return; }
    if (body.action === "cancel") setNotice(result.action.result?.cancelled ? "El gateway confirmó la cancelación de la tarea." : "El gateway no encontró una tarea cancelable en ese momento. Compruebe el chat.");
    await loadSession(selected).catch(() => {}); setFrame(Date.now());
  }
  async function send() {
    if (!selected || !approved) return;
    const requestId = messageKey || operationKey(); setMessageKey(requestId);
    setBusy(true); setError("");
    try {
      const uploads: ComputerFile[] = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer()); let binary = "";
        for (let index = 0; index < bytes.length; index += 16384) binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
        uploads.push({ name: file.name, mime: file.type, data: btoa(binary) });
      }
      const result = await apiMutation<ActionReply>(`${api}/sessions/${encodeURIComponent(selected)}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, text, files: uploads, confirmed: true }) });
      if (!result.ok) { setError(result.error); return; }
      if (result.data.action.status !== "completed") { setNotice("La tarea quedó sin confirmación. Compruebe el chat antes de continuar; no se reenviará automáticamente."); return; }
      setText(""); setFiles([]); setApproved(false); setMessageKey(""); setNotice("El gateway aceptó la tarea. El chat mostrará su progreso y resultado."); await loadSession(selected).catch(() => {});
    } catch { setError("No se pudo confirmar el envío. Compruebe el chat antes de repetirlo."); }
    finally { setBusy(false); }
  }
  const held = Boolean(view?.session.held), selectedSummary = status?.sessions.find(session => session.id === selected);
  const selectedState = view?.session.state || selectedSummary?.state;
  const selectedExpiry = view?.session.expiresAt || selectedSummary?.expiresAt, renewableUntil = view?.session.renewableUntil || selectedSummary?.renewableUntil;
  const canRenew = Boolean(selectedSummary?.canRenew && renewableUntil && Date.parse(renewableUntil) > observedAt && status?.policyAllowed);
  const canAct = Boolean(selected && view && selectedState === "ready"), canWork = canAct && Boolean(status?.policyAllowed);
  const canCleanup = Boolean(selected && selectedSummary && selectedState !== "closed");
  const needsStop = Boolean(status?.sessions.some(session => session.requiresStop || ["creating", "starting", "ready", "unknown"].includes(session.state)));
  const lastTurn = view?.turns.at(-1);
  return <section className={styles.root} aria-labelledby={`${uid}-title`} data-testid="altazor-computer-panel">
    <header className={styles.header}><div><h2 id={`${uid}-title`} ref={title} tabIndex={-1}>Escritorio de Altazor</h2><p>Encarga una tarea con los archivos que elijas o toma el control para revisar el trabajo.</p></div><Monitor size={24} aria-hidden="true" /></header>
    {error && <p className={styles.error} role="alert">{error}{linkFailure && <> <a href={`/inicio?altazor=computer${causaId ? `&causaId=${encodeURIComponent(causaId)}` : ""}`}>Volver a los escritorios de este ámbito</a></>}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.status} aria-busy={loading}>
      <strong>{loading ? "Consultando escritorio…" : status ? stateLabel[status.state] : "Estado no disponible"}</strong>
      {status?.reason && <p>{status.reason}</p>}
      {status && !status.configured && (
        <p><a className={styles.preparationLink} href="https://github.com/gabrielperezibacache/lexopen/blob/main/docs/ESCRITORIO-ALTAZOR.md" target="_blank" rel="noreferrer">
          Guía de preparación para el equipo principal<ExternalLink size={15} aria-hidden="true" />
          <span className="sr-only"> (abre en otra pestaña)</span>
        </a></p>
      )}
      {status?.configured && <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy || !status.enabled || !status.policyAllowed || needsStop} onClick={start}>Iniciar escritorio privado</button>
        <button type="button" disabled={busy} onClick={verify}><RefreshCw size={15} aria-hidden="true" />Comprobar conexión</button>
      </div>}
    </div>
    {needsStop && <p className={styles.expiry}>Antes de abrir otro escritorio o cambiar sus conexiones, seleccione la sesión anterior y pulse Detener escritorio. El vencimiento del acceso no confirma su cierre.</p>}
    {status?.configured && <details className={styles.setup}><summary>Aplicaciones para el próximo escritorio · {connections.length} elegidas</summary><p>Se abre sin aplicaciones por defecto. Elija expresamente las cuentas que puede usar en esta sesión. Cada acción esperará su decisión en el panel de autorizaciones.</p>{inventory?.gateReady ? inventory.connections.filter(connection => connection.configured && !connection.needsSignIn && !inventory.catalog.find(entry => entry.id === connection.kind)?.blockedReason).map(connection => <label className={styles.check} key={connection.name}><input type="checkbox" checked={connections.includes(connection.name)} disabled={busy} onChange={event => { setConnections(previous => event.target.checked ? [...previous, connection.name] : previous.filter(name => name !== connection.name)); setCreateKey(""); }} />{inventory.catalog.find(entry => entry.id === connection.kind)?.label || connection.kind} · {connection.name}</label>) : <p>El gateway aún no confirmó el refuerzo de permisos de LexOpen. Puede iniciar un escritorio sin conexiones.</p>}<a href={`/inicio?altazor=connectors${causaId ? `&causaId=${encodeURIComponent(causaId)}` : ""}`}>Administrar aplicaciones y cuentas</a></details>}
    {status?.canConfigure && <details className={styles.setup}><summary>Configurar gateway local dedicado</summary><form onSubmit={configure}><label htmlFor={`${uid}-endpoint`}>Dirección local de esta instancia</label><input id={`${uid}-endpoint`} name="endpoint" type="url" required defaultValue="http://127.0.0.1:7488" disabled={busy} /><label htmlFor={`${uid}-provider`}>Nombre del proveedor configurado en el gateway</label><input id={`${uid}-provider`} name="provider" required maxLength={100} disabled={busy} /><label htmlFor={`${uid}-token`}>Autorización del gateway</label><input ref={tokenRef} id={`${uid}-token`} name="token" type="password" autoComplete="off" required minLength={16} maxLength={16000} disabled={busy} /><label className={styles.check}><input name="dedicated" type="checkbox" required disabled={busy} />Esta instancia y sus datos son exclusivos de este profesional y este espacio. Configuré el proveedor directamente en el gateway.</label><button type="submit" disabled={busy}>Comprobar y guardar autorización</button></form></details>}
    {status?.sessions.length ? <div className={styles.sessions}><label htmlFor={`${uid}-session`}>Sesión de este espacio</label><select id={`${uid}-session`} value={selected} disabled={busy} onChange={event => { selectSession(event.target.value); setText(""); setFiles([]); setApproved(false); setMessageKey(""); }}><option value="">Seleccione una sesión</option>{status.sessions.map(session => <option key={session.id} value={session.id}>{stateLabel[session.state] || session.state} · {new Date(session.createdAt).toLocaleString("es-CL")}</option>)}</select></div> : null}
    {selected && <div className={styles.work}>
      <div className={styles.toolbar}><strong>{stateLabel[selectedState || ""] || "Comprobando escritorio…"}</strong><div className={styles.actions}><button type="button" disabled={busy || !canWork} onClick={() => action({ action: "control", hold: !held })}><MousePointer2 size={15} aria-hidden="true" />{held ? "Devolver control" : "Tomar control"}</button><button type="button" disabled={busy || !canCleanup} onClick={() => action({ action: "cancel" })}>Cancelar tarea</button><button type="button" disabled={busy || !canCleanup} onClick={() => action({ action: "close" })}><Square size={14} aria-hidden="true" />Detener escritorio</button></div></div>
      {selectedExpiry && <p className={styles.expiry}>Acceso hasta {new Date(selectedExpiry).toLocaleTimeString("es-CL")}.{renewableUntil && <> Puede mantener este mismo escritorio hasta las {new Date(renewableUntil).toLocaleTimeString("es-CL")}.</>} Al vencer se bloquea el acceso desde ALTAZOR; el gateway puede conservar el escritorio y sus archivos.</p>}
      {canRenew && <form className={styles.manual} onSubmit={event => { event.preventDefault(); void renew(); }}><label className={styles.check}><input type="checkbox" checked={renewConfirmed} disabled={busy} onChange={event => setRenewConfirmed(event.target.checked)} />Confirmo mantener este mismo escritorio durante 20 minutos más, sin superar dos horas desde su apertura.</label><button type="submit" disabled={busy || !renewConfirmed}>Mantener sesión 20 min</button></form>}
      {canAct ? <>
        <ComputerScreen key={selected} sessionId={selected} frame={frame} active={active} working={Boolean(view?.working)} held={held} busy={busy} canWork={canWork} onFrame={setFrame} onAction={action} />
        <ComputerReadingPanel key={`reading:${selected}:${canWork && !held}`} sessionId={selected} available={canWork && !held} />
        {held && canWork && <>
          <div className={styles.actions} aria-label="Teclado del escritorio">
            <button type="button" disabled={busy} onClick={() => action({ action: "input", input: { action: "key", args: { keys: "Return" } } })}>Enter</button>
            <button type="button" disabled={busy} onClick={() => action({ action: "input", input: { action: "key", args: { keys: "Tab" } } })}>Tab</button>
            <button type="button" disabled={busy} onClick={() => action({ action: "input", input: { action: "scroll", args: { direction: "down", amount: 3 } } })}>Desplazar abajo</button>
          </div>
          <form className={styles.manual} onSubmit={event => { event.preventDefault(); void action({ action: "input", input: { action: "type", args: { text: manualText } } }).then(() => setManualText("")); }}>
            <label htmlFor={`${uid}-manual`}>Texto para escribir manualmente en el escritorio</label>
            <input id={`${uid}-manual`} value={manualText} type="password" autoComplete="off" maxLength={2000} disabled={busy} onChange={event => setManualText(event.target.value)} />
            <button type="submit" disabled={busy || !manualText}>Escribir en escritorio</button><p>Se envía al teclado del contenedor, sin incorporarse al chat del modelo.</p>
          </form>
        </>}
      </> : <p className={styles.waiting}><CircleAlert size={18} aria-hidden="true" />El escritorio todavía no está disponible. No se muestra una imagen de demostración.</p>}
      {held && canWork && <AltazorSecretUse key={selected} sessionId={selected} onBusyChange={setBusy} />}
      {view?.session.connectors?.length ? <p className={styles.expiry}>Aplicaciones autorizadas para esta sesión: {view.session.connectors.join(", ")}.</p> : null}
      {view?.approvals?.length ? <section className={styles.approvals} aria-label="Autorizaciones de aplicaciones"><h3 ref={approvalHeading} tabIndex={-1}>Altazor espera tu decisión</h3><p>Revise el destino y el contenido. Autorizar ejecuta esta operación una sola vez.</p>{view.approvals.map(approval => <article key={approval.id}><h4>{approval.connector} · {approval.action}</h4><p>{approval.summary}</p><pre>{JSON.stringify(approval.args, null, 2)}</pre>{!approval.reviewable && <p>El detalle contiene datos ocultos o supera el límite de revisión. Puede rechazarlo y realizar la operación directamente en la aplicación.</p>}<div className={styles.actions}><button type="button" disabled={busy || !canWork || held || !approval.reviewable} onClick={() => action({ action: "connector_approval", approvalId: approval.id, approve: true })}>Autorizar esta operación</button><button type="button" disabled={busy || !canAct} onClick={() => action({ action: "connector_approval", approvalId: approval.id, approve: false })}>Rechazar</button></div>{held && <p>Devuelva el control para ejecutar una operación autorizada.</p>}</article>)}</section> : null}
      <div className={styles.chatHeading}><h3>Conversación del escritorio</h3><span>{view?.working ? "Encargo en curso" : "Mensajes y resultados"}</span></div>
      <div ref={chat} className={styles.chat} role="log" aria-label="Conversación del escritorio" aria-live="polite" aria-relevant="additions text" onScroll={event => {
        const element = event.currentTarget; followChat.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        if (followChat.current) setNewMessages(false);
      }}>{view?.turns.length ? view.turns.map(turn => {
        const help = turn === lastTurn && computerTurnNeedsHelp(turn);
        const actionCount = turn.actionCount ?? turn.steps.length;
        return <article key={turn.index} data-author={turn.from} {...(help ? { ref: helpMessage, tabIndex: -1, "aria-label": "Solicitud de ayuda de Altazor" } : {})}>
          <header><strong>{turn.from === "user" ? "Tú" : turn.from === "assistant" ? "Altazor AI" : "Sistema"}</strong>{(help || turn.working) && <span>{help ? "Necesita tu ayuda" : "Trabajando"}</span>}</header>
          {turn.text && <AltazorMessageContent text={turn.text} plain={turn.from !== "assistant"} />}
          {help && turn.working && <div className={styles.helpHint}>{turn.help?.question && <AltazorMessageContent text={turn.help.question} plain />}<p><a href="/inicio?altazor=help">Responder en Ayuda a distancia</a>. Si necesitas actuar en la pantalla, toma el control y devuélveselo a Altazor cuando termines.</p></div>}
          {actionCount > 0 && <details className={styles.stepDetails}><summary>{actionCount} {actionCount === 1 ? "acción realizada" : "acciones realizadas"} · Ver detalle</summary><ol>{turn.steps.map((step, index) => <li key={`${index}:${step.action}`}><span>{step.action}</span>{step.at && <small>{Number.isNaN(Date.parse(step.at)) ? step.at : new Date(step.at).toLocaleTimeString("es-CL")}</small>}</li>)}</ol></details>}
        </article>;
      }) : <p>Escriba una tarea y elija expresamente sus archivos. La conversación de ALTAZOR y los expedientes no se envían automáticamente.</p>}</div>
      {newMessages && <button className={styles.newMessages} type="button" onClick={() => { if (chat.current) chat.current.scrollTop = chat.current.scrollHeight; followChat.current = true; setNewMessages(false); }}>Ver mensajes nuevos</button>}
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}><label htmlFor={`${uid}-task`}>Tarea para este escritorio</label><textarea id={`${uid}-task`} rows={4} value={text} maxLength={16000} disabled={busy || !canWork || held} onChange={event => { setText(event.target.value); setApproved(false); setMessageKey(""); }} /><label htmlFor={`${uid}-files`}>Archivos elegidos para esta tarea</label><input key={files.length ? "selected" : "empty"} id={`${uid}-files`} type="file" multiple accept={COMPUTER_ATTACHMENT_FORMATS} disabled={busy || !canWork || held} onChange={event => { const chosen = Array.from(event.target.files || []); if (chosen.length > 5 || chosen.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) { setError("Elija hasta cinco archivos y 20 MiB en total."); event.target.value = ""; setFiles([]); return; } setFiles(chosen); setApproved(false); setMessageKey(""); }} />{files.length > 0 && <ul>{files.map((file, index) => <li key={`${file.name}:${index}`}>{file.name} · {(file.size / 1024).toFixed(0)} KiB</li>)}</ul>}<label className={styles.check}><input type="checkbox" checked={approved} disabled={busy || !canWork || held} onChange={event => setApproved(event.target.checked)} />Autorizo enviar esta tarea y sólo estos archivos al gateway y a su proveedor configurado.</label><button type="submit" className={styles.primary} disabled={busy || !canWork || held || !approved || !text.trim()}>{busy ? "Enviando…" : "Enviar tarea al escritorio"}</button></form>
    </div>}
  </section>;
}
