"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Mic, MonitorUp, RefreshCw, Square } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { notifyCaseDocumentsChanged } from "@/lib/causas/document-events";
import type { HearingQuote } from "@/lib/hearings/citations";
import type { HearingLiveAudioClipView as Clip, HearingLiveAudioSessionView as SessionDetail, HearingLiveAudioView as AudioView, HearingLiveAudioMutation as AudioMutation } from "@/lib/audio/live-types";
import "./hearing-live-audio.css";
type PendingClip = { requestId: string; sequence: number; blob: Blob; name: string };
export type HearingCaptureState = { recording: boolean; pending: number; busy: boolean; closing: boolean; unconfirmed: boolean; error: string; notice: string };
type ClipFinalization = { sessionId: string; promise: Promise<void>; resolve: () => void; completed: boolean; valid: boolean };
type CachedAudio = { sessionId: string; clips: PendingClip[]; at: number; recoverable: boolean; finalization?: Promise<void> };
const pendingAudio = new Map<string, CachedAudio>();
const finalizations = new Map<string, Set<ClipFinalization>>();
const cacheLifetime = 8 * 60 * 60 * 1000;
function cachedAudio(key: string) {
  const now = performance.now();
  for (const [id, value] of pendingAudio) if (now - value.at > cacheLifetime) pendingAudio.delete(id);
  return pendingAudio.get(key);
}
function rememberAudio(key: string, sessionId: string | undefined, clips: PendingClip[], recoverable = false, finalization?: Promise<void>) {
  const previous = cachedAudio(key);
  // React can clean up a fresh, empty instance before it has authorized/restored
  // another instance's suspended buffer. That cleanup does not own the buffer.
  if (!sessionId) return;
  if (!clips.length && !finalization) {
    if (recoverable && previous?.sessionId === sessionId && previous.recoverable) return;
    if (previous?.sessionId === sessionId) pendingAudio.delete(key);
    return;
  }
  pendingAudio.delete(key);
  if (pendingAudio.size >= 20) pendingAudio.delete(pendingAudio.keys().next().value!);
  const supported = clips.filter(item => item.blob.size <= 4 * 1024 * 1024).slice(0,2);
  if (supported.length || finalization) pendingAudio.set(key, { sessionId, clips: supported, at: performance.now(), recoverable: recoverable || Boolean(previous?.sessionId === sessionId && previous.recoverable), ...(finalization ? { finalization } : {}) });
}
function beginFinalization(key: string, sessionId: string): ClipFinalization {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  const value = { sessionId, promise, resolve, completed: false, valid: true };
  const current = finalizations.get(key) || new Set<ClipFinalization>(); current.add(value); finalizations.set(key, current);
  return value;
}
function finishFinalization(key: string, value: ClipFinalization) {
  value.completed = true; value.resolve();
  const current = finalizations.get(key); current?.delete(value); if (!current?.size) finalizations.delete(key);
}
function revokeAudio(key: string) {
  pendingAudio.delete(key);
  for (const value of finalizations.get(key) || []) { value.valid = false; value.resolve(); }
  finalizations.delete(key);
}
type Failure = Error & { status?: number };
const maxQueue = 2;
const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MiB`;
async function readAudio(url: string, signal?: AbortSignal): Promise<AudioView> {
  const response = await fetch(url, { cache: "no-store", signal }), body = await response.json().catch(() => null);
  if (!response.ok || !body) throw Object.assign(new Error(body?.error || "No se pudo comprobar la captura. Vuelva a actualizarla."), { status: response.status });
  return body;
}
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
/** Each recorder is stopped to produce an independently decodable file. */
export function HearingLiveAudioPanel({ causaId, workspaceId, active, canWrite, onSelection, onCitationUnavailable, onChanged, onAccessLost, onBusy, registerGuard, onCaptureState, registerStopCapture }: {
  causaId: string; workspaceId: string; active: boolean; canWrite: boolean;
  onSelection: (selection: { quote: HearingQuote; label: string }, text: string, clipId: string) => boolean;
  onCitationUnavailable: (clipId: string) => void;
  onChanged: () => void; onAccessLost: (message: string) => void; onBusy: (busy: boolean) => void;
  registerGuard: (guard: (() => Promise<boolean>) | null) => void;
  onCaptureState?: (state: HearingCaptureState | null) => void;
  registerStopCapture?: (stop: (() => void) | null) => void;
}) {
  const base = `/api/causas/${causaId}/hearings/${workspaceId}/live/audio`;
  const cacheKey = `${causaId}:${workspaceId}`;
  const [view, setView] = useState<AudioView>(), [detail, setDetail] = useState<SessionDetail>();
  const [title, setTitle] = useState("Captura de audiencia"), [source, setSource] = useState<"microphone" | "tab">("microphone"), [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [pending, setPending] = useState<PendingClip[]>([]), [selected, setSelected] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [blocked, setBlocked] = useState(false), [older, setOlder] = useState<Clip[]>([]), [cursor, setCursor] = useState<number | null>();
  const [supported, setSupported] = useState({ microphone: false, tab: false });
  const [closing, setClosing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const stopButton = useRef<HTMLButtonElement>(null);
  const [startUnconfirmed, setStartUnconfirmed] = useState(false);
  const host = useRef<HTMLElement>(null), mounted = useRef(true), activeRef = useRef(active), session = useRef<SessionDetail | undefined>(undefined), selectedRef = useRef("");
  const stream = useRef<MediaStream | null>(null), recorder = useRef<MediaRecorder | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturing = useRef(false), opening = useRef(false), finalizing = useRef(false), captureGeneration = useRef(0), queue = useRef<PendingClip[]>([]), uploading = useRef(false), wantClose = useRef(false), autoSave = useRef(true), denied = useRef(false), nextSequence = useRef(0);
  const startRequest = useRef<{ requestId: string; title: string } | null>(null), stopRequest = useRef<{ requestId: string; sessionId: string } | null>(null), retryRequests = useRef(new Map<string, string>());
  const restored = useRef(false);
  const currentFinalization = useRef<ClipFinalization | null>(null);
  const chosenClip = useRef<{ id: string; sequence: number; sessionId: string } | null>(null);
  const callbacks = useRef({ onChanged, onAccessLost, onBusy, onSelection, onCitationUnavailable });
  useEffect(() => { callbacks.current = { onChanged, onAccessLost, onBusy, onSelection, onCitationUnavailable }; }, [onChanged, onAccessLost, onBusy, onSelection, onCitationUnavailable]);
  const publishQueue = useCallback(() => { if (!denied.current) rememberAudio(cacheKey, session.current?.id, queue.current); if (mounted.current) setPending([...queue.current]); }, [cacheKey]);
  const release = useCallback(() => {
    capturing.current = false; if (timer.current) clearTimeout(timer.current); timer.current = null;
    const current = recorder.current; if (current && current.state !== "inactive") { finalizing.current = true; current.stop(); }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (mounted.current) { setRecording(false); setSettingsOpen(true); }
  }, []);
  const deny = useCallback((reason: Failure) => {
    if (![401, 403, 404].includes(reason.status || 0)) return false;
    denied.current = true; captureGeneration.current++; release(); queue.current = []; session.current = undefined; selectedRef.current = "";
    revokeAudio(cacheKey);
    if (mounted.current) { setBlocked(true); setDetail(undefined); setView(undefined); setPending([]); setOlder([]); setConsent(false); setClosing(false); setError(reason.message); callbacks.current.onAccessLost(reason.message); }
    return true;
  }, [release, cacheKey]);
  const publishSession = useCallback((value: SessionDetail) => {
    session.current = value;
    if (mounted.current) { setDetail(value); setSelected(value.id); selectedRef.current = value.id; setView(previous => previous ? { ...previous, sessions: [value, ...previous.sessions.filter(item => item.id !== value.id)] } : previous); }
  }, []);
  const refresh = useCallback(async (id = selectedRef.current) => {
    try {
      const value = await readAudio(base + (id ? `?sessionId=${encodeURIComponent(id)}` : ""));
      if (!mounted.current || denied.current) return;
      setView(value);
      if (capturing.current && (!value.canWrite || !value.config.canCapture)) { autoSave.current = false; wantClose.current = true; setClosing(true); release(); setNotice("La configuración o el acceso cambió. La captura se detuvo; revise el audio pendiente antes de continuar."); }
      if (id && selectedRef.current === id && value.session) {
        publishSession(value.session); setOlder([]); setCursor(undefined);
        let held = cachedAudio(cacheKey);
        if (!restored.current && held?.sessionId === id && held.recoverable) {
          if (held.finalization) await held.finalization;
          if (!mounted.current || denied.current || selectedRef.current !== id) return;
          held = cachedAudio(cacheKey);
          if (held?.sessionId === id && held.clips.length) { restored.current = true; queue.current = [...held.clips]; autoSave.current = false; wantClose.current = true; setRecording(false); setBusy(false); setClosing(true); publishQueue(); setNotice("Se recuperó audio pendiente de esta pestaña después de comprobar su acceso. Revise y guarde los tramos; no se enviaron automáticamente. Esta copia temporal dura ocho horas y no sobrevive a recargar o cerrar la aplicación."); }
        }
      } else if (!selectedRef.current && value.sessions[0]) { const held = cachedAudio(cacheKey), selected = value.sessions.find(item => item.id === held?.sessionId)?.id || value.sessions[0].id; selectedRef.current = selected; setSelected(selected); }
      const chosen = chosenClip.current;
      if (chosen) {
        let checked = value.session?.id === chosen.sessionId ? value.session.clips.find(clip => clip.id === chosen.id) : undefined;
        if (!checked) checked = (await readAudio(`${base}?sessionId=${encodeURIComponent(chosen.sessionId)}&before=${chosen.sequence + 1}`)).session?.clips.find(clip => clip.id === chosen.id);
        if (mounted.current && chosenClip.current?.id === chosen.id && !checked?.available) { chosenClip.current = null; callbacks.current.onCitationUnavailable(chosen.id); }
      }
      setError("");
    } catch (reason) { const failure = reason as Failure; if (!deny(failure) && mounted.current) setError(failure.message); }
  }, [base, deny, publishSession, publishQueue, release, cacheKey]);
  const closeSession = useCallback(async () => {
    const current = session.current; if (!current || current.status === "stopped" || queue.current.length || uploading.current || capturing.current || finalizing.current || denied.current) return;
    if (!stopRequest.current || stopRequest.current.sessionId !== current.id) stopRequest.current = { requestId: crypto.randomUUID(), sessionId: current.id };
    const result = await apiMutation<AudioMutation>(`${base}/${current.id}/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: stopRequest.current.requestId }) });
    if (!mounted.current) return;
    if (!result.ok) { if (!deny(Object.assign(new Error(result.error), { status: result.status }))) setError(result.error); return; }
    stopRequest.current = null; wantClose.current = false; pendingAudio.delete(cacheKey); setClosing(false); publishSession(result.data.session); setNotice("Captura cerrada. Los originales y las transcripciones guardadas permanecen en la causa.");
  }, [base, deny, publishSession, cacheKey]);
  const drain = useCallback(async () => {
    if (uploading.current || denied.current || !session.current) return;
    const generation = captureGeneration.current;
    uploading.current = true; if (mounted.current) setBusy(true);
    try {
      while (queue.current.length && session.current && !denied.current) {
        const item = queue.current[0], form = new FormData(); form.set("file", item.blob, item.name); form.set("requestId", item.requestId); form.set("sequence", String(item.sequence));
        const control = new AbortController(), timeout = setTimeout(() => control.abort(), 150_000);
        const result = await apiMutation<AudioMutation>(`${base}/${session.current.id}/clips`, { method: "POST", body: form, signal: control.signal }); clearTimeout(timeout);
        if (!mounted.current || denied.current || generation !== captureGeneration.current) return;
        if (!result.ok) {
          autoSave.current = false; release(); wantClose.current = true; setClosing(true);
          if (!deny(Object.assign(new Error(result.error), { status: result.status }))) setError(`${result.error}. El tramo permanece en esta pestaña. Puede descargarlo o reintentar el mismo envío.`);
          return;
        }
        queue.current.shift(); publishQueue(); publishSession(result.data.session); callbacks.current.onChanged(); notifyCaseDocumentsChanged(causaId);
        if (result.data.clip?.status === "failed") { autoSave.current = false; release(); wantClose.current = true; setClosing(true); setError("El audio se conservó, pero su transcripción no terminó. Revise el tramo y reintente la transcripción guardada."); return; }
      }
    } finally { uploading.current = false; if (mounted.current) setBusy(false); }
    if (wantClose.current) await closeSession();
  }, [base, causaId, closeSession, deny, publishQueue, publishSession, release]);
  const drainRef = useRef(drain), closeRef = useRef(closeSession), beginClip = useRef<() => void>(() => {});
  useEffect(() => { drainRef.current = drain; closeRef.current = closeSession; }, [drain, closeSession]);
  const stopCapture = useCallback((reason?: string, save = true) => { autoSave.current = save; wantClose.current = true; if (mounted.current) setClosing(true); release(); if (reason && mounted.current) setNotice(reason); if (!finalizing.current && save) void drainRef.current(); }, [release]);
  const invalidateCapture = useCallback(() => { captureGeneration.current += 1; }, []);
  useEffect(() => { activeRef.current = active; if (!active && capturing.current) stopCapture("Captura detenida al cerrar la mesa o cambiar su acceso. Revise cualquier tramo pendiente.", false); }, [active, stopCapture]);
  useEffect(() => { registerStopCapture?.(() => stopCapture("Captura detenida. Conservando el último tramo y cerrando la sesión…")); return () => registerStopCapture?.(null); }, [registerStopCapture, stopCapture]);
  useEffect(() => { onCaptureState?.(blocked ? null : { recording, pending: pending.length, busy, closing, unconfirmed: startUnconfirmed, error, notice }); }, [onCaptureState, blocked, recording, pending.length, busy, closing, startUnconfirmed, error, notice]);
  useEffect(() => () => onCaptureState?.(null), [onCaptureState]);
  useEffect(() => {
    mounted.current = true; denied.current = false; const supportCheck = setTimeout(() => setSupported({ microphone: typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined", tab: typeof navigator.mediaDevices?.getDisplayMedia === "function" && typeof MediaRecorder !== "undefined" }), 0);
    const visibility = () => { if (document.hidden && capturing.current) stopCapture("Captura detenida al ocultar la pestaña. Revise el último tramo antes de continuar.", false); };
    document.addEventListener("visibilitychange", visibility);
    return () => { mounted.current = false; autoSave.current = false; restored.current = false; const finalization = currentFinalization.current; if (!denied.current) rememberAudio(cacheKey, session.current?.id, queue.current, true, finalization && !finalization.completed ? finalization.promise : undefined); clearTimeout(supportCheck); invalidateCapture(); release(); document.removeEventListener("visibilitychange", visibility); };
  }, [release, stopCapture, invalidateCapture, cacheKey]);
  useEffect(() => { if (!active || blocked) return; const first = setTimeout(() => void refresh(), 0), poll = setInterval(() => void refresh(), 15_000); return () => { clearTimeout(first); clearInterval(poll); }; }, [active, blocked, refresh]);
  useEffect(() => { if (!selected || detail?.id === selected || blocked) return; void refresh(selected); }, [selected, detail?.id, blocked, refresh]);
  const guard = useCallback(async () => {
    if (startRequest.current || opening.current || capturing.current || finalizing.current || uploading.current || queue.current.length || wantClose.current) { if (mounted.current) { setError("Detenga la captura y conserve los tramos pendientes antes de cambiar de mesa o salir."); host.current?.scrollIntoView({ block: "start", behavior: "instant" }); } return false; }
    return true;
  }, []);
  useEffect(() => { registerGuard(guard); return () => registerGuard(null); }, [registerGuard, guard]);
  useEffect(() => { callbacks.current.onBusy(recording || busy || pending.length > 0 || startUnconfirmed || closing); return () => callbacks.current.onBusy(false); }, [recording, busy, pending.length, startUnconfirmed, closing]);
  useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (startRequest.current || capturing.current || uploading.current || queue.current.length) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", unload); return () => window.removeEventListener("beforeunload", unload); }, []);
  async function start() {
    if (opening.current || busy || capturing.current || queue.current.length || wantClose.current || !view?.config.canCapture || !consent || !active || !canWrite) return;
    const held = cachedAudio(cacheKey);
    if (held?.recoverable && (held.clips.length || held.finalization)) { selectedRef.current = held.sessionId; setSelected(held.sessionId); setNotice("Compruebe y conserve el audio pendiente antes de iniciar otra captura."); void refresh(held.sessionId); return; }
    opening.current = true; setBusy(true); setError(""); setNotice(""); const generation = ++captureGeneration.current;
    try {
      const currentStream = source === "tab" ? await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }) : await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || !activeRef.current || document.hidden || denied.current || generation !== captureGeneration.current) { currentStream.getTracks().forEach(track => track.stop()); return; }
      stream.current = currentStream;
      if (!currentStream.getAudioTracks().length) throw new Error("La selección no incluye audio. Comparta una pestaña con sonido o elija el micrófono.");
      if (!startRequest.current) startRequest.current = { requestId: crypto.randomUUID(), title: title.trim() || "Captura de audiencia" };
      setStartUnconfirmed(true);
      const result = await apiMutation<AudioMutation>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(startRequest.current) });
      if (!mounted.current || denied.current || generation !== captureGeneration.current) { release(); return; }
      if (!result.ok) { if (result.status >= 400 && result.status < 500) { startRequest.current = null; setStartUnconfirmed(false); } if (deny(Object.assign(new Error(result.error), { status: result.status }))) return; throw new Error(result.error); }
      startRequest.current = null; setStartUnconfirmed(false); stopRequest.current = null; wantClose.current = false; setClosing(false); autoSave.current = true; setOlder([]); setCursor(undefined); publishSession(result.data.session); nextSequence.current = result.data.session.nextSequence;
      if (!activeRef.current || document.hidden) { release(); wantClose.current = true; setClosing(true); await closeSession(); return; }
      if (result.data.session.status === "stopped") { release(); setNotice("La petición anterior corresponde a una captura cerrada. Sus tramos siguen disponibles; inicie otra captura para continuar."); return; }
      const audioOnly = new MediaStream(currentStream.getAudioTracks());
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const record = () => {
        if (!capturing.current || !stream.current || denied.current || !session.current) return;
        const limit = session.current.maxClips || view.maxClips;
        if (nextSequence.current >= limit || session.current.totalBytes + queue.current.reduce((sum, clip) => sum + clip.blob.size, 0) >= session.current.maxBytes) { stopCapture("Se alcanzó el alcance de esta captura. Conserve los tramos pendientes y cree otra captura si necesita continuar."); return; }
        const chunks: Blob[] = [], currentRecorder = new MediaRecorder(audioOnly, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64_000 }), sequence = nextSequence.current;
        const buffer = beginFinalization(cacheKey, session.current.id), requestId = crypto.randomUUID(); currentFinalization.current = buffer;
        recorder.current = currentRecorder;
        currentRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        currentRecorder.onerror = () => { stopCapture("El navegador interrumpió la captura. Conserve el audio recibido antes de volver a comenzar.", false); setError("No se pudo completar el tramo actual. Revise los tramos conservados y el permiso del micrófono."); };
        currentRecorder.onstop = () => {
          finalizing.current = false;
          if (timer.current) clearTimeout(timer.current); timer.current = null;
          if (denied.current || !buffer.valid) { finishFinalization(cacheKey, buffer); return; }
          const blob = new Blob(chunks, { type: currentRecorder.mimeType || mime || "audio/webm" });
          if (!mounted.current || generation !== captureGeneration.current) {
            const previous = cachedAudio(cacheKey), held = previous?.sessionId === buffer.sessionId ? [...previous.clips] : [];
            if (blob.size && !held.some(item => item.requestId === requestId)) { const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"; held.push({ requestId, sequence, blob, name: `audiencia-tramo-${sequence + 1}.${extension}` }); }
            rememberAudio(cacheKey, buffer.sessionId, held, true); finishFinalization(cacheKey, buffer); return;
          }
          if (blob.size) {
            nextSequence.current = sequence + 1;
            const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
            queue.current.push({ requestId, sequence, blob, name: `audiencia-tramo-${sequence + 1}.${extension}` }); publishQueue();
            if (blob.size > view.maxBytes) { autoSave.current = false; stopCapture("El tramo supera el tamaño permitido. Descárguelo para conservarlo y ajuste la captura.", false); }
          } else { stopCapture("El navegador no entregó sonido en el último tramo. Se detuvo la captura; revise el permiso y la fuente de audio."); }
          finishFinalization(cacheKey, buffer);
          if (capturing.current && queue.current.length < maxQueue && activeRef.current) beginClip.current();
          else if (capturing.current) { stopCapture("Captura pausada porque el servicio sigue procesando. Se conservan los tramos recibidos; vuelva a iniciar cuando termine."); }
          if (autoSave.current) void drainRef.current();
          else if (!queue.current.length && wantClose.current) void closeRef.current();
        };
        try { currentRecorder.start(); } catch (reason) { finishFinalization(cacheKey, buffer); throw reason; }
        timer.current = setTimeout(() => { if (currentRecorder.state !== "inactive") { finalizing.current = true; currentRecorder.stop(); } }, Math.max(1, view.clipSeconds) * 1000);
      };
      beginClip.current = record; capturing.current = true; setRecording(true);
      currentStream.getTracks().forEach(track => track.addEventListener("ended", () => { if (capturing.current) stopCapture("La fuente de audio dejó de estar disponible. Los tramos ya recibidos se conservarán."); }, { once: true }));
      record(); setSettingsOpen(false); requestAnimationFrame(() => stopButton.current?.focus({ preventScroll: true })); setNotice("Captura activa. El texto aparecerá por tramos después de procesar cada archivo; todavía requiere revisión escuchando el audio.");
    } catch (reason) { release(); if (mounted.current) setError(reason instanceof Error ? reason.message : "No se pudo abrir la fuente de audio. Revise el permiso del navegador."); }
    finally { opening.current = false; if (mounted.current) setBusy(false); }
  }
  async function retryClip(clip: Clip) {
    if (!detail || busy || recording || !clip.audioId) return;
    setBusy(true); setError(""); let requestId = retryRequests.current.get(clip.id); if (!requestId) { requestId = crypto.randomUUID(); retryRequests.current.set(clip.id, requestId); }
    const result = await apiMutation<AudioMutation>(`${base}/${detail.id}/clips/${clip.id}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }) });
    if (!mounted.current) return; setBusy(false);
    if (!result.ok) { if (!deny(Object.assign(new Error(result.error), { status: result.status }))) setError(result.error); return; }
    retryRequests.current.delete(clip.id); publishSession(result.data.session); callbacks.current.onChanged(); notifyCaseDocumentsChanged(causaId);
    if (result.data.clip?.status === "failed") setError("La transcripción sigue pendiente. El audio original permanece conservado.");
  }
  async function loadOlder() {
    const before = cursor === undefined ? detail?.nextBefore : cursor; if (!before || !detail || busy) return;
    setBusy(true); try { const value = await readAudio(`${base}?sessionId=${encodeURIComponent(detail.id)}&before=${before}`); if (value.session) { setOlder(items => [...value.session!.clips.filter(clip => !items.some(item => item.id === clip.id)), ...items]); setCursor(value.session.nextBefore); } }
    catch (reason) { const failure = reason as Failure; if (!deny(failure)) setError(failure.message); } finally { if (mounted.current) setBusy(false); }
  }
  if (blocked) return null;
  const disabled = busy || recording || pending.length > 0, clips = [...older.filter(clip => !detail?.clips.some(item => item.id === clip.id)), ...(detail?.clips || [])];
  return <section ref={host} className="hearing-live-audio" data-testid="hearing-live-audio" aria-label="Transcripción de audio de la audiencia">
    <header><h5>Transcribir la audiencia</h5>{recording && <div className="hearing-live-audio-controls"><strong className="hearing-live-audio-recording" role="status"><Mic size={16} aria-hidden="true" />Captando audio</strong><button ref={stopButton} className="btn btn-primary" type="button" onClick={() => stopCapture("Captura detenida. Conservando el último tramo y cerrando la sesión…")}><Square size={15} aria-hidden="true" />Detener captura</button></div>}</header>
    {error && <p role="alert" className="hearing-live-warning">{error}</p>}
    <p>Texto automático por tramos. Coteje las palabras escuchando el original antes de citarlas.</p>
    {notice && <p role="status" className="hearing-live-success">{notice}</p>}
    {!view && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void refresh()}>Comprobar servicio de transcripción</button>}
    {view && <>
      <details className="hearing-live-scope hearing-live-capture-settings" open={settingsOpen} onToggle={event => setSettingsOpen(event.currentTarget.open)}>
        <summary>Configuración de la captura</summary>
        <div><p className="hearing-live-help">Servicio: {view.config.preset === "local" ? "transcriptor local configurado" : "proveedor externo configurado"}{view.config.model ? ` · ${view.config.model}` : ""}. {view.config.localOnly ? "El estudio exige procesamiento local." : "El audio se enviará al servicio configurado al captar y guardar cada tramo."}</p>
      {canWrite && view.canWrite && <div className="hearing-live-audio-capture"><label>Nombre de la captura<input className="input" maxLength={180} value={title} disabled={disabled || startUnconfirmed} onChange={event => setTitle(event.target.value)} /></label><label>Fuente del audio<select className="select" value={source} disabled={disabled || startUnconfirmed} onChange={event => setSource(event.target.value as typeof source)}><option value="microphone">Micrófono</option><option value="tab" disabled={!supported.tab}>Audio de pestaña compartida</option></select></label>
      {!supported.microphone && <p className="hearing-live-help">La captura no está disponible en este navegador. Abra LexOpen en una conexión segura o incorpore el audio desde Grabaciones y transcripciones.</p>}
      {source === "tab" && <p className="hearing-live-help">En el selector del navegador, comparta una pestaña y active su audio. Sólo se conserva sonido; el vídeo no se envía. Si no hay audio compartido, se detendrá la captura.</p>}
      <label className="hearing-live-check"><input type="checkbox" checked={consent} disabled={disabled || startUnconfirmed} onChange={event => setConsent(event.target.checked)} /><span>Confirmo que puedo captar este audio y enviarlo al servicio configurado</span></label>
      <div className="hearing-live-actions">{!recording && <button className="btn btn-secondary" type="button" disabled={disabled || closing || !consent || !view.config.canCapture || !supported.microphone || view.sessions.length >= view.maxSessions} onClick={() => void start()}>{source === "tab" ? <MonitorUp size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}{startUnconfirmed ? "Reintentar inicio de captura" : "Iniciar captura y transcripción"}</button>}{!recording && detail?.status === "recording" && !pending.length && !busy && <button className="btn btn-secondary" type="button" onClick={() => void closeSession()}>Cerrar captura guardada</button>}</div></div>}
      <details className="hearing-live-scope"><summary>Alcance de la transcripción</summary><p>El audio se conserva en la causa y se transcribe mediante archivos independientes de unos {view.clipSeconds} segundos. La respuesta puede tardar más según el servicio. Cada tramo conserva su propio original; el orden no acredita continuidad ni marcas exactas de una grabación judicial. El reloj de sesión es independiente.</p>{[...new Set([...view.config.warnings, ...view.warnings])].map(warning => <p className="hearing-live-help" key={warning}>{warning}</p>)}</details>
      {view.sessions.length > 0 && <label>Capturas de esta mesa<select className="select" value={selected} disabled={disabled || closing} onChange={event => { const id = event.target.value; selectedRef.current = id; session.current = undefined; setSelected(id); setDetail(undefined); setOlder([]); setCursor(undefined); setError(""); }}><option value="">Seleccione una captura</option>{view.sessions.map(item => <option key={item.id} value={item.id}>{item.title} · {item.clipCount} tramo(s) · {item.status === "stopped" ? "cerrada" : "abierta"}</option>)}</select></label>}
        </div>
      </details>
      {pending.length > 0 && <div className="hearing-live-audio-pending"><h6>Audio pendiente en esta pestaña</h6><p>{pending.length} tramo(s). Mantenga la pestaña abierta hasta conservarlos. Descargar una copia no confirma su incorporación a la causa.</p><ol>{pending.map(item => <li key={item.requestId}><span>Tramo {item.sequence + 1} · {formatBytes(item.blob.size)}</span><button className="hearing-copy-link" type="button" onClick={() => downloadBlob(item.blob, item.name)}><Download size={15} aria-hidden="true" />Descargar audio pendiente</button></li>)}</ol>{!recording && <div className="hearing-live-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => { autoSave.current = true; void drain(); }}>Guardar tramo pendiente</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { queue.current = []; publishQueue(); setNotice("Se descartó el audio pendiente de esta pestaña. Los tramos ya conservados en la causa permanecen disponibles."); void closeSession(); }}>Descartar audio pendiente de esta pestaña</button></div>}</div>}
      {detail && <div className="hearing-live-audio-transcript"><header><h6>{detail.title}</h6><span>{detail.clipCount}/{detail.maxClips} tramos · {formatBytes(detail.totalBytes)}</span></header><p className="hearing-live-help">Cada tramo conserva su propio audio. El orden no acredita continuidad ni marcas exactas de una grabación judicial; el reloj de sesión es independiente.</p>{!clips.length && <p>El texto aparecerá cuando se conserve y procese el primer tramo.</p>}<ol>{clips.map(clip => <li key={clip.id} data-testid="live-audio-clip">{!clip.available ? <p className="hearing-live-warning">Tramo no disponible con sus permisos actuales.</p> : <><header><strong>Tramo {clip.sequence + 1}</strong><span>{clip.status === "ready" ? "Texto automático · revisión pendiente" : clip.status === "failed" ? "Audio conservado · texto pendiente" : "Procesando audio"}</span></header>{clip.originalHref && <audio controls preload="none" src={clip.originalHref} aria-label={`Escuchar tramo ${clip.sequence + 1}`}><track kind="captions" /></audio>}{clip.lastError && <p className="hearing-live-warning">{clip.lastError}</p>}{clip.status === "failed" && !clip.audioId && <p className="hearing-live-help">Este tramo todavía no tiene un original conservado. Reenvíe el audio pendiente desde esta pestaña o incorpore una copia descargada en Grabaciones y transcripciones.</p>}{clip.warnings.map(warning => <p className="hearing-live-help" key={warning}>{warning}</p>)}{clip.fragments.length > 0 ? clip.fragments.map(fragment => <div className="hearing-live-audio-passage" key={fragment.id}><blockquote>{fragment.text}</blockquote>{canWrite && clip.sourceId && <button className="hearing-copy-link" type="button" onClick={() => { if (callbacks.current.onSelection({ quote: { sourceId: clip.sourceId!, fragmentId: fragment.id, quote: fragment.text.slice(0,2200) }, label: `${detail.title} · Tramo ${clip.sequence + 1} · transcripción automática` }, fragment.text, clip.id)) chosenClip.current = { id: clip.id, sequence: clip.sequence, sessionId: detail.id }; }}>Usar pasaje en el registro</button>}</div>) : clip.text && <p>{clip.text}</p>}<div className="hearing-live-actions">{clip.originalHref && <a className="hearing-copy-link" href={clip.originalHref} download>Descargar original del tramo</a>}{clip.transcriptHref && <a className="hearing-copy-link" href={clip.transcriptHref} download>Descargar transcripción TXT</a>}{canWrite && clip.status === "failed" && clip.audioId && <button className="btn btn-secondary" disabled={busy || recording} type="button" onClick={() => void retryClip(clip)}><RefreshCw size={15} aria-hidden="true" />Reintentar transcripción</button>}</div></>}</li>)}</ol>{(cursor === undefined ? detail.nextBefore : cursor) !== null && <button className="btn btn-secondary" disabled={busy} type="button" onClick={() => void loadOlder()}>Ver tramos anteriores</button>}</div>}
      <button className="hearing-copy-link" type="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true" />Actualizar transcripción</button>
    </>}
  </section>;
}
