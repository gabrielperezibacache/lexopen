"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, BrainCircuit, CircleStop, Ellipsis, Link2, MessageSquare, Monitor, Paperclip, Settings2, X } from "lucide-react";
import { ResultCard, type AssistantResultItem } from "@/components/inicio/ResultCard";
import { AltazorMark } from "./AltazorMark";
import { AltazorMemory } from "./AltazorMemory";
import { AltazorConnections } from "./AltazorConnections";
import { AltazorComputer } from "./AltazorComputer";
import { AltazorDesktopActivity } from "./AltazorDesktopActivity";
import { AltazorUpdateMessage } from "./AltazorUpdates";
import { useAltazorTimeline, type TimelineTurn } from "./useAltazorTimeline";
import { useAltazorCompanion } from "./AltazorCompanionProvider";
import { withCsrfHeaders } from "@/lib/client-csrf";
import "./AltazorHome.css";
const panes = [{ id: "chat", label: "Conversación", Icon: MessageSquare }, { id: "memory", label: "Memoria", Icon: BrainCircuit }, { id: "connectors", label: "Conexiones", Icon: Link2 }, { id: "computer", label: "Computadora", Icon: Monitor }] as const;
async function request<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : method, headers: body === undefined ? undefined : withCsrfHeaders({ "Content-Type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || "No se pudo completar la acción. Tu trabajo se conserva."), { status: response.status }); return data;
}
export function AltazorHome({ showDesktopActivity = false }: { showDesktopActivity?: boolean }) {
  const { updates, libraryNotice, setLibraryNotice, initialFailed, pane, visited, conversations, activeId, data, destination, causas, scope, text, setText, attachmentIds, setAttachmentIds, clarification, busy, setBusy, uploading, error, setError, loading, input, textarea, reload, choosePane, leaveCaseContext, send, upload, turnAction, running, preference, preferenceSaving, savePreference } = useAltazorCompanion();
  const [desktopSelection, setDesktopSelection] = useState<{ causaId: string | null; id: string | null } | null>(null);
  const historyRef = useRef<HTMLElement>(null), followLatest = useRef(true);
  const activeTurn = data?.turns.at(-1);
  const timelineVersion = `${activeTurn?.id ?? ""}/${activeTurn?.status ?? ""}/${data?.conversation.revision ?? ""}`;
  const timeline = useAltazorTimeline(pane === "chat", timelineVersion, Boolean(running));
  const entries = [
    ...timeline.turns.map(turn => ({ kind: "turn" as const, date: turn.createdAt, id: turn.id, turn })),
    ...(timeline.readingOlder ? [] : updates.updates).map(update => ({ kind: "update" as const, date: update.occurredAt, id: update.id, update })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const latest = entries.at(-1);
  const latestVersion = latest?.kind === "turn" ? `${latest.id}/${latest.turn.status}/${latest.turn.assistantText}` : latest?.id;
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
    <div className="altazor-identity-row"><header className="altazor-header"><AltazorMark size={48} state={busy || running ? "thinking" : "ready"} label />{(busy || running) && <span className="altazor-muted" role="status">Trabajando…</span>}</header>
    <div className="altazor-toolbar-actions"><details className="altazor-tools"><summary title="Mi asistente" aria-label="Mi asistente"><Settings2 size={18} /><span className="sr-only">Mi asistente</span></summary><nav className="altazor-tabs" aria-label="Herramientas de ALTAZOR">{panes.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={pane === id ? "page" : undefined} onClick={() => { if (id === "computer") setDesktopSelection(null); choosePane(id); }}><Icon size={18} /><span>{label}</span></button>)}</nav><div className="altazor-send-settings"><label><input type="checkbox" disabled={preferenceSaving} checked={preference.memoryEnabled} onChange={event => void savePreference({ memoryEnabled: event.target.checked })} /> Usar recuerdos guardados</label><label><input type="checkbox" disabled={preferenceSaving} checked={preference.backgroundEnabled} onChange={event => void savePreference({ backgroundEnabled: event.target.checked })} /> Continuar los encargos en segundo plano</label><p>La conexión se utiliza al enviar un mensaje. Las acciones que cambian tu trabajo se revisan antes de ejecutarse.</p><p>Conexión: {destination ? destination.provider === "codex" ? "Tu cuenta de Codex" : destination.remote ? "IA del estudio" : "IA local" : "Sin configurar"}.</p></div></details></div></div>
    {pane !== "chat" && <button type="button" className="btn btn-ghost altazor-return-to-chat" onClick={() => choosePane("chat")}><ArrowLeft size={16} aria-hidden="true" />Volver a la conversación</button>}
    <div hidden={pane !== "chat"}>
      <section className="altazor-conversation" aria-label="Conversación con ALTAZOR">
        {error && <p role="alert" className="altazor-error">{error}{initialFailed && <> <a href="/inicio">Volver a Mi jornada</a></>}</p>}{libraryNotice && <p role="status" className="altazor-notice">Guardado en tu biblioteca: <Link href={`/biblioteca/${libraryNotice.id}`}>{libraryNotice.title}</Link>. Se aplicaron tus preferencias de conversión y conservación.</p>}
        <section className="altazor-history" aria-label="Historial con Altazor" ref={historyRef} onScroll={event => { const region = event.currentTarget; followLatest.current = region.scrollHeight-region.scrollTop-region.clientHeight<80; }} tabIndex={0}>
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
        {clarification && <p className="altazor-clarification" role="status"><strong>Altazor</strong>{clarification}</p>}
        {currentCase && <div className="altazor-context-line">
          <span className="altazor-case-context">{currentLabel}</span>
          <button className="btn btn-ghost" type="button" aria-label="Quitar el contexto de la causa" title="Quitar el contexto de la causa"
            disabled={busy || uploading || attachmentIds.length > 0} onClick={leaveCaseContext}><X size={16} aria-hidden="true" /></button>
        </div>}
        <div className="altazor-composer" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files); }}>
          <label className="sr-only" htmlFor="altazor-message">Mensaje para ALTAZOR</label><textarea id="altazor-message" data-testid="inicio-composer" ref={textarea} placeholder="Escribe a ALTAZOR…" value={text} onChange={event => setText(event.target.value)} maxLength={8000} rows={3} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} />
        {destination && !destination.permitted && <p className="altazor-connection-notice">Conecta ALTAZOR para empezar. <button type="button" onClick={() => choosePane("connectors")}>Conectar</button></p>}
          <div className="altazor-composer-footer"><button type="button" className="btn btn-ghost" disabled={uploading || busy} onClick={() => input.current?.click()}><Paperclip size={18} /> {uploading ? "Preparando archivo…" : "Adjuntar"}</button><input ref={input} type="file" className="sr-only" multiple accept=".pdf,.epub,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.json,.html,.htm" onChange={event => void upload(event.target.files)} />{text.length >= 7200 && <span aria-live="polite">{8000-text.length} caracteres disponibles</span>}<button type="button" className="btn btn-primary" aria-label="Enviar mensaje a ALTAZOR" data-testid="inicio-send" disabled={!text.trim() || busy || uploading || Boolean(running) || preferenceSaving || loading || !destination?.permitted} onClick={sendMessage}><ArrowUp size={18} /> Enviar</button></div>
        </div>
        {data?.attachments.length ? <details className="altazor-attachment-archive" open={attachmentIds.length ? true : undefined}><summary>Archivos de este contexto <span>{data.attachments.length}</span></summary><ul className="altazor-attachments">{data.attachments.map(file => <li key={file.id}><span>{file.sourceName}{file.status !== "ready" && <small>{file.status === "processing" ? "Preparando…" : "Revisar archivo"}</small>}</span>{attachmentIds.includes(file.id) ? <button type="button" className="btn btn-ghost" disabled={busy} aria-label={`No adjuntar ${file.sourceName}`} onClick={() => setAttachmentIds(previous => previous.filter(id => id !== file.id))}><X size={16} /></button> : <button type="button" className="btn btn-ghost" disabled={busy} aria-label={`Adjuntar de nuevo ${file.sourceName}`} onClick={() => setAttachmentIds(previous => [...previous,file.id])}><Paperclip size={16} /></button>}<details className="altazor-attachment-options"><summary aria-label={`Opciones de ${file.sourceName}`}><Ellipsis size={18} /></summary><div><a href={`/api/altazor/conversations/${activeId}/attachments/${file.id}/original`}>Descargar original</a><button type="button" disabled={busy||uploading} onClick={()=>{setBusy(true);setError("");void request<{book:{id:string;title:string}}>(`/api/altazor/conversations/${activeId}/attachments/${file.id}/library`,{}).then(result=>setLibraryNotice(result.book)).catch(reason=>setError(reason.message)).finally(()=>setBusy(false));}}>Guardar en biblioteca</button><button type="button" disabled={busy} aria-label={`Retirar archivo ${file.sourceName}`} onClick={() => { void request(`/api/altazor/conversations/${activeId}/attachments/${file.id}`,{},"DELETE").then(() => { setAttachmentIds(previous => previous.filter(id => id !== file.id)); return reload(activeId); }).catch(reason => setError(reason.message)); }}>Retirar de la conversación</button></div></details></li>)}</ul></details> : null}

      </section>
      {showDesktopActivity && <AltazorDesktopActivity causaId={currentCase} onOpen={(id, causaId) => {
        setDesktopSelection({ causaId, id });
        choosePane("computer");
      }} />}
    </div>

    {visited.includes("memory") && <div hidden={pane !== "memory"}><AltazorMemory causaId={currentCase} /></div>}
    {visited.includes("connectors") && <div hidden={pane !== "connectors"}><AltazorConnections causaId={currentCase} /></div>}
    {visited.includes("computer") && <div hidden={pane !== "computer"}>
      <AltazorComputer causaId={desktopSelection ? desktopSelection.causaId : currentCase} active={pane === "computer"} preferredSessionId={desktopSelection?.id ?? null} />
    </div>}

  </div>;
}


type TurnAction = "confirm" | "reject" | "execute" | "cancel";

function AltazorTurnMessage({ turn, busy, onAction }: { turn: TimelineTurn; busy: boolean; onAction: (action: TurnAction) => void }) {
  if (turn.available === false) return <p className="altazor-muted">Contenido no disponible. Cambió el acceso a una fuente.</p>;
  const canAct = turn.conversationStatus === "active";
  const inProgress = turn.status === "queued" || turn.status === "running";
  return <>
    <div className="altazor-user-message">
      <span>Tú{turn.causaId && <small className="altazor-turn-context">{turn.conversationTitle}</small>}</span>
      <p>{turn.userText}</p>
      {inProgress && <small>Encargo del {new Date(turn.createdAt).toLocaleString("es-CL")}.</small>}
    </div>
    <div className="altazor-answer">
      <div className="altazor-answer-author">
        <AltazorMark size={36} state={turn.status === "running" ? "thinking" : "reading"} />
        <strong>Altazor</strong>
      </div>
      {turn.assistantText && <p className="altazor-prose">{turn.assistantText}</p>}
      {turn.sourceRefs.length > 0 && <ul className="altazor-inline-sources">
        {turn.sourceRefs.map((source, index) => <li key={`${source.href}-${index}`}><Link href={source.href}>R{index + 1} · {source.title}</Link></li>)}
      </ul>}
      {canAct && turn.plan && turn.status === "awaiting_confirmation" && <div className="altazor-plan">
        <h4>Revisa los cambios propuestos</h4>
        <ol>{turn.plan.steps.map((step, index) => <li key={index}>{step.preview}</li>)}</ol>
        <button type="button" className="btn btn-primary" data-testid="plan-confirm" disabled={busy} onClick={() => onAction("confirm")}>Confirmar estos cambios</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onAction("reject")}>Descartar plan</button>
      </div>}
      {turn.results.filter(item => item.result.card && !(item.result.card.type === "respuesta-libre" && item.result.message === turn.assistantText)).map((item, index) => <ResultCard key={index} item={{ toolId: item.toolId, ...item.result } as AssistantResultItem} />)}
      {canAct && inProgress && <div className="altazor-running">
        <span role="status">{turn.status === "queued" ? "Encargo en cola" : "Trabajando…"}</span>
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
