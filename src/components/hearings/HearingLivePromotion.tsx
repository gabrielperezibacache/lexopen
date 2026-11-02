"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, FilePlus2 } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import type { HearingPromotionPreview, HearingPromotionResult, HearingPromotionTarget } from "@/lib/hearings/promotions-types";
import "./hearing-live-audio.css";

const targetLabels: Record<HearingPromotionTarget, string> = { fact: "Hecho propuesto", note: "Nota de audiencia", writing: "Borrador de escrito" };
export function HearingLivePromotion({ causaId, workspaceId, source, onClose, onChanged, onBusy, onSourceUnavailable, registerGuard }: {
  causaId: string; workspaceId: string; source: { noteId: string; revision: number };
  onClose: () => void; onChanged: () => void; onBusy: (value: boolean) => void; onSourceUnavailable: () => void;
  registerGuard: (guard: (() => Promise<boolean>) | null) => void;
}) {
  const base = `/api/causas/${causaId}/hearings/${workspaceId}/live/promotions`;
  const [preview, setPreview] = useState<HearingPromotionPreview>(), [target, setTarget] = useState<HearingPromotionTarget>("writing");
  const [title, setTitle] = useState(""), [body, setBody] = useState(""), [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [result, setResult] = useState<HearingPromotionResult>(), [retry, setRetry] = useState(0), [invalid, setInvalid] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const host = useRef<HTMLElement>(null), titleInput = useRef<HTMLInputElement>(null), contentInput = useRef<HTMLTextAreaElement>(null), flight = useRef(false), mounted = useRef(true), completed = useRef(false);
  const request = useRef<{ requestId: string; source: typeof source; target: HearingPromotionTarget; title: string; body: string; reviewed: true } | null>(null);
  const callbacks = useRef({ onChanged, onBusy, onSourceUnavailable });
  useEffect(() => { callbacks.current = { onChanged, onBusy, onSourceUnavailable }; }, [onChanged, onBusy, onSourceUnavailable]);
  useEffect(() => {
    mounted.current = true; const control = new AbortController();
    fetch(`${base}?noteId=${encodeURIComponent(source.noteId)}&revision=${source.revision}`, { cache: "no-store", signal: control.signal }).then(async response => {
      const value = await response.json(); if (!response.ok) throw Object.assign(new Error(value.error || "No se pudo comprobar el registro."), { status: response.status });
      if (!control.signal.aborted) { const data = value as HearingPromotionPreview; setPreview(data); setTitle(data.source.title); setBody(data.source.body); setError(""); requestAnimationFrame(() => { host.current?.scrollIntoView({ block: "start", behavior: "instant" }); titleInput.current?.focus({ preventScroll: true }); }); }
    }).catch(reason => { if (!control.signal.aborted) { setError(reason.message || "No se pudo comprobar la fuente. Reintente antes de preparar el destino."); if ([401,403,404,409].includes(reason.status)) { setPreview(undefined); setTitle(""); setBody(""); setInvalid(true); callbacks.current.onSourceUnavailable(); } } });
    return () => { mounted.current = false; control.abort(); };
  }, [base, source.noteId, source.revision, retry]);
  useEffect(() => { callbacks.current.onBusy(busy); return () => callbacks.current.onBusy(false); }, [busy]);
  const guard = useCallback(async () => { if (completed.current) return true; host.current?.scrollIntoView({ block: "start", behavior: "instant" }); setError("Confirme o cierre la preparación antes de cambiar de mesa o salir."); return false; }, []);
  useEffect(() => { registerGuard(guard); return () => registerGuard(null); }, [registerGuard, guard]);
  const maxLength = target === "fact" ? 3000 : target === "note" ? 20000 : 100000;
  async function submit() {
    if (flight.current || !preview || invalid || !reviewed || !preview.targets[target].available) return;
    flight.current = true; setBusy(true); setError("");
    if (!request.current) request.current = { requestId: crypto.randomUUID(), source, target, title: target === "fact" ? preview.source.title : title.trim(), body: body.trim(), reviewed: true };
    setUnconfirmed(true);
    const response = await apiMutation<HearingPromotionResult>(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.current) });
    flight.current = false; if (!mounted.current) return; setBusy(false);
    if (!response.ok) {
      setError(response.error);
      if (response.status >= 400 && response.status < 500) { request.current = null; setUnconfirmed(false); }
      if ([401,403,404,409].includes(response.status)) { setPreview(undefined); setTitle(""); setBody(""); setInvalid(true); callbacks.current.onSourceUnavailable(); }
      return;
    }
    completed.current = true; setResult(response.data); request.current = null; setUnconfirmed(false); callbacks.current.onChanged();
  }
  const locked = busy || unconfirmed, available = Boolean(preview?.targets[target].available);
  return <section className="hearing-live-promotion" ref={host} data-testid="hearing-live-promotion" aria-label="Preparar destino del registro">
    <h5>Del registro a la causa</h5>
    {error && <p className="hearing-live-warning" role="alert">{error}</p>}
    {result ? <div className="hearing-live-promotion-result" role="status"><p><Check size={16} aria-hidden="true" />{result.reused ? "La conversión ya estaba guardada. Se recuperó su destino sin duplicarlo." : `${targetLabels[result.target]} guardado con sus respaldos actualmente comprobados.`}</p>{result.warnings.map(warning => <p key={warning}>{warning}</p>)}<div className="hearing-live-actions"><Link href={result.href} className="hearing-copy-link" onClick={onClose}>Abrir {targetLabels[result.target].toLocaleLowerCase("es")}</Link><button className="btn btn-secondary" type="button" onClick={onClose}>Volver al registro</button></div></div> : <>
      {!preview && !error && <p role="status">Comprobando la revisión del registro, sus fuentes y el acceso al destino…</p>}
      {!preview && error && !invalid && <button className="btn btn-secondary" type="button" onClick={() => setRetry(value => value + 1)}>Volver a comprobar el registro</button>}
      {preview && <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <p>Origen: registro de audiencia, revisión {preview.source.revision}. Revise su texto; el pasaje se cotejará al confirmar.</p>
        <label>Convertir en<select className="select" value={target} disabled={locked} onChange={event => { const value = event.target.value as HearingPromotionTarget; setTarget(value); setReviewed(false); requestAnimationFrame(() => value === "fact" ? contentInput.current?.focus() : titleInput.current?.focus()); }}>{Object.entries(targetLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {!available && <p className="hearing-live-warning">{preview.targets[target].reason}</p>}
        {target === "fact" ? <p className="hearing-live-help">Hecho propuesto, visible según los permisos de la causa y pendiente de revisión. La transcripción exige corroboración escuchando el audio.</p> : <p className="hearing-live-help">{target === "note" ? "La nota quedará en su mesa privada." : "Borrador privado con respaldos, pendiente de revisión."}</p>}
        {target !== "fact" && <label>Título de la propuesta<input ref={titleInput} className="input" value={title} maxLength={180} minLength={1} required disabled={locked || !available} onChange={event => { setTitle(event.target.value); setReviewed(false); }} /></label>}
        <label>Contenido de la propuesta<textarea ref={contentInput} className="textarea" rows={4} value={body} minLength={3} maxLength={maxLength} required disabled={locked || !available} onChange={event => { setBody(event.target.value); setReviewed(false); }} /></label>
        {body.length > maxLength && <p className="hearing-live-warning">Este destino admite {maxLength.toLocaleString("es-CL")} caracteres. Ajuste el texto antes de confirmar.</p>}
        <label className="hearing-live-check"><input type="checkbox" checked={reviewed} disabled={locked || !available} onChange={event => setReviewed(event.target.checked)} /><span>He revisado la propuesta y entiendo el alcance de sus fuentes</span></label>
        <div className="hearing-live-actions"><button className="btn btn-primary" type="submit" disabled={busy || !available || !reviewed || !title.trim() || body.trim().length < 3 || body.length > maxLength}><FilePlus2 size={16} aria-hidden="true" />{busy ? "Comprobando y guardando…" : unconfirmed ? "Reintentar conversión" : "Confirmar conversión"}</button><button className="btn btn-ghost" type="button" disabled={busy || unconfirmed} onClick={onClose}>Cancelar preparación</button></div>
        {unconfirmed && !busy && <p className="hearing-live-help">La respuesta no pudo confirmarse. Reintente la misma petición para recuperar el resultado sin duplicarlo.</p>}
        <details className="hearing-live-scope"><summary>Fuente y alcance de la propuesta</summary><p>{preview.source.title}. El pasaje respalda su cita; no acredita por sí solo toda la afirmación.</p>{preview.source.citation && <div><blockquote>{preview.source.citation.quote}</blockquote><a className="hearing-copy-link" href={preview.source.citation.href} target="_blank" rel="noreferrer">Abrir respaldo de origen</a></div>}{preview.warnings.map(warning => <p className="hearing-live-help" key={warning}>{warning}</p>)}</details>
      </form>}
      {!preview && <button className="btn btn-ghost" type="button" disabled={busy} onClick={onClose}>Cerrar preparación</button>}
    </>}
  </section>;
}
