"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, BellRing, BrainCircuit, CircleStop, Ellipsis, Feather, Link2, MessageSquare, Monitor, Paperclip, Settings2, X } from "lucide-react";
import { ResultCard, type AssistantResultItem } from "@/components/inicio/ResultCard";
import { AltazorMark } from "./AltazorMark";
import { AltazorMemory } from "./AltazorMemory";
import { AltazorConnections } from "./AltazorConnections";
import { AltazorComputer } from "./AltazorComputer";
import { AltazorDesktopActivity } from "./AltazorDesktopActivity";
import { AltazorUpdateMessage } from "./AltazorUpdates";
import { AltazorMessageContent } from "./AltazorMessageContent";
import { AltazorExecutionSummary } from "./AltazorExecutionSummary";
import { AltazorIcaros } from "./AltazorIcaros";
import { AltazorHelp } from "./AltazorHelp";
import { useAltazorTimeline, type TimelineTurn } from "./useAltazorTimeline";
import { useAltazorCompanion } from "./AltazorCompanionProvider";
import { withCsrfHeaders } from "@/lib/client-csrf";
import type { ComputerReview } from "@/lib/altazor/computer/types";
import "./AltazorHome.css";
const panes = [{ id: "chat", label: "Conversación", Icon: MessageSquare }, { id: "memory", label: "Memoria", Icon: BrainCircuit }, { id: "computer", label: "Computadora", Icon: Monitor }, { id: "icaros", label: "Ícaros", Icon: Feather }, { id: "help", label: "Ayuda a distancia", Icon: BellRing }] as const;
async function request<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : method, headers: body === undefined ? undefined : withCsrfHeaders({ "Content-Type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || "No se pudo completar la acción. Tu trabajo se conserva."), { status: response.status }); return data;
}
export function AltazorHome({ showDesktopActivity = false }: { showDesktopActivity?: boolean }) {
  const { updates, libraryNotice, setLibraryNotice, initialFailed, pane, visited, conversations, activeId, data, destination, causas, scope, text, setText, attachmentIds, setAttachmentIds, clarification, busy, setBusy, uploading, error, setError, loading, input, textarea, reload, choosePane, leaveCaseContext, send, upload, turnAction, running, hasDelegations, preferenceSaving } = useAltazorCompanion();
  const [desktopSelection, setDesktopSelection] = useState<{ causaId: string | null; id: string | null; review?: ComputerReview } | null>(null);
  const historyRef = useRef<HTMLElement>(null), followLatest = useRef(true);
  const [followingLatest, setFollowingLatest] = useState(true);
  const activeTurn = data?.turns.at(-1);
  const timelineVersion = `${activeTurn?.id ?? ""}/${activeTurn?.status ?? ""}/${data?.conversation.revision ?? ""}`;
  const timeline = useAltazorTimeline(pane === "chat", timelineVersion, Boolean(running) || hasDelegations);
  const entries = [
    ...timeline.turns.map(turn => ({ kind: "turn" as const, date: turn.createdAt, id: turn.id, turn })),
    ...(timeline.readingOlder ? [] : updates.updates).map(update => ({ kind: "update" as const, date: update.occurredAt, id: update.id, update })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const latest = entries.at(-1);
  const latestVersion = latest?.kind === "turn" ? `${latest.id}/${latest.turn.status}/${latest.turn.assistantText}/${latest.turn.progress?.completed}/${latest.turn.results.length}` : latest?.id;
  useEffect(() => {
    const region = historyRef.current;
    if (pane === "chat" && region && followLatest.current) region.scrollTop = region.scrollHeight;
  }, [latestVersion, pane]);
  async function handleTurnAction(turn: typeof timeline.turns[number], action: TurnAction) {
    try { await turnAction(turn, action, turn.conversationId); }
    finally { timeline.refresh(); }
  }
  const currentCase = data?.conversation.causaId ?? conversations.find(item => item.id === activeId)?.causaId ?? (activeId ? null : scope || null);
  const currentLabel = currentCase ? causas.find(causa => causa.id === currentCase)?.rit || causas.find(causa => causa.id === currentCase)?.titulo || "Causa seleccionada" : null;
  function sendMessage() {
    if (!text.trim() || busy || uploading || running || loading || preferenceSaving || !destination?.permitted) return;
    followLatest.current = true;
    timeline.returnToLatest();
    void send();
  }
  return <div className="altazor-home" data-testid="altazor-home">
    <div className="altazor-identity-row"><header className="altazor-header"><AltazorMark size={48} state={busy || running || hasDelegations ? "thinking" : "ready"} label />{(busy || running || hasDelegations) && <span className="altazor-muted" role="status">Trabajando…</span>}</header>
    <div className="altazor-toolbar-actions"><details className="altazor-tools"><summary title="Mi asistente" aria-label="Mi asistente"><Settings2 size={18} /><span className="sr-only">Mi asistente</span></summary><nav className="altazor-tabs" aria-label="Herramientas de ALTAZOR">{panes.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={pane === id ? "page" : undefined} onClick={() => { if (id === "computer") setDesktopSelection(null); choosePane(id); }}><Icon size={18} /><span>{label}</span></button>)}</nav><div className="altazor-send-settings"><Link className="btn btn-ghost" href="/configuracion#preferencias-altazor">Configurar Altazor</Link></div></details></div></div>
    {pane !== "chat" && <button type="button" className="btn btn-ghost altazor-return-to-chat" onClick={() => choosePane("chat")}><ArrowLeft size={16} aria-hidden="true" />Volver a la conversación</button>}
    <div hidden={pane !== "chat"}>
      <section className="altazor-conversation" aria-label="Conversación con ALTAZOR">
        {error && <p role="alert" className="altazor-error">{error}{initialFailed && <> <a href="/inicio">Volver a Mi jornada</a></>}</p>}{libraryNotice && <p role="status" className="altazor-notice">Guardado en tu biblioteca: <Link href={`/biblioteca/${libraryNotice.id}`}>{libraryNotice.title}</Link>. Se aplicaron tus preferencias de conversión y conservación.</p>}
        <section className="altazor-history" aria-label="Historial con Altazor" ref={historyRef} onScroll={event => { const region = event.currentTarget; followLatest.current = region.scrollHeight-region.scrollTop-region.clientHeight<80; setFollowingLatest(followLatest.current); }} tabIndex={0}>
          {(timeline.hasMore || timeline.readingOlder) && <div className="altazor-history-controls">
            {timeline.hasMore && <button type="button" className="btn btn-ghost" onClick={() => { followLatest.current = false; timeline.loadOlder(); }}>Ver mensajes anteriores</button>}
            {timeline.readingOlder && <button type="button" className="btn btn-ghost" onClick={() => { followLatest.current = true; timeline.returnToLatest(); }}>Volver a lo reciente</button>}
          </div>}
          {timeline.status === "unavailable" && <p role="status" className="altazor-muted">No pude recuperar el historial. <button className="btn btn-ghost" type="button" onClick={timeline.refresh}>Reintentar</button></p>}
          {entries.length === 0 && (timeline.status === "loading" ? <p role="status">Recuperando conversación…</p> : <div className="altazor-welcome"><p>¿En qué trabajamos hoy?</p></div>)}
          {entries.length > 0 && <ol className="altazor-turns">{entries.map(entry => (
            <li key={entry.id}>{entry.kind === "update"
              ? <AltazorUpdateMessage update={entry.update} />
              : <AltazorTurnMessage turn={entry.turn} busy={busy} onAction={action => void handleTurnAction(entry.turn, action)} />}
            </li>
          ))}</ol>}
        {updates.status === "unavailable" && <p role="status" className="altazor-muted">No pude comprobar si hay avisos nuevos. Puedes <Link href="/plazos">abrir Plazos</Link> mientras vuelvo a intentarlo.</p>}
        </section>
        {!followingLatest && !timeline.readingOlder && <button type="button" className="btn btn-ghost altazor-latest" onClick={() => { followLatest.current = true; setFollowingLatest(true); historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "instant" }); }}>Ir al mensaje más reciente<ArrowUp size={15} aria-hidden="true" className="altazor-latest-arrow" /></button>}
        {clarification && <p className="altazor-clarification" role="status"><strong>Altazor</strong>{clarification}</p>}
        {currentCase && <div className="altazor-context-line">
          <span className="altazor-case-context">{currentLabel}</span>
          <button className="btn btn-ghost" type="button" aria-label="Quitar el contexto de la causa" title="Quitar el contexto de la causa"
            disabled={busy || uploading || attachmentIds.length > 0} onClick={leaveCaseContext}><X size={16} aria-hidden="true" /></button>
        </div>}
        <div className="altazor-composer" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files); }}>
          <label className="sr-only" htmlFor="altazor-message">Mensaje para ALTAZOR</label><textarea id="altazor-message" aria-describedby="altazor-keyboard-help" data-testid="inicio-composer" ref={textarea} placeholder="Escribe a ALTAZOR…" value={text} onChange={event => setText(event.target.value)} maxLength={8000} rows={3}
            onPaste={event => {
              const files = event.clipboardData?.files;
              if (!files?.length) return;
              event.preventDefault();
              void upload(files);
            }}
            onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} />
        {destination && !destination.permitted && <p className="altazor-connection-notice">Conecta ALTAZOR para empezar. <Link href="/configuracion#preferencias-altazor">Conectar</Link></p>}
          <div className="altazor-composer-footer"><button type="button" className="btn btn-ghost" disabled={uploading || busy} onClick={() => input.current?.click()}><Paperclip size={18} /> {uploading ? "Preparando archivo…" : "Adjuntar"}</button><button type="button" className="btn btn-ghost altazor-composer-apps" aria-label="Aplicaciones" title="Aplicaciones" onClick={() => choosePane("connectors")}><Link2 size={18} aria-hidden="true" /><span>Aplicaciones</span></button><input ref={input} type="file" aria-label="Archivos para adjuntar al mensaje de ALTAZOR" className="sr-only" multiple accept=".pdf,.epub,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.json,.html,.htm" onChange={event => void upload(event.target.files)} />{text.length >= 7200 && <span aria-live="polite">{8000-text.length} caracteres disponibles</span>}<button type="button" className="btn btn-primary" aria-label="Enviar mensaje a ALTAZOR" data-testid="inicio-send" disabled={!text.trim() || busy || uploading || Boolean(running) || preferenceSaving || loading || !destination?.permitted} onClick={sendMessage}><ArrowUp size={18} /> Enviar</button></div>
          <p id="altazor-keyboard-help" className="altazor-keyboard-help">Enter para enviar · Mayús + Enter para un salto de línea</p>
        </div>
        {data?.attachments.length ? <details className="altazor-attachment-archive" open={attachmentIds.length ? true : undefined}><summary>Archivos de este contexto <span>{data.attachments.length}</span></summary><ul className="altazor-attachments">{data.attachments.map(file => <li key={file.id}><span>{file.sourceName}{file.status !== "ready" && <small>{file.status === "processing" ? "Preparando…" : "Revisar archivo"}</small>}</span>{attachmentIds.includes(file.id) ? <button type="button" className="btn btn-ghost" disabled={busy} aria-label={`No adjuntar ${file.sourceName}`} onClick={() => setAttachmentIds(previous => previous.filter(id => id !== file.id))}><X size={16} /></button> : <button type="button" className="btn btn-ghost" disabled={busy} aria-label={`Adjuntar de nuevo ${file.sourceName}`} onClick={() => setAttachmentIds(previous => [...previous,file.id])}><Paperclip size={16} /></button>}<details className="altazor-attachment-options"><summary aria-label={`Opciones de ${file.sourceName}`}><Ellipsis size={18} /></summary><div><a href={`/api/altazor/conversations/${activeId}/attachments/${file.id}/original`}>Descargar original</a><button type="button" disabled={busy||uploading} onClick={()=>{setBusy(true);setError("");void request<{book:{id:string;title:string}}>(`/api/altazor/conversations/${activeId}/attachments/${file.id}/library`,{}).then(result=>setLibraryNotice(result.book)).catch(reason=>setError(reason.message)).finally(()=>setBusy(false));}}>Guardar en biblioteca</button><button type="button" disabled={busy} aria-label={`Retirar archivo ${file.sourceName}`} onClick={() => { void request(`/api/altazor/conversations/${activeId}/attachments/${file.id}`,{},"DELETE").then(() => { setAttachmentIds(previous => previous.filter(id => id !== file.id)); return reload(activeId); }).catch(reason => setError(reason.message)); }}>Retirar de la conversación</button></div></details></li>)}</ul></details> : null}

      </section>
      {showDesktopActivity && <AltazorDesktopActivity causaId={currentCase} refreshKey={timelineVersion} onOpen={(id, causaId, review) => {
        setDesktopSelection({ causaId, id, review });
        choosePane("computer");
      }} />}
    </div>

    {visited.includes("memory") && <div hidden={pane !== "memory"}><AltazorMemory causaId={currentCase} /></div>}
    {visited.includes("connectors") && <div hidden={pane !== "connectors"}><AltazorConnections causaId={currentCase} /></div>}
    {visited.includes("computer") && <div hidden={pane !== "computer"}>
      <AltazorComputer causaId={desktopSelection ? desktopSelection.causaId : currentCase} active={pane === "computer"} preferredSessionId={desktopSelection?.id ?? null} review={desktopSelection?.review} />
    </div>}
    {visited.includes("icaros") && <div hidden={pane !== "icaros"}><AltazorIcaros causaId={currentCase} active={pane === "icaros"} /></div>}
    {visited.includes("help") && <div hidden={pane !== "help"}><AltazorHelp active={pane === "help"} /></div>}

  </div>;
}


type TurnAction = "confirm" | "reject" | "execute" | "cancel";

function AltazorTurnMessage({ turn, busy, onAction }: { turn: TimelineTurn; busy: boolean; onAction: (action: TurnAction) => void }) {
  if (turn.available === false) return <p className="altazor-muted">Contenido no disponible. Cambió el acceso a una fuente.</p>;
  const canAct = turn.conversationStatus === "active";
  const inProgress = ["queued", "running", "delegating"].includes(turn.status);
  const cards = turn.results.filter(item => item.result.card && !(item.result.card.type === "respuesta-libre" && item.result.message === turn.assistantText));
  return <>
    <div className="altazor-user-message">
      <span>Tú{turn.causaId && <small className="altazor-turn-context">{turn.conversationTitle}</small>}</span>
      <AltazorMessageContent text={turn.userText} plain />
      {inProgress && <small>Encargo del {new Date(turn.createdAt).toLocaleString("es-CL")}.</small>}
    </div>
    <div className="altazor-answer">
      <div className="altazor-answer-author">
        <AltazorMark size={36} state={inProgress ? "thinking" : "reading"} />
        <strong>Altazor</strong>
      </div>
      {turn.progress && <AltazorExecutionSummary progress={turn.progress} status={turn.status} />}
      {turn.assistantText && !inProgress && turn.status !== "awaiting_confirmation" && <AltazorMessageContent text={turn.assistantText} />}
      {!turn.progress && inProgress && <p className="altazor-muted">{turn.status === "queued" ? "Tu encargo está en cola." : "Estoy trabajando en tu encargo. El resultado aparecerá aquí."}</p>}
      {turn.sourceRefs.length > 0 && <ul className="altazor-inline-sources">
        {turn.sourceRefs.map((source, index) => <li key={`${source.href}-${index}`}><Link href={source.href}>R{index + 1} · {source.title}</Link></li>)}
      </ul>}
      {canAct && turn.plan && turn.status === "awaiting_confirmation" && <div className="altazor-plan">
        <h4>Revisa el encargo completo</h4>
        {!turn.progress && turn.assistantText && <AltazorMessageContent text={turn.assistantText} />}
        <details><summary>{turn.plan.steps.length === 1 ? "Ver la acción propuesta" : `Ver las ${turn.plan.steps.length} acciones propuestas`}</summary><ol>{turn.plan.steps.map((step, index) => <li key={index}>{step.preview}</li>)}</ol></details>
        <button type="button" className="btn btn-primary" data-testid="plan-confirm" disabled={busy} onClick={() => onAction("confirm")}>Confirmar estos cambios</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onAction("reject")}>Descartar plan</button>
      </div>}
      {!inProgress && cards.length > 0 && <details className="altazor-result-details"><summary>Ver resultados y detalles · {cards.length}</summary>{cards.map((item, index) => <ResultCard key={index} item={{ toolId: item.toolId, ...item.result } as AssistantResultItem} />)}</details>}
      {Boolean(turn.delegations?.length) && <details className="altazor-result-details"><summary>Ver encargos a Ícaros · {turn.delegations!.length}</summary><ul className="altazor-delegation-list">{turn.delegations!.map(job => <li key={job.id}><strong>{job.icaroName || "Ícaro no disponible"}</strong><span>{({ queued: "En cola", running: "Trabajando", completed: "Completado", failed: "No completado", cancelled: "Detenido", blocked: "Acceso no disponible", interrupted: "Interrumpido" } as Record<string, string>)[job.status] || "Estado por consultar"}</span>{job.available && job.result && <AltazorMessageContent text={job.result} />}</li>)}</ul><Link href={`/inicio?${new URLSearchParams({ altazor: "icaros", ...(turn.causaId ? { causaId: turn.causaId } : {}) })}`}>Abrir mis Ícaros</Link></details>}
      {canAct && inProgress && <div className="altazor-running">
        {!turn.progress && <span role="status">{turn.status === "queued" ? "Encargo en cola" : "Trabajando…"}</span>}
        {turn.status === "queued" && !busy && <button type="button" className="btn btn-primary" onClick={() => onAction("execute")}>Ejecutar solicitud</button>}
        <button type="button" className="btn btn-outline" onClick={() => onAction("cancel")}><CircleStop size={16} /> Detener</button>
      </div>}
      {["failed", "interrupted", "blocked", "cancelled", "partial"].includes(turn.status) && <p className="altazor-muted">
        {turn.status === "cancelled" ? "Solicitud detenida." : turn.errorCode === "queue_expired"
          ? "Esta solicitud esperó más de un día. Revisa el encargo y vuelve a enviarlo para retomarlo."
          : "La solicitud requiere revisión. Conservamos lo registrado; puedes preparar un nuevo mensaje."}
      </p>}
    </div>
  </>;
}
