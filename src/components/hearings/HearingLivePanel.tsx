"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronRight, Download, Pause, Play, RefreshCw, Save, Square, X } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { newUiId } from "@/lib/ui-id";
import type { HearingLiveKind, HearingLiveMutation, HearingLivePlan, HearingLiveView } from "@/lib/hearings/live-types";
import type { HearingLivePlanInput } from "@/lib/hearings/live-schemas";
import type { HearingQuote } from "@/lib/hearings/citations";
import type { HearingNoteView } from "@/lib/hearings/types";
import { HearingLiveAudioPanel } from "./HearingLiveAudioPanel";
import { HearingLivePromotion } from "./HearingLivePromotion";
import "./hearing-live.css";

type AvailableNote = Extract<HearingNoteView, { available: true }>;
type SaveState = "saved" | "pending" | "saving" | "error" | "conflict";
type Failure = Error & { status?: number; code?: string };
type ErrorBody = { code?: string };
type QuoteSelection = { quote: HearingQuote; label: string };
type PendingEntry = { title: string; body: string; kind: HearingLiveKind; savedAt: number; unconfirmed: boolean };
const pendingEntries = new Map<string, PendingEntry>();
const pendingEntryLifetime = 8 * 60 * 60 * 1000;
const pendingEntryLimit = 20;
function rememberPending(key: string, value: Omit<PendingEntry, "savedAt">) {
  const now = performance.now();
  for (const [id, entry] of pendingEntries) if (now - entry.savedAt > pendingEntryLifetime) pendingEntries.delete(id);
  if (!value.title && !value.body) { pendingEntries.delete(key); return; }
  pendingEntries.delete(key);
  if (pendingEntries.size >= pendingEntryLimit) pendingEntries.delete(pendingEntries.keys().next().value!);
  pendingEntries.set(key, { ...value, savedAt: now });
}
const emptyPlan: HearingLivePlan = { opening: "", closing: "", noteIds: [], noteRevisions: {}, addressedNoteIds: [], activeNoteId: null };
const phaseLabel = { idle: "Lista para comenzar", running: "En curso", paused: "En pausa", finished: "Finalizada" };
const saveLabel = { saved: "Guion guardado", pending: "Cambios pendientes", saving: "Guardando guion…", error: "Guardado pendiente", conflict: "Guion modificado en otra sesión" };
const kindLabel: Record<HearingLiveKind, string> = { observation: "Observación", objection: "Objeción anotada", decision: "Resolución anotada", commitment: "Acuerdo o compromiso" };
const samePlan = (a: HearingLivePlan, b: HearingLivePlan) => JSON.stringify(a) === JSON.stringify(b);
function duration(total: number) { const value = Math.max(0, Math.floor(total)); return [Math.floor(value / 3600), Math.floor(value % 3600 / 60), value % 60].map(part => String(part).padStart(2, "0")).join(":"); }
function downloadLocal(text: string, name: string) { const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })), link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function getLive(url: string, signal?: AbortSignal): Promise<HearingLiveView> {
  const response = await fetch(url, { cache: "no-store", signal }), body = await response.json().catch(() => null);
  if (!response.ok || !body) throw Object.assign(new Error(body?.error || "No se pudo actualizar el panel. Vuelva a comprobar la conexión."), { status: response.status, code: body?.code });
  return body;
}
async function mutateLive(url: string, method: string, payload: unknown) {
  const control = new AbortController(), timeout = setTimeout(() => control.abort(), 30_000);
  try { return await apiMutation<HearingLiveMutation & ErrorBody>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: control.signal }); }
  finally { clearTimeout(timeout); }
}

/** Extends the established reading desk: a saved intervention sequence beside its sources. */
export function HearingLivePanel({ causaId, workspaceId, active, quote, clearQuote, onChooseQuote, readSource, onUpdated, onAccessLost, onBusy, showPanel, registerGuard }: {
  causaId: string; workspaceId: string; active: boolean; quote: QuoteSelection | null;
  clearQuote: () => void; readSource: (sourceId: string) => void;
  onChooseQuote: (selection: QuoteSelection) => void;
  onUpdated: (value: HearingLiveView) => void; onAccessLost: (message: string) => void;
  onBusy: (value: boolean) => void; showPanel: () => void;
  registerGuard: (guard: (() => Promise<boolean>) | null) => void;
}) {
  const url = `/api/causas/${causaId}/hearings/${workspaceId}/live`;
  const pendingKey = `${causaId}:${workspaceId}`;
  const [live, setLive] = useState<HearingLiveView>(), [plan, setPlan] = useState<HearingLivePlan>(emptyPlan);
  const [saveState, setSaveState] = useState<SaveState>("saved"), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false), [busy, setBusy] = useState(false), [pendingAction, setPendingAction] = useState(false), [stale, setStale] = useState(false), [connectionError, setConnectionError] = useState("");
  const [clock, setClock] = useState({ elapsed: 0, at: 0, tick: 0, running: false });
  const [kind, setKind] = useState<HearingLiveKind>("observation"), [entryTitle, setEntryTitle] = useState(""), [entryBody, setEntryBody] = useState("");
  const [olderEntries, setOlderEntries] = useState<HearingLiveView["entries"]>([]), [olderCursor, setOlderCursor] = useState<string | null>();
  const [audioBusy, setAudioBusy] = useState(false), [promotionBusy, setPromotionBusy] = useState(false), [promotionSource, setPromotionSource] = useState<{ noteId: string; revision: number } | null>(null);
  const audioGuard = useRef<(() => Promise<boolean>) | null>(null), promotionGuard = useRef<(() => Promise<boolean>) | null>(null);
  const externalPending = useRef(false);
  const registerAudioGuard = useCallback((value: (() => Promise<boolean>) | null) => { audioGuard.current = value; }, []);
  const registerPromotionGuard = useCallback((value: (() => Promise<boolean>) | null) => { promotionGuard.current = value; }, []);
  const liveRef = useRef<HearingLiveView | undefined>(undefined), planRef = useRef(plan), stateRef = useRef<SaveState>("saved"), mounted = useRef(true), frozen = useRef(false);
  const failedSave = useRef<HearingLivePlanInput | null>(null), flight = useRef<Promise<boolean> | null>(null), structural = useRef<{ path: string; payload: Record<string, unknown>; entry: boolean } | null>(null), actionFlight = useRef(false);
  const entryRef = useRef({ title: "", body: "" }), kindRef = useRef<HearingLiveKind>("observation"), entryRestored = useRef(false), lastSync = useRef(0), refreshFlight = useRef(false);
  const transcriptOrigin = useRef<{ clipId: string; sourceId: string } | null>(null);
  const rememberEntry = useCallback((value: Omit<PendingEntry, "savedAt">) => { if (!value.title && !value.body) transcriptOrigin.current = null; if (transcriptOrigin.current) pendingEntries.delete(pendingKey); else rememberPending(pendingKey, value); }, [pendingKey]);
  const recordForm = useRef<HTMLFormElement>(null), recordTitle = useRef<HTMLInputElement>(null), sessionHeading = useRef<HTMLElement>(null);
  const focusRecord = useCallback(() => { recordForm.current?.scrollIntoView({ block: "start", behavior: "instant" }); recordTitle.current?.focus({ preventScroll: true }); }, []);
  const controls = useRef({ onUpdated, onAccessLost, onBusy, showPanel, clearQuote });
  useEffect(() => { controls.current = { onUpdated, onAccessLost, onBusy, showPanel, clearQuote }; }, [onUpdated, onAccessLost, onBusy, showPanel, clearQuote]);
  useEffect(() => { onBusy(busy || audioBusy || promotionBusy); return () => onBusy(false); }, [onBusy, busy, audioBusy, promotionBusy]);
  useEffect(() => { externalPending.current = audioBusy || Boolean(promotionSource); }, [audioBusy, promotionSource]);
  useEffect(() => { if (!promotionSource || !live?.notes.some(note => note.id === promotionSource.noteId && !note.available)) return; const timer = setTimeout(() => { setPromotionSource(null); setError("El registro de origen dejó de estar disponible. Se cerró la preparación y se retiró su contenido."); }, 0); return () => clearTimeout(timer); }, [promotionSource, live?.notes]);
  const state = useCallback((value: SaveState) => { stateRef.current = value; if (mounted.current) setSaveState(value); }, []);
  const freezeClock = useCallback((at: number) => { setClock(value => value.running ? { elapsed: value.elapsed + Math.floor(Math.max(0, at - value.at) / 1000), at, tick: at, running: false } : value); }, []);
  const publish = useCallback((value: HearingLiveView, replacePlan: boolean) => {
    liveRef.current = value; lastSync.current = performance.now();
    if (replacePlan) planRef.current = value.plan;
    if (mounted.current) {
      setLive(value); if (replacePlan) setPlan(value.plan);
      const at = performance.now(); setClock({ elapsed: value.elapsedSeconds, at, tick: at, running: value.phase === "running" }); setStale(false); setConnectionError("");
      if (!entryRestored.current) {
        entryRestored.current = true;
        const pending = pendingEntries.get(pendingKey);
        if (pending && at - pending.savedAt <= pendingEntryLifetime) {
          entryRef.current = { title: pending.title, body: pending.body }; kindRef.current = pending.kind;
          setEntryTitle(pending.title); setEntryBody(pending.body); setKind(pending.kind);
          setMessage(pending.unconfirmed ? "Se recuperó su anotación pendiente. Compruebe el registro antes de volver a guardarla: la petición anterior pudo haberse confirmado. Vuelva a seleccionar el pasaje si necesita un respaldo." : "Se recuperó su anotación sin guardar. Revísela y vuelva a seleccionar el pasaje si necesita un respaldo.");
        } else pendingEntries.delete(pendingKey);
      }
      controls.current.onUpdated(value);
    }
  }, [pendingKey]);
  const accessFailure = useCallback((failure: Failure) => {
    if (![401, 403, 404].includes(failure.status || 0)) return false;
    frozen.current = true; failedSave.current = null; structural.current = null;
    pendingEntries.delete(pendingKey);
    planRef.current = emptyPlan; entryRef.current = { title: "", body: "" };
    if (mounted.current) { setBlocked(true); setLive(undefined); setPlan(emptyPlan); setEntryBody(""); setEntryTitle(""); setError(failure.message);  controls.current.onAccessLost(failure.message); }
    return true;
  }, [pendingKey]);
  const refresh = useCallback(async (force = false) => {
    if (refreshFlight.current || frozen.current) return;
    refreshFlight.current = true;
    const control = new AbortController(), timeout = setTimeout(() => control.abort(), 10_000);
    try {
      const value = await getLive(url, control.signal);
      if (!mounted.current) return;
      if (force) { failedSave.current = null; structural.current = null; setPendingAction(false); publish(value, true); state("saved"); setError(""); }
      else if (!flight.current && !structural.current) {
        const dirty = liveRef.current && !samePlan(planRef.current, liveRef.current.plan);
        if (dirty && value.revision !== liveRef.current?.revision) { publish(value, false); state("conflict"); setError("Otra sesión actualizó el guion. Su texto se mantiene; conserve una copia o cargue la versión guardada."); }
        else { publish(value, !dirty && !failedSave.current); }
      }
    } catch (reason) { const failure = reason as Failure; if (!accessFailure(failure) && mounted.current) { freezeClock(performance.now()); setStale(true); setConnectionError(failure.message); } }
    finally { clearTimeout(timeout); refreshFlight.current = false; }
  }, [url, publish, state, accessFailure, freezeClock]);
  const flush = useCallback(async (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (frozen.current || stateRef.current === "conflict" || structural.current) return false;
    if (!liveRef.current) return true;
    if (!liveRef.current.canWrite) return samePlan(planRef.current, liveRef.current.plan);
    const run = async () => {
      while (liveRef.current && (!samePlan(planRef.current, liveRef.current.plan) || failedSave.current)) {
        const payload = failedSave.current || { ...planRef.current, requestId: newUiId("hearing-plan"), expectedRevision: liveRef.current.revision };
        failedSave.current = payload; state("saving"); if (mounted.current) setError("");
        const result = await mutateLive(url, "PATCH", payload);
        if (!result.ok) {
          const failure = Object.assign(new Error(result.error), { status: result.status, code: result.data?.code });
          if (accessFailure(failure)) return false;
          if (result.status >= 400 && result.status < 500) failedSave.current = null;
          state(result.status === 409 && result.data?.code !== "hearing_live_source_unavailable" ? "conflict" : "error");
          if (mounted.current) { setError(failure.message); if (result.data?.code === "hearing_live_source_unavailable") { controls.current.clearQuote(); void refresh(); } }
          return false;
        }
        failedSave.current = null;
        const value = result.data.live, { requestId: _id, expectedRevision: _revision, ...sent } = payload; void _id; void _revision;
        if (!samePlan(value.plan, sent)) { publish(value, false); state("conflict"); if (mounted.current) setError("La petición anterior ya se guardó y el guion tiene una versión posterior. Sus cambios locales se conservan."); return false; }
        publish(value, samePlan(planRef.current, sent));
      }
      state("saved"); if (mounted.current) setError(""); return true;
    };
    const task = run(); flight.current = task;
    try { return await task; } finally { if (flight.current === task) flight.current = null; }
  }, [url, state, accessFailure, publish, refresh]);
  const guard = useCallback(async () => {
    if (audioGuard.current && !await audioGuard.current() || promotionGuard.current && !await promotionGuard.current()) { controls.current.showPanel(); return false; }
    if (structural.current || entryRef.current.title.trim() || entryRef.current.body.trim()) {
      if (mounted.current) { setError("Registre o descarte la anotación pendiente antes de cambiar de mesa."); controls.current.showPanel(); }
      return false;
    }
    const saved = await flush(); if (!saved && mounted.current) controls.current.showPanel(); return saved;
  }, [flush]);
  useEffect(() => { mounted.current = true; registerGuard(guard); return () => { mounted.current = false; registerGuard(null); if (!frozen.current && entryRestored.current) rememberEntry({ ...entryRef.current, kind: kindRef.current, unconfirmed: Boolean(structural.current?.entry) }); if (!frozen.current && stateRef.current !== "conflict" && !structural.current) void flush(); }; }, [registerGuard, guard, flush, pendingKey, rememberEntry]);
  useEffect(() => { if (!active || blocked) return; const first = setTimeout(() => { void refresh(); }, 0); const interval = setInterval(() => { void refresh(); }, 15_000); const focus = () => { void refresh(); }; window.addEventListener("focus", focus); return () => { clearTimeout(first); clearInterval(interval); window.removeEventListener("focus", focus); }; }, [active, blocked, refresh]);
  useEffect(() => { if (saveState !== "pending" || busy) return; const timer = setTimeout(() => { void flush(); }, 900); return () => clearTimeout(timer); }, [saveState, plan, busy, flush]);
  useEffect(() => { if (!active || !quote || !live?.workspaceId) return; const frame = requestAnimationFrame(focusRecord); return () => cancelAnimationFrame(frame); }, [active, quote, live?.workspaceId, focusRecord]);
  useEffect(() => { if (!active || stale) return; const timer = setInterval(() => { const now = performance.now(); if (lastSync.current && now - lastSync.current > 30_000) { freezeClock(now); setStale(true); } else setClock(value => ({ ...value, tick: now })); }, 1000); return () => clearInterval(timer); }, [active, stale, freezeClock]);
  useEffect(() => {
    const pending = () => Boolean(externalPending.current || structural.current || failedSave.current || flight.current || entryRef.current.title || entryRef.current.body || liveRef.current && !samePlan(planRef.current, liveRef.current.plan));
    const unload = (event: BeforeUnloadEvent) => { if (pending()) { event.preventDefault(); event.returnValue = ""; } };
    const link = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !pending()) return;
      const anchor = (event.target as Element)?.closest("a");
      if (!anchor || anchor.hasAttribute("download") || anchor.target && anchor.target !== "_self") return;
      const destination = new URL(anchor.href, location.href); if (destination.href.split("#")[0] === location.href.split("#")[0]) return;
      event.preventDefault(); event.stopPropagation(); void guard().then(ok => { if (ok) location.assign(destination.href); });
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", link, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", link, true); };
  }, [guard]);
  function edit(patch: Partial<HearingLivePlan>) { planRef.current = { ...planRef.current, ...patch }; setPlan(planRef.current); setMessage(""); if (stateRef.current !== "conflict") state(failedSave.current ? stateRef.current : "pending"); }
  function selectNote(note: AvailableNote, checked: boolean) {
    const current = planRef.current;
    const noteRevisions = { ...current.noteRevisions }; if (checked) noteRevisions[note.id] = note.revision; else delete noteRevisions[note.id];
    edit({ noteIds: checked ? [...current.noteIds, note.id] : current.noteIds.filter(id => id !== note.id), noteRevisions, addressedNoteIds: current.addressedNoteIds.filter(id => checked || id !== note.id), activeNoteId: !checked && current.activeNoteId === note.id ? null : current.activeNoteId });
  }
  function removeNote(id: string) { const current = planRef.current, noteRevisions = { ...current.noteRevisions }; delete noteRevisions[id]; edit({ noteIds: current.noteIds.filter(value => value !== id), noteRevisions, addressedNoteIds: current.addressedNoteIds.filter(value => value !== id), activeNoteId: current.activeNoteId === id ? null : current.activeNoteId }); }
  function move(index: number, offset: number) { const ids = [...planRef.current.noteIds], target = index + offset; if (target < 0 || target >= ids.length) return; [ids[index], ids[target]] = [ids[target], ids[index]]; edit({ noteIds: ids }); }
  async function command(path: string, payload: Record<string, unknown>, isEntry = false) {
    if (actionFlight.current) return;
    if (path === "/control" && payload.action === "finish" && audioGuard.current && !await audioGuard.current()) { setError("Detenga y conserve la captura de audio antes de finalizar la sesión."); return; }
    actionFlight.current = true; setBusy(true);
    if (!structural.current) {
      if (!await flush() || !liveRef.current) { actionFlight.current = false; setBusy(false);  return; }
      structural.current = { path, payload: { ...payload, requestId: newUiId("hearing-live"), expectedRevision: liveRef.current.revision }, entry: isEntry };
    }
    setPendingAction(true); setError("");
    const action = structural.current, result = await mutateLive(url + action.path, "POST", action.payload);
    actionFlight.current = false; if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) {
      const failure = Object.assign(new Error(result.error), { status: result.status, code: result.data?.code }); if (accessFailure(failure)) return;
      if (result.status >= 400 && result.status < 500) { structural.current = null; setPendingAction(false); }
      state(result.status === 409 && result.data?.code !== "hearing_live_source_unavailable" ? "conflict" : "error"); setError(failure.message); if (result.data?.code === "hearing_live_source_unavailable") { controls.current.clearQuote(); void refresh(); } return;
    }
    structural.current = null; setPendingAction(false); publish(result.data.live, true); state("saved");
    if (action.entry) { transcriptOrigin.current = null; pendingEntries.delete(pendingKey); entryRef.current = { title: "", body: "" }; setEntryTitle(""); setEntryBody(""); controls.current.clearQuote(); setMessage("Anotación guardada en el cuaderno de audiencia y disponible para sus escritos."); }
    else setMessage("Control de sesión guardado. El tiempo se conserva al recargar.");
  }
  async function exportLive() {
    if (!await guard()) return;
    setBusy(true);  setError("");
    try { const response = await fetch(url + "/export", { cache: "no-store" }); if (!response.ok) { const value = await response.json(); throw Object.assign(new Error(value.error), { status: response.status, code: value.code }); } const objectUrl = URL.createObjectURL(await response.blob()), link = document.createElement("a"); link.href = objectUrl; link.download = "registro-audiencia.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); setMessage("Registro descargado con los respaldos disponibles comprobados de nuevo."); }
    catch (reason) { const failure = reason as Failure; if (!accessFailure(failure)) setError(failure.message); }
    finally { if (mounted.current) { setBusy(false);  } }
  }
  async function older() { const cursor = olderCursor === undefined ? live?.nextBefore : olderCursor; if (!cursor) return; setBusy(true); try { const value = await getLive(url + "?before=" + encodeURIComponent(cursor)); setOlderEntries(previous => [...previous, ...value.entries.filter(item => !previous.some(old => old.id === item.id))]); setOlderCursor(value.nextBefore); } catch (reason) { const failure = reason as Failure; if (!accessFailure(failure)) setError(failure.message); } finally { setBusy(false); } }
  if (blocked) return <section className="hearing-live" role="alert"><h4>Panel protegido</h4><p>{error}</p><p>El contenido se ha ocultado porque el acceso cambió.</p></section>;
  if (!live) return <section className="hearing-live" data-testid="hearing-live"><h4>Audiencia en vivo</h4>{error || connectionError ? <><p role="alert">{error || connectionError}</p><button type="button" className="btn btn-secondary" onClick={() => void refresh()}>Volver a comprobar conexión</button></> : <p role="status">Abriendo el guion y la sesión guardados…</p>}</section>;
  const availableNotes = live.notes.filter((note): note is AvailableNote => note.available), locked = busy || pendingAction || !live.canWrite;
  const selectedNotes = plan.noteIds.map(id => live.notes.find(note => note.id === id) || { id, available: false as const });
  const currentNote = selectedNotes.find((note): note is AvailableNote => note.id === plan.activeNoteId && note.available && !live.changedNoteIds.includes(note.id));
  const elapsed = clock.elapsed + (clock.running ? Math.floor(Math.max(0, clock.tick - clock.at) / 1000) : 0);
  const freshNotes = new Map(live.notes.map(note => [note.id, note]));
  const entries = [...live.entries, ...olderEntries.filter(item => !live.entries.some(recent => recent.id === item.id))].map(entry => { const fresh = freshNotes.get(entry.id); return !entry.available || !fresh?.available ? { id: entry.id, available: false as const } : { ...entry, ...fresh }; });
  return <section className="hearing-live" data-testid="hearing-live" aria-label="Panel en vivo de la audiencia">
    <header className="hearing-live-heading" ref={sessionHeading}><h4>Audiencia en vivo</h4><span>{phaseLabel[live.phase]}</span></header>
    <div className="hearing-live-clock"><div><span>Tiempo de sesión</span><output role="timer" aria-label="Tiempo de la sesión" aria-live="off" data-testid="hearing-live-clock" data-phase={live.phase}>{duration(Math.min(604800, elapsed))}</output></div><div className="hearing-live-clock-actions">
      {live.phase === "idle" && <button type="button" className="btn btn-primary" disabled={locked || stale} onClick={() => void command("/control", { action: "start" })}><Play size={16} aria-hidden="true" />Iniciar audiencia</button>}
      {live.phase === "running" && <button type="button" className="btn btn-secondary" disabled={locked || stale} onClick={() => void command("/control", { action: "pause" })}><Pause size={16} aria-hidden="true" />Pausar tiempo</button>}
      {(live.phase === "paused" || live.phase === "finished") && <button type="button" className="btn btn-primary" disabled={locked || stale} onClick={() => void command("/control", { action: "resume" })}><Play size={16} aria-hidden="true" />{live.phase === "finished" ? "Reabrir sesión" : "Reanudar tiempo"}</button>}
      {(live.phase === "running" || live.phase === "paused") && <button type="button" className="btn btn-ghost" disabled={locked || stale} onClick={() => void command("/control", { action: "finish" })}><Square size={14} aria-hidden="true" />Finalizar sesión</button>}
      <button type="button" className="btn btn-secondary" disabled={!live.canWrite || pendingAction} onClick={focusRecord}>Registrar lo ocurrido</button>
    </div></div>
    <p className="hearing-live-help">Control manual del tiempo de trabajo. No calcula plazos procesales ni inicia una grabación.</p>
    <HearingLiveAudioPanel causaId={causaId} workspaceId={workspaceId} active={active} canWrite={live.canWrite} onBusy={setAudioBusy} registerGuard={registerAudioGuard} onAccessLost={message => accessFailure(Object.assign(new Error(message), { status: 403 }))} onChanged={() => void refresh()} onCitationUnavailable={clipId => { if (transcriptOrigin.current?.clipId !== clipId) return; transcriptOrigin.current = null; entryRef.current = { title: "", body: "" }; setEntryTitle(""); setEntryBody(""); pendingEntries.delete(pendingKey); clearQuote(); setError("El tramo seleccionado dejó de estar disponible. Se retiró su texto y su cita del registro pendiente."); }} onSelection={(selection, text, clipId) => { if (entryRef.current.title.trim() || entryRef.current.body.trim() || structural.current) { setError("Guarde o descarte la anotación pendiente antes de usar otro pasaje de audio."); focusRecord(); return false; } transcriptOrigin.current = { clipId, sourceId: selection.quote.sourceId }; onChooseQuote(selection); const title = `Pasaje transcrito · ${selection.label}`.slice(0,150); entryRef.current = { title, body: text.slice(0,8000) }; setEntryTitle(title); setEntryBody(entryRef.current.body); kindRef.current = "observation"; setKind("observation"); rememberEntry({ ...entryRef.current, kind: "observation", unconfirmed: false }); setMessage("Pasaje incorporado al formulario. Revise las palabras escuchando el tramo antes de guardar su registro."); requestAnimationFrame(focusRecord); return true; }} />
    <p className="hearing-live-save" data-state={saveState} role="status" aria-live="polite">{saveState === "saved" && <Check size={16} aria-hidden="true" />}{saveLabel[saveState]}</p>
    {stale && <p role="status" className="hearing-live-warning">Sin actualización del servidor. {connectionError} El tiempo mostrado se detiene; la sesión guardada puede seguir en marcha. <button type="button" className="hearing-copy-link" onClick={() => void refresh()}>Comprobar conexión</button></p>}
    {error && <div className="hearing-live-warning" role="alert"><p>{error}</p><div className="hearing-live-actions">{saveState === "conflict" ? <><button type="button" className="btn btn-secondary" onClick={() => downloadLocal(`Apertura\n${plan.opening}\n\nCierre\n${plan.closing}\n\nRegistro sin guardar\n${entryTitle}\n${entryBody}\n\nCopia local sin nueva corroboración de fuentes.`, "audiencia-copia-local.txt")}>Conservar copia local</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void refresh(true)}>Descartar cambios del guion y cargar actual</button></> : <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { if (structural.current) void command("", {}); else void flush(); }}>Reintentar guardado</button>}</div></div>}
    {message && <p role="status" className="hearing-live-success">{message}</p>}
    <details className="hearing-live-plan"><summary>Preparar el guion guardado</summary><div>
      <label>Apertura guardada<textarea className="textarea" value={plan.opening} disabled={locked} maxLength={8000} rows={3} onChange={event => edit({ opening: event.target.value })} placeholder="Petición inicial y puntos que necesita presentar…" /></label>
      <fieldset disabled={locked}><legend>Puntos para intervenir</legend><p>Seleccione hasta veinte notas de su cuaderno. Puede cambiar el orden y marcar lo tratado.</p>{availableNotes.map(note => <label className="hearing-live-check" key={note.id}><input type="checkbox" checked={plan.noteIds.includes(note.id)} disabled={locked || plan.noteIds.length >= 20 && !plan.noteIds.includes(note.id)} onChange={event => selectNote(note, event.target.checked)} /><span>{note.title}<small>{note.citation ? "Con pasaje vinculado" : "Observación personal"}</small></span></label>)}{!availableNotes.length && <p>No hay notas disponibles. Cree una nota en su cuaderno o registre una observación aquí.</p>}</fieldset>
      <label>Petición de cierre guardada<textarea className="textarea" value={plan.closing} disabled={locked} maxLength={8000} rows={3} onChange={event => edit({ closing: event.target.value })} placeholder="Petición concreta y asuntos que requieren decisión…" /></label>
      <button type="button" className="btn btn-secondary" disabled={locked || saveState === "saved" || saveState === "conflict"} onClick={() => void flush()}><Save size={16} aria-hidden="true" />Guardar guion ahora</button>
    </div></details>
    {plan.opening && <div className="hearing-live-prose"><h5>Apertura</h5><p>{plan.opening}</p></div>}
    <div className="hearing-live-rundown"><h5>Orden de intervención</h5>{!selectedNotes.length && <p>Abra «Preparar el guion guardado» para elegir sus puntos.</p>}<ol>{selectedNotes.map((note, index) => <li key={note.id} data-testid="live-cue" data-active={plan.activeNoteId === note.id}>
      {note.available ? <><button type="button" className="hearing-live-cue-title" disabled={locked} aria-pressed={plan.activeNoteId === note.id} onClick={() => edit({ activeNoteId: note.id, noteRevisions: { ...plan.noteRevisions, [note.id]: note.revision } })}>{note.title}<ChevronRight size={16} aria-hidden="true" /></button>{live.changedNoteIds.includes(note.id) && <p className="hearing-live-warning">Esta nota fue modificada. Vuelva a revisar su contenido antes de marcarla como tratada.</p>}<label className="hearing-live-check"><input type="checkbox" checked={plan.addressedNoteIds.includes(note.id) && !live.changedNoteIds.includes(note.id)} disabled={locked} onChange={event => edit({ addressedNoteIds: event.target.checked ? [...new Set([...plan.addressedNoteIds, note.id])] : plan.addressedNoteIds.filter(id => id !== note.id), noteRevisions: { ...plan.noteRevisions, [note.id]: note.revision } })} /><span>Tratado</span></label></> : <p className="hearing-live-warning">Punto no disponible con sus permisos actuales. Retírelo del guion para continuar guardando.</p>}
      <div className="hearing-live-cue-actions"><button type="button" disabled={locked || index === 0} aria-label={`Subir punto ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></button><button type="button" disabled={locked || index === selectedNotes.length - 1} aria-label={`Bajar punto ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></button><button type="button" disabled={locked} aria-label={`Retirar punto ${index + 1}`} onClick={() => removeNote(note.id)}><X size={16} aria-hidden="true" /></button></div>
    </li>)}</ol></div>
    {currentNote && <article className="hearing-live-active"><h5>Punto a presentar · {currentNote.title}</h5><p>{currentNote.body}</p>{currentNote.citation ? <><blockquote>{currentNote.citation.quote}</blockquote><p>{currentNote.citation.reference} · {currentNote.citation.locator}</p>{currentNote.citation.warning && <p className="hearing-live-warning">{currentNote.citation.warning}</p>}<button type="button" className="btn btn-secondary" onClick={() => readSource(currentNote.citation!.sourceId)}>Abrir respaldo en el lector</button></> : <p className="hearing-live-help">Observación personal sin respaldo documental.</p>}<button type="button" className="hearing-copy-link" disabled={locked} onClick={() => { const next = selectedNotes.find(note => note.available && !live.changedNoteIds.includes(note.id) && note.id !== currentNote.id && !plan.addressedNoteIds.includes(note.id)); edit({ addressedNoteIds: [...new Set([...plan.addressedNoteIds, currentNote.id])], activeNoteId: next?.id || null, noteRevisions: { ...plan.noteRevisions, [currentNote.id]: currentNote.revision } }); }}>Marcar tratado y continuar</button></article>}
    {plan.closing && <div className="hearing-live-prose"><h5>Petición de cierre</h5><p>{plan.closing}</p></div>}
    <form ref={recordForm} className="hearing-live-record" onSubmit={event => { event.preventDefault(); void command("/entries", { kind, title: entryTitle, body: entryBody, citation: quote?.quote || null }, true); }}><h5>Registrar lo ocurrido</h5><p>Sus anotaciones se guardan como notas de audiencia. Una resolución anotada no sustituye el documento oficial.</p><label>Tipo de registro<select className="select" value={kind} disabled={locked} onChange={event => { const value = event.target.value as HearingLiveKind; setKind(value); kindRef.current = value; rememberEntry({ ...entryRef.current, kind: value, unconfirmed: false }); }}>{Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Encabezado del registro<input ref={recordTitle} className="input" maxLength={150} required value={entryTitle} disabled={locked} onChange={event => { setEntryTitle(event.target.value); entryRef.current.title = event.target.value; rememberEntry({ ...entryRef.current, kind: kindRef.current, unconfirmed: false }); }} /></label><label>Registro de audiencia<textarea className="textarea" rows={4} maxLength={20000} required value={entryBody} disabled={locked} onChange={event => { setEntryBody(event.target.value); entryRef.current.body = event.target.value; rememberEntry({ ...entryRef.current, kind: kindRef.current, unconfirmed: false }); }} placeholder="Lo observado, lo solicitado o el compromiso que necesita recordar…" /></label>
      <p className="hearing-live-help">El registro se guarda al confirmar. Una copia temporal de su texto permite recuperarlo al volver dentro de esta pestaña, durante ocho horas y hasta veinte mesas. El texto tomado de una transcripción y su pasaje no se incluyen en esta copia; deben volver a elegirse. Esta copia no es un guardado en el Host.</p>
      {quote && <div className="hearing-live-attached"><h5>Pasaje para respaldar la anotación</h5><p>{quote.label}</p><blockquote>{quote.quote.quote}</blockquote><p>Se cotejará al registrar. El cotejo del pasaje no certifica su observación.</p><button type="button" className="hearing-copy-link" disabled={locked} onClick={clearQuote}>Retirar pasaje del registro</button></div>}
      <button type="button" className="hearing-copy-link" onClick={() => sessionHeading.current?.scrollIntoView({ block: "start", behavior: "instant" })}>Volver al control de sesión</button>
      <div className="hearing-live-actions"><button type="submit" className="btn btn-primary" disabled={locked || !entryTitle.trim() || !entryBody.trim() || saveState === "conflict"}>Guardar registro de audiencia</button>{(entryTitle || entryBody) && <button type="button" className="btn btn-ghost" disabled={busy || pendingAction} onClick={() => { setEntryTitle(""); setEntryBody(""); entryRef.current = { title: "", body: "" }; transcriptOrigin.current = null; pendingEntries.delete(pendingKey); clearQuote(); setError(""); }}>Descartar registro sin guardar</button>}</div>
    </form>
    <div className="hearing-live-log"><h5>Registro de la sesión</h5>{!entries.length && <p>Todavía no ha registrado observaciones en esta mesa.</p>}<ol>{entries.map(entry => <li key={entry.id} data-testid="live-entry">{!entry.available ? <p className="hearing-live-warning">Anotación no disponible con sus permisos actuales.</p> : <><header><span>{kindLabel[entry.kind]}</span><time dateTime={entry.createdAt}>Sesión {duration(entry.elapsedSeconds)}</time></header><h6>{entry.title}</h6><p>{entry.body}</p>{entry.citation && <><blockquote>{entry.citation.quote}</blockquote>{entry.citation.warning && <p className="hearing-live-warning">{entry.citation.warning}</p>}<a href={entry.citation.href} target="_blank" rel="noreferrer">Abrir pasaje citado</a></>}{live.canWrite && <button type="button" className="btn btn-secondary" disabled={busy || promotionBusy} onClick={() => { if (promotionSource) { setError("Cierre la preparación actual antes de elegir otro registro."); return; } setPromotionSource({ noteId: entry.id, revision: entry.revision }); }}>Crear hecho, nota o escrito</button>}</>}</li>)}</ol>{(olderCursor === undefined ? live.nextBefore : olderCursor) && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void older()}>Ver registros anteriores</button>}{live.limited && <p>El registro se consulta por páginas; el cuaderno admite hasta cien notas por mesa.</p>}</div>
    {promotionSource && <HearingLivePromotion key={`${promotionSource.noteId}:${promotionSource.revision}`} causaId={causaId} workspaceId={workspaceId} source={promotionSource} onClose={() => setPromotionSource(null)} onBusy={setPromotionBusy} registerGuard={registerPromotionGuard} onChanged={() => void refresh()} onSourceUnavailable={() => void refresh()} />}
    <div className="hearing-live-footer"><button type="button" className="btn btn-secondary" disabled={busy || pendingAction} onClick={() => void exportLive()}><Download size={16} aria-hidden="true" />Descargar registro de sesión</button><Link className="hearing-copy-link" href={`/causas/${causaId}/escritos?fuentes=note`}>Continuar en los escritos de la causa</Link><button type="button" className="hearing-copy-link" disabled={busy || pendingAction} onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true" />Actualizar sesión</button></div>
    {live.warnings.map(warning => <p className="hearing-live-help" key={warning}>{warning}</p>)}
  </section>;
}
