"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, BookOpen, BrainCircuit, CircleStop, GraduationCap, History, Link2, MessageSquare, Monitor, Paperclip, Plus, X } from "lucide-react";
import { operationKey, createSubmissionKeys } from "@/lib/client-submission-key";
import { withCsrfHeaders } from "@/lib/client-csrf";
import { HoyCard, PlazosCard, ActividadCard, CausasCard } from "@/components/inicio/InicioCards";
import { ResultCard, type AssistantResultItem } from "@/components/inicio/ResultCard";
import type { InicioInitialData } from "@/components/inicio/types";
import type { AltazorDestination } from "@/lib/altazor/types";
import { AltazorMark } from "./AltazorMark";
import { AltazorSources, type AltazorSelectedSource } from "./AltazorSources";
import { AltazorMemory } from "./AltazorMemory";
import { AltazorConnections } from "./AltazorConnections";
import { AltazorAcademic } from "./AltazorAcademic";
import { AltazorComputer } from "./AltazorComputer";
import "./AltazorHome.css";
type Conversation = { id: string; title: string; causaId: string | null; scopeKey: string; revision: number; status: string };
type Attachment = { id: string; sourceName: string; byteSize: number; status: string };
type Turn = { id: string; ordinal: number; status: string; userText: string; assistantText: string; available?: boolean; attachmentIds: string[]; sourceRefs: { title: string; href: string }[]; results: { toolId: string; result: { ok: boolean; message: string; card?: Record<string, unknown> | null; undoToken?: string | null } }[]; plan: { id: string; steps: { toolId: string; preview: string }[] } | null; errorCode: string | null };
type ConversationData = { conversation: Conversation; turns: Turn[]; attachments: Attachment[]; destination: AltazorDestination; hasMore: boolean; beforeOrdinal: number | null };
type Pane = "chat" | "memory" | "connectors" | "academic" | "computer";
const panes = [{ id: "chat", label: "Conversación", Icon: MessageSquare }, { id: "memory", label: "Memoria", Icon: BrainCircuit }, { id: "connectors", label: "Conexiones", Icon: Link2 }, { id: "academic", label: "Academia", Icon: GraduationCap }, { id: "computer", label: "Computadora", Icon: Monitor }] as const;
async function request<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : method, headers: body === undefined ? undefined : withCsrfHeaders({ "Content-Type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || "No se pudo completar la acción. Tu trabajo se conserva."), { status: response.status }); return data;
}
export function AltazorHome({ initialData }: { initialData: InicioInitialData }) {
  const [libraryNotice,setLibraryNotice]=useState<{id:string;title:string}|null>(null);
  const [pane, setPane] = useState<Pane>("chat"), [visited, setVisited] = useState<Pane[]>(["chat"]), [conversations, setConversations] = useState<Conversation[]>([]), [activeId, setActiveId] = useState(""), [data, setData] = useState<ConversationData | null>(null), [destination, setDestination] = useState<AltazorDestination | null>(null), [causas, setCausas] = useState<{ id: string; titulo: string; rit: string | null }[]>([]), [scope, setScope] = useState(""), [text, setText] = useState(""), [sources, setSources] = useState<AltazorSelectedSource[]>([]), [attachmentIds, setAttachmentIds] = useState<string[]>([]), [allowRemote, setAllowRemote] = useState(false), [useMemory, setUseMemory] = useState(false), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const conversationRequest = useRef(createSubmissionKeys()), turnRequest = useRef(createSubmissionKeys()), input = useRef<HTMLInputElement>(null), textarea = useRef<HTMLTextAreaElement>(null), drafts = useRef(new Map<string, string>()), liveId = useRef("");
  const loadList = useCallback(async () => {
    const result = await request<{ conversations: Conversation[]; destination: AltazorDestination }>("/api/altazor/conversations"); setConversations(result.conversations); setDestination(result.destination); return result;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetch("/api/altazor/conversations", { signal: controller.signal, cache: "no-store" }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; }), fetch("/api/altazor/resources", { signal: controller.signal, cache: "no-store" }).then(response => response.ok ? response.json() : { causas: [] })]).then(([result, resources]) => {
      if (controller.signal.aborted) return; setConversations(result.conversations); setDestination(result.destination); setCausas(resources.causas || []);
      const params = new URLSearchParams(location.search);
      const selectedPane = params.get("altazor");
      if (panes.some(item => item.id === selectedPane)) { setPane(selectedPane as Pane); setVisited(["chat", selectedPane as Pane]); }
      const requestedCase = params.get("causaId");
      if (requestedCase && (resources.causas || []).some((causa: {id:string}) => causa.id === requestedCase)) setScope(requestedCase);
      const id = params.get("conversacion");
      if (id && result.conversations.some((item: Conversation) => item.id === id)) { liveId.current = id; setActiveId(id); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message || "No se pudo recuperar ALTAZOR. Vuelve a intentarlo."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const reload = useCallback(async (id: string) => {
    try {
      const result = await request<ConversationData>(`/api/altazor/conversations/${encodeURIComponent(id)}`);
      if (liveId.current === id) { setData(result); setDestination(result.destination); }
      return result;
    } catch (reason) {
      if (liveId.current === id) { setData(null); setSources([]); setAttachmentIds([]); setError(reason instanceof Error ? reason.message : "No se pudo revalidar la conversación. Tu mensaje pendiente se conserva."); }
      throw reason;
    }
  }, []);
  useEffect(() => {
    if (!activeId) return;
    let active = true;
    void request<ConversationData>(`/api/altazor/conversations/${encodeURIComponent(activeId)}`).then(result => { if (active) { setData(result); setDestination(result.destination); } }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [activeId]);
  const running = data?.turns.find(turn => ["queued", "running"].includes(turn.status));
  useEffect(() => {
    if (!activeId) return;
    const timer = window.setInterval(() => { void reload(activeId).catch(() => {}); }, running ? 1800 : 15000);
    return () => window.clearInterval(timer);
  }, [activeId, running, reload]);
  useEffect(() => {
    if (!text.trim()) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [text]);
  function choosePane(next: Pane) { setPane(next); setVisited(previous => previous.includes(next) ? previous : [...previous, next]); }
  function chooseConversation(id: string) {
    drafts.current.set(activeId || "new", text); liveId.current = id; setActiveId(id); setData(null); setText(drafts.current.get(id || "new") || ""); setSources([]); setAttachmentIds([]); setAllowRemote(false); setError(""); turnRequest.current = createSubmissionKeys();
    const url = new URL(location.href); if (id) url.searchParams.set("conversacion", id); else { url.searchParams.delete("conversacion"); conversationRequest.current = createSubmissionKeys(); }
    history.replaceState(null, "", url.pathname + url.search); choosePane("chat");
  }
  async function ensureConversation() {
    if (liveId.current) return liveId.current;
    const result = await request<{ conversation: Conversation }>("/api/altazor/conversations", { requestId: conversationRequest.current.forPayload({ title: text.trim().slice(0,160) || "Nueva conversación", causaId: scope || null }), title: text.trim().slice(0,160) || "Nueva conversación", causaId: scope || null });
    liveId.current = result.conversation.id; setActiveId(result.conversation.id); await reload(result.conversation.id); await loadList();
    const url = new URL(location.href); url.searchParams.set("conversacion", result.conversation.id); history.replaceState(null, "", url.pathname + url.search);
    return result.conversation.id;
  }
  async function send() {
    if (!text.trim() || busy || uploading) return; setBusy(true); setError("");
    try {
      const id = await ensureConversation(), current = await reload(id);
      const payload = { text, attachmentIds, sources: sources.map(source => source.input), destinationKey: current.destination.key, allowRemote, useMemory };
      const result = await request<{ turnId: string }>(`/api/altazor/conversations/${id}/turns`, { ...payload, requestId: turnRequest.current.forPayload(payload), expectedRevision: current.conversation.revision });
      turnRequest.current.complete(payload);
      setText(current => current === text ? "" : current); drafts.current.delete(id); drafts.current.delete("new"); setAttachmentIds([]); setAllowRemote(false); turnRequest.current = createSubmissionKeys(); await reload(id);
      const completed = await request<ConversationData>(`/api/altazor/conversations/${id}/turns/${result.turnId}/execute`, {}); if (liveId.current === id) setData(completed); await loadList();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar el mensaje. Revisa su estado antes de reintentar."); if (liveId.current) await reload(liveId.current).catch(() => {}); }
    finally { setBusy(false); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || uploading || busy) return; setUploading(true); setError("");
    try {
      const id = await ensureConversation();
      for (const file of Array.from(files)) {
        const form = new FormData(); form.append("file", file); form.append("requestId", operationKey());
        const response = await fetch(`/api/altazor/conversations/${id}/attachments`, { method: "POST", headers: withCsrfHeaders(), body: form }), result = await response.json();
        if (!response.ok) throw new Error(result.error || `No se pudo preparar ${file.name}`);
        setAttachmentIds(previous => previous.includes(result.attachment.id) ? previous : [...previous, result.attachment.id]);
      }
      await reload(id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo preparar el archivo"); if (liveId.current) await reload(liveId.current).catch(() => {}); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  }
  async function turnAction(turn: Turn, action: "confirm" | "reject" | "execute" | "cancel") {
    if (!activeId) return; if (action !== "cancel") setBusy(true); setError("");
    try {
      await request(`/api/altazor/conversations/${activeId}/turns/${turn.id}/${action === "reject" ? "confirm" : action}`, action === "confirm" || action === "reject" ? { confirm: action === "confirm" } : {});
      await reload(activeId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo actualizar la solicitud"); }
    finally { if (action !== "cancel") setBusy(false); }
  }
  const currentCase = data?.conversation.causaId ?? conversations.find(item => item.id === activeId)?.causaId ?? (activeId ? null : scope || null), currentLabel = currentCase ? causas.find(causa => causa.id === currentCase)?.rit || "Causa seleccionada" : "Espacio personal";
  return <div className="altazor-home" data-testid="altazor-home">
    <header className="altazor-header"><AltazorMark size={86} state={busy ? "thinking" : "ready"} label /><div><h2>Tu trabajo, conectado.</h2><p>Conversa, prepara documentos y vuelve siempre a sus fuentes.</p></div></header>
    <nav className="altazor-tabs" aria-label="Herramientas de ALTAZOR">{panes.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={pane === id ? "page" : undefined} onClick={() => choosePane(id)}><Icon size={18} /><span>{label}</span></button>)}</nav>
    <div hidden={pane !== "chat"}>
      <section className="altazor-conversation" aria-label="Conversación con ALTAZOR">
        <div className="altazor-chat-toolbar"><div>{!activeId ? <label className="altazor-context-label">Trabajar en · privado<select value={scope} onChange={event => { setScope(event.target.value); setSources([]); }}><option value="">Mi espacio personal</option>{causas.map(causa => <option key={causa.id} value={causa.id}>{causa.rit ? `${causa.rit} · ` : ""}{causa.titulo}</option>)}</select></label> : <><span className="altazor-scope">{currentLabel} · Privado</span><h3>{data?.conversation.title || "Recuperando conversación…"}</h3></>}</div><div className="altazor-toolbar-actions"><details><summary><History size={17} /> Conversaciones</summary><ul className="altazor-conversation-list">{conversations.map(conversation => <li key={conversation.id}><button type="button" aria-current={activeId === conversation.id ? "true" : undefined} disabled={busy || uploading} onClick={() => chooseConversation(conversation.id)}>{conversation.title}<small>{conversation.causaId ? "Causa" : "Personal"}</small></button></li>)}{conversations.length === 0 && <li>Todavía no tienes conversaciones guardadas.</li>}</ul></details><button type="button" className="btn btn-outline" disabled={busy || uploading} onClick={() => chooseConversation("")}><Plus size={16} /> Nueva</button></div></div>

        {error && <p role="alert" className="altazor-error">{error}</p>}{libraryNotice && <p role="status" className="altazor-notice">Guardado en tu biblioteca: <Link href={`/biblioteca/${libraryNotice.id}`}>{libraryNotice.title}</Link>. Se aplicaron tus preferencias de conversión y conservación.</p>}
        <div className="altazor-composer" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files); }}>
          <label className="sr-only" htmlFor="altazor-message">Mensaje para ALTAZOR</label><textarea id="altazor-message" data-testid="inicio-composer" ref={textarea} placeholder="Cuéntame qué necesitas preparar…" value={text} onChange={event => setText(event.target.value)} maxLength={8000} rows={3} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void send(); } }} />
        <div className="altazor-send-settings"><p>Destino: <strong>{destination?.endpoint || "Comprobando configuración…"}</strong>{destination?.model ? ` · ${destination.model}` : ""}</p>{destination?.remote && <label><input type="checkbox" checked={allowRemote} onChange={event => setAllowRemote(event.target.checked)} /> Autorizo enviar este mensaje, los adjuntos elegidos como texto y el contexto seleccionado a este destino.</label>}{destination && !destination.permitted && <p>La IA no está disponible con la configuración o los permisos actuales. Puedes revisar <button type="button" onClick={() => choosePane("connectors")}>Conexiones</button>.</p>}</div>
          <div className="altazor-composer-footer"><button type="button" className="btn btn-ghost" disabled={uploading || busy} onClick={() => input.current?.click()}><Paperclip size={18} /> {uploading ? "Preparando archivo…" : "Adjuntar"}</button><input ref={input} type="file" className="sr-only" multiple accept=".pdf,.epub,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.json,.html,.htm" onChange={event => void upload(event.target.files)} /><span>{text.length}/8000</span><button type="button" className="btn btn-primary" aria-label="Enviar mensaje a ALTAZOR" data-testid="inicio-send" disabled={!text.trim() || busy || uploading || Boolean(running) || !destination?.permitted || Boolean(destination?.remote && !allowRemote)} onClick={() => void send()}><ArrowUp size={18} /> Enviar</button></div>
        </div>
        {data?.attachments.length ? <ul className="altazor-attachments">{data.attachments.map(file => <li key={file.id}><label><input type="checkbox" checked={attachmentIds.includes(file.id)} disabled={busy} onChange={event => setAttachmentIds(previous => event.target.checked ? [...previous,file.id] : previous.filter(id => id !== file.id))} /><span>{file.sourceName}<small>{(file.byteSize/1024).toFixed(0)} KiB · {file.status}</small></span></label><a href={`/api/altazor/conversations/${activeId}/attachments/${file.id}/original`} aria-label={`Descargar ${file.sourceName}`}>Descargar</a><button type="button" className="btn btn-ghost" disabled={busy||uploading} onClick={()=>{setBusy(true);setError("");void request<{book:{id:string;title:string}}>(`/api/altazor/conversations/${activeId}/attachments/${file.id}/library`,{}).then(result=>setLibraryNotice(result.book)).catch(reason=>setError(reason.message)).finally(()=>setBusy(false));}}>Guardar en biblioteca</button><button type="button" disabled={busy} aria-label={`Retirar archivo ${file.sourceName}`} onClick={() => { void request(`/api/altazor/conversations/${activeId}/attachments/${file.id}`,{},"DELETE").then(() => { setAttachmentIds(previous => previous.filter(id => id !== file.id)); return reload(activeId); }).catch(reason => setError(reason.message)); }}><X size={16} /></button></li>)}</ul> : null}
        <div className="altazor-send-settings"><label><input type="checkbox" checked={useMemory} onChange={event => setUseMemory(event.target.checked)} /> Usar mi memoria confirmada en este espacio</label></div>
        <details className="altazor-source-disclosure"><summary><BookOpen size={17} /> Elegir fuentes para este mensaje <span>{sources.length} seleccionadas</span></summary><AltazorSources key={currentCase || "personal"} causaId={currentCase} refreshKey={libraryNotice?.id} selected={sources} onChange={setSources} /></details>
        <section className="altazor-history" aria-label="Historial de esta conversación" tabIndex={0}>
        {loading ? <p role="status">Recuperando tu espacio…</p> : !data?.turns.length ? <div className="altazor-welcome"><p>¿En qué trabajamos hoy?</p><div className="altazor-prompts">{initialData.suggestions.slice(0,3).map(suggestion => <button type="button" key={suggestion.label} onClick={() => { setText(suggestion.prompt); textarea.current?.focus(); }}>{suggestion.label}</button>)}<button type="button" onClick={() => choosePane("academic")}>Preparar una investigación</button></div></div> : <ol className="altazor-turns">{data.turns.map(turn => <li key={turn.id}>
          {turn.available === false ? <p className="altazor-muted">Este mensaje depende de material que ya no está disponible con tus permisos actuales.</p> : <><div className="altazor-user-message"><span>Tú</span><p>{turn.userText}</p></div><div className="altazor-answer"><div className="altazor-answer-author"><AltazorMark size={36} state={turn.status === "running" ? "thinking" : "reading"} /><strong>ALTAZOR</strong></div>{turn.assistantText && <p className="altazor-prose">{turn.assistantText}</p>}{turn.sourceRefs?.length > 0 && <ul className="altazor-inline-sources">{turn.sourceRefs.map((source, index) => <li key={`${source.href}-${index}`}><Link href={source.href}>R{index+1} · {source.title}</Link></li>)}</ul>}
            {turn.plan && turn.status === "awaiting_confirmation" && <div className="altazor-plan"><h4>Revisa los cambios propuestos</h4><ol>{turn.plan.steps.map((step, index) => <li key={index}>{step.preview}</li>)}</ol><button type="button" className="btn btn-primary" data-testid="plan-confirm" disabled={busy} onClick={() => void turnAction(turn,"confirm")}>Confirmar estos cambios</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void turnAction(turn,"reject")}>Descartar plan</button></div>}
            {turn.results?.filter(item => item.result.card).map((item,index) => <ResultCard key={index} item={{ toolId:item.toolId, ...item.result } as AssistantResultItem} />)}
            {["queued","running"].includes(turn.status) && <div className="altazor-running" role="status"><span>{turn.status === "queued" ? "Solicitud guardada. Lista para ejecutar." : "Trabajando con tu selección…"}</span>{turn.status === "queued" && !busy && <button type="button" className="btn btn-primary" onClick={() => void turnAction(turn,"execute")}>Ejecutar solicitud</button>}<button type="button" className="btn btn-outline" onClick={() => void turnAction(turn,"cancel")}><CircleStop size={16} /> Detener</button></div>}
            {["failed","interrupted","blocked","cancelled","partial"].includes(turn.status) && <p className="altazor-muted">{turn.status === "cancelled" ? "Solicitud detenida." : "La solicitud requiere revisión. Conservamos lo registrado; puedes preparar un nuevo mensaje."}</p>}
          </div></>}
        </li>)}</ol>}
        {data?.hasMore && <button type="button" className="btn btn-ghost" onClick={() => { const id = activeId; void request<ConversationData>(`/api/altazor/conversations/${id}?beforeOrdinal=${data.beforeOrdinal}`).then(previous => { if (liveId.current !== id || previous.conversation.id !== id) return; setData(current => current?.conversation.id === id ? { ...current, turns: [...previous.turns.filter(turn => !current.turns.some(existing => existing.id === turn.id)),...current.turns], hasMore: previous.hasMore, beforeOrdinal: previous.beforeOrdinal } : current); }).catch(reason => { if (liveId.current === id) setError(reason.message); }); }}>Cargar mensajes anteriores</button>}
        </section>
        {currentCase && <div className="altazor-case-links"><Link href={`/causas/${currentCase}`}>Expediente</Link><Link href={`/causas/${currentCase}/audiencias`}>Audiencias</Link><Link href={`/causas/${currentCase}/escritos`}>Escritos</Link><Link href={`/causas/${currentCase}/mesa`}>Mesa del asistente</Link></div>}
      </section>
    </div>
    {visited.includes("memory") && <div hidden={pane !== "memory"}><AltazorMemory causaId={currentCase} /></div>}
    {visited.includes("connectors") && <div hidden={pane !== "connectors"}><AltazorConnections causaId={currentCase} /></div>}
    {visited.includes("academic") && <div hidden={pane !== "academic"}><AltazorAcademic /></div>}
    {visited.includes("computer") && <div hidden={pane !== "computer"}><AltazorComputer causaId={currentCase} /></div>}
    <details className="altazor-day"><summary>Mi jornada · agenda y trabajo reciente</summary><div className="altazor-day-grid"><HoyCard eventos={initialData.hoy.eventos} plazos={initialData.hoy.plazos} /><PlazosCard plazos={initialData.plazosProximos} /><CausasCard items={initialData.causasRecientes} /><ActividadCard items={initialData.actividad} /></div></details>
  </div>;
}
