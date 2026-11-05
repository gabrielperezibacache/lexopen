"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { operationKey, createSubmissionKeys } from "@/lib/client-submission-key";
import { withCsrfHeaders } from "@/lib/client-csrf";
import type { AltazorDestination } from "@/lib/altazor/types";
import type { AltazorSelectedSource } from "./AltazorSources";
type Conversation = { id: string; title: string; causaId: string | null; scopeKey: string; revision: number; status: string };
type Attachment = { id: string; sourceName: string; byteSize: number; status: string };
type Turn = { id: string; ordinal: number; status: string; userText: string; assistantText: string; available?: boolean; attachmentIds: string[]; sourceRefs: { title: string; href: string }[]; results: { toolId: string; result: { ok: boolean; message: string; card?: Record<string, unknown> | null; undoToken?: string | null } }[]; plan: { id: string; steps: { toolId: string; preview: string }[] } | null; errorCode: string | null; createdAt: string };
export type ConversationData = { conversation: Conversation; turns: Turn[]; attachments: Attachment[]; destination: AltazorDestination; hasMore: boolean; beforeOrdinal: number | null };
export type Pane = "chat" | "memory" | "connectors" | "computer";
type CompanionPreference = { activeConversationId: string | null; selectionUnavailable: boolean; memoryEnabled: boolean; backgroundEnabled: boolean; revision: number };
async function request<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : method, headers: body === undefined ? undefined : withCsrfHeaders({ "Content-Type": "application/json" }), body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || "No se pudo completar la acción. Tu trabajo se conserva."), { status: response.status }); return data;
}
function reflectConversationLocation(id:string){
  if(location.pathname!=="/inicio")return;
  const url=new URL(location.href);if(id){url.searchParams.set("conversacion",id);url.searchParams.delete("causaId");url.searchParams.delete("documentoId");url.searchParams.delete("intencion");url.searchParams.delete("run");}else url.searchParams.delete("conversacion");
  if(url.href!==location.href)history.replaceState(null,"",url.pathname+url.search);
}
export function useAltazorCompanionState() {
  const [linkedDocumentId, setLinkedDocumentId] = useState("");
  const [libraryNotice,setLibraryNotice]=useState<{id:string;title:string}|null>(null);
  const [initialFailed, setInitialFailed] = useState(false);
  const [pane, setPane] = useState<Pane>("chat"), [visited, setVisited] = useState<Pane[]>(["chat"]), [conversations, setConversations] = useState<Conversation[]>([]), [activeId, setActiveId] = useState(""), [data, setData] = useState<ConversationData | null>(null), [destination, setDestination] = useState<AltazorDestination | null>(null), [causas, setCausas] = useState<{ id: string; titulo: string; rit: string | null }[]>([]), [scope, setScope] = useState(""), [text, setText] = useState(""), [sources, setSources] = useState<AltazorSelectedSource[]>([]), [attachmentIds, setAttachmentIds] = useState<string[]>([]), [allowRemote, setAllowRemote] = useState(false), [useMemory, setUseMemory] = useState(true), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [preference, setPreference] = useState<CompanionPreference>({ activeConversationId: null, memoryEnabled: true, backgroundEnabled: true, revision: 0, selectionUnavailable: false });
  const preferenceWrites = useRef<Promise<unknown>>(Promise.resolve());
  function savePreference(changes: Partial<Pick<CompanionPreference, "activeConversationId" | "memoryEnabled" | "backgroundEnabled">>) {
    preferenceWrites.current = preferenceWrites.current.catch(() => {}).then(async () => {
      const current = await request<CompanionPreference>("/api/altazor/companion");
      const next = await request<CompanionPreference>("/api/altazor/companion", { ...changes, expectedRevision: current.revision }, "PATCH");
      setPreference(next); return next;
    }).catch(reason => setError(reason instanceof Error ? reason.message : "No se pudo guardar la preferencia"));
    return preferenceWrites.current;
  }
  const conversationRequest = useRef(createSubmissionKeys()), turnRequest = useRef(createSubmissionKeys()), input = useRef<HTMLInputElement>(null), textarea = useRef<HTMLTextAreaElement>(null), drafts = useRef(new Map<string, string>()), liveId = useRef("");
  const loadList = useCallback(async () => {
    const result = await request<{ conversations: Conversation[]; destination: AltazorDestination }>("/api/altazor/conversations"); setConversations(result.conversations); setDestination(result.destination); return result;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(location.pathname==="/inicio"?location.search:""), requestedCase = params.get("causaId");
    const resourcesUrl = `/api/altazor/resources${requestedCase ? `?causaId=${encodeURIComponent(requestedCase)}` : ""}`;
    Promise.all([fetch("/api/altazor/conversations", { signal: controller.signal, cache: "no-store" }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; }), fetch(resourcesUrl, { signal: controller.signal, cache: "no-store" }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "No se pudo comprobar el ámbito solicitado."); return result; }), fetch("/api/altazor/companion", { signal: controller.signal, cache: "no-store" }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })]).then(([result, resources, saved]) => {
      if (controller.signal.aborted) return; setLinkedDocumentId(params.get("documentoId") || ""); setConversations(result.conversations); setDestination(result.destination); setCausas(resources.causas || []); setPreference(saved); setUseMemory(saved.memoryEnabled);
      if (saved.selectionUnavailable) setError("La conversación anterior ya no está disponible. Elige otra o comienza una nueva.");
      const selectedPane = params.get("altazor");
      if (["chat", "memory", "connectors", "computer"].includes(selectedPane || "")) { setPane(selectedPane as Pane); setVisited(["chat", selectedPane as Pane]); }
      if (requestedCase && (resources.causas || []).some((causa: {id:string}) => causa.id === requestedCase)) setScope(requestedCase);
      const id = params.get("conversacion") || (!requestedCase ? saved.activeConversationId : null);
      if (id) { liveId.current = id; setActiveId(id); }
    }).catch(reason => { if (!controller.signal.aborted) { setInitialFailed(true); setError(reason.message || "No se pudo recuperar ALTAZOR. Vuelve a intentarlo."); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
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
    void savePreference({ activeConversationId: id || null });
    setLinkedDocumentId(""); drafts.current.set(activeId || "new", text); liveId.current = id; setActiveId(id); setData(null); setText(drafts.current.get(id || "new") || ""); setSources([]); setAttachmentIds([]); setAllowRemote(false); setError(""); turnRequest.current = createSubmissionKeys();
    if(!id)conversationRequest.current=createSubmissionKeys();reflectConversationLocation(id);choosePane("chat");
  }
  async function ensureConversation() {
    if (liveId.current) { reflectConversationLocation(liveId.current);return liveId.current; }
    const result = await request<{ conversation: Conversation }>("/api/altazor/conversations", { requestId: conversationRequest.current.forPayload({ title: text.trim().slice(0,160) || "Nueva conversación", causaId: scope || null }), title: text.trim().slice(0,160) || "Nueva conversación", causaId: scope || null });
    void savePreference({ activeConversationId: result.conversation.id });
    liveId.current = result.conversation.id; setActiveId(result.conversation.id); await reload(result.conversation.id); await loadList();
    reflectConversationLocation(result.conversation.id);
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
  function synchronizeLocation(pathname:string,search:string) {
    if (loading||pathname!=="/inicio") return;
    const params = new URLSearchParams(search), intent = params.get("intencion"), requestedCase = params.get("causaId"), requestedConversation = params.get("conversacion"), selectedPane = params.get("altazor");
    if (!intent && !requestedConversation && !selectedPane&&!requestedCase) { if(liveId.current)reflectConversationLocation(liveId.current);return; }
    const controller=new AbortController();
    const read=async<T,>(url:string):Promise<T>=>{const response=await fetch(url,{signal:controller.signal,cache:"no-store"}),value=await response.json();if(!response.ok)throw Error(value.error||"La selección no está disponible");return value;};
    // Both the linked cause and any explicit conversation are checked before replacing a draft.
    void Promise.all([read<{causas:{id:string;titulo:string;rit:string|null}[]}>(`/api/altazor/resources${requestedCase?`?causaId=${encodeURIComponent(requestedCase)}`:""}`),requestedConversation?read<ConversationData>(`/api/altazor/conversations/${encodeURIComponent(requestedConversation)}`):Promise.resolve(null)]).then(([resources,selected])=>{
      if(selected&&requestedCase&&selected.conversation.causaId!==requestedCase)throw Error("La conversación no pertenece a la causa solicitada. Tu borrador se conserva.");
      if(controller.signal.aborted)return;setCausas(resources.causas || []);
      if(selected&&requestedConversation!==liveId.current)chooseConversation(selected.conversation.id);
      if(!selected&&(intent||requestedCase&&(liveId.current||scope!==requestedCase))){chooseConversation("");setScope(requestedCase||"");setText("");}
      if (intent) {
        setLinkedDocumentId(params.get("documentoId") || ""); setText(intent.slice(0,8000)); choosePane("chat");
        const url = new URL(location.href); url.searchParams.delete("intencion"); url.searchParams.delete("run"); history.replaceState(null, "", url.pathname + url.search);
      }
      if (selectedPane && ["chat", "memory", "connectors", "computer"].includes(selectedPane)) choosePane(selectedPane as Pane);
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  }
  return { linkedDocumentId, libraryNotice, setLibraryNotice, initialFailed, pane, visited, conversations, activeId, data, setData, destination, causas, scope, setScope, text, setText, sources, setSources, attachmentIds, setAttachmentIds, allowRemote, setAllowRemote, useMemory, setUseMemory, busy, setBusy, uploading, error, setError, loading, input, textarea, liveId, reload, choosePane, chooseConversation, send, upload, turnAction, running, preference, savePreference,synchronizeLocation };
}
