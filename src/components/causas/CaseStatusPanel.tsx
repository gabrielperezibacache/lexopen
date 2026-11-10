"use client";

import { useEffect, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import type { CaseStatus } from "@/lib/causas/status";
import { labelEtapa } from "@/lib/chile";
import { caseStatusReferences } from "@/lib/causas/status-references";

type Snapshot = { status: CaseStatus; fingerprint: string };
type Analysis = { source: string; content: string; caseStatus?: Snapshot };
// Memory only, scoped by the server's actor/data fingerprint. Never persist case text in web storage.
const analyses = new Map<string, Promise<Awaited<ReturnType<typeof apiMutation<Analysis>>>>>();
function analyze(causaId: string, fingerprint: string) {
  let pending = analyses.get(fingerprint);
  if (!pending) {
    if (analyses.size >= 20) analyses.delete(analyses.keys().next().value!);
    pending = apiMutation<Analysis>("/api/ai/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "causa.estado", causaId }) });
    analyses.set(fingerprint, pending);
  }
  return pending;
}

export function CaseStatusPanel({ initial, canUseAi }: { initial: Snapshot; canUseAi: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [analysis, setAnalysis] = useState<{ fingerprint: string; text: string; error: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [retry, setRetry] = useState(0);
  const [checking, setChecking] = useState(false);
  const [unavailable, setUnavailable] = useState("");
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    let sequence = 0;
    let forceAnalysis = refresh > 0;
    async function update() {
      if (document.visibilityState === "hidden") return;
      const request = ++sequence;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(`/api/causas/${initial.status.causaId}/estado`, { cache: "no-store", signal: controller.signal });
        if (!active || request !== sequence) return;
        if (!response.ok) {
          setUnavailable(response.status === 404 || response.status === 403 ? "La causa ya no está disponible con tus permisos actuales." : "No se pudo actualizar el estado. Los datos mostrados pueden haber cambiado.");
          forceAnalysis = false; setChecking(false);
          return;
        }
        const next = await response.json() as Snapshot;
        if (!active || request !== sequence) return;
        setSnapshot(previous => previous.fingerprint === next.fingerprint ? previous : next); setUnavailable("");
        if (forceAnalysis) {
          // A manual request must verify current access/data BEFORE contacting the model.
          analyses.delete(next.fingerprint); setAnalysis(null); setRetry(value => value + 1); forceAnalysis = false;
        }
        setChecking(false);
      } catch {
        if (active && request === sequence) { setUnavailable("Sin conexión: no se pudo comprobar si el estado cambió."); forceAnalysis = false; setChecking(false); }
      }
    }
    const timer = setInterval(() => void update(), 60_000);
    if (refresh) void update();
    document.addEventListener("visibilitychange", update);
    return () => { active = false; controller?.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [initial.status.causaId, refresh]);
  useEffect(() => {
    if (!canUseAi || unavailable || checking) return;
    let active = true;
    void analyze(snapshot.status.causaId, snapshot.fingerprint).then(result => {
      if (!active) return;
      if (!result.ok) { setAnalysis({ fingerprint: snapshot.fingerprint, text: "", error: result.error }); return; }
      if (result.data.caseStatus && result.data.caseStatus.fingerprint !== snapshot.fingerprint) {
        // The model's context was read before generation and is not a fresh status read.
        analyses.delete(snapshot.fingerprint);
        setChecking(true); setRefresh(value => value + 1); return;
      }
      setAnalysis({ fingerprint: snapshot.fingerprint, text: result.data.source === "llm" ? result.data.content : "", error: result.data.source === "llm" ? "" : "La IA está en demostración: se muestran únicamente los registros de la causa." });
    });
    return () => { active = false; };
  }, [snapshot, canUseAi, retry, unavailable, checking]);

  const status = snapshot.status;
  const current = analysis?.fingerprint === snapshot.fingerprint ? analysis : null;
  const revoked = unavailable.includes("permisos actuales");
  const shownDeadlines = [...status.deadlines.filter(p => p.days < 0 || p.recordedState === "vencido").slice(0, 3), ...status.deadlines.filter(p => p.days >= 0 && p.recordedState !== "vencido").slice(0, 5)];
  const deadlineLabel = (days: number) => days < 0 ? `fecha registrada hace ${-days} ${days === -1 ? "día" : "días"}` : days === 0 ? "vence hoy" : `en ${days} ${days === 1 ? "día calendario" : "días calendario"}`;
  return <section className="panel rounded-[var(--radius-lg)] p-5" aria-labelledby="case-status-title" data-testid="case-status">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="case-status-title" className="text-lg font-semibold">Estado de la causa</h2><p className="text-sm text-[var(--muted)]">{status.today} · Se actualiza automáticamente con los registros disponibles.</p></div>
      <button className="btn btn-secondary" type="button" disabled={checking} onClick={() => { setChecking(true); setRefresh(value => value + 1); }}>{checking ? "Comprobando estado…" : canUseAi ? "Actualizar análisis" : "Actualizar estado"}</button>
    </div>
    {unavailable && <p role="status" className="mt-3 text-sm">{unavailable}</p>}
    {!revoked && <>
      <p className="mt-3 font-medium">Estado registrado: {status.state} · {labelEtapa(status.stage)}</p>
      {status.latest && <p className="mt-1 text-sm">Último movimiento: {status.latest.title} · {status.latest.date} · {status.latest.source}</p>}
      <div className="mt-4 grid gap-5 md:grid-cols-3">
        <div><h3 className="font-semibold">Plazos próximos y vencidos</h3><ul className="mt-2 space-y-2 text-sm">{shownDeadlines.map(p => <li key={p.id}><a href="#plazos" className="break-words text-[var(--sea)]">{p.fatal ? "Fatal · " : ""}{p.title}</a><p>{p.date} · {deadlineLabel(p.days)}{p.recordedState === "vencido" ? " · marcado vencido" : ""}</p></li>)}</ul>{!status.deadlines.length && <p className="mt-2 text-sm">No hay plazos abiertos registrados.</p>}{status.counts.plazos > shownDeadlines.length && <a className="text-sm text-[var(--sea)]" href="#plazos">Ver los {status.counts.plazos} plazos abiertos</a>}</div>
        <div><h3 className="font-semibold">Qué se está esperando</h3><ul className="mt-2 space-y-2 text-sm">{status.waiting.slice(0, 5).map(m => <li key={m.id}><a href="#actividad" className="break-words text-[var(--sea)]">Resolución pendiente: {m.title}</a><p>{m.date} · {m.source}</p></li>)}</ul>{!status.waiting.length && !status.waitingTasks.length && !(status.fiscaliaRequests ?? []).some(r => r.status === "submitted") && <p className="mt-2 text-sm">No consta una espera marcada como pendiente de resolución. Revisar movimientos y actualizar su seguimiento.</p>}{status.waitingTasks.slice(0, 5).map(task => <p key={task.id} className="mt-2 break-words text-sm"><a href={`/tareas?causaId=${status.causaId}`} className="text-[var(--sea)]">{task.waitingOn ? `Espera registrada (${task.waitingOn})` : task.state === "waiting_client" ? "Esperando al cliente" : "Tarea bloqueada"}: {task.title}</a></p>)}{(status.fiscaliaRequests ?? []).filter(r => r.status === "submitted").slice(0, 3).map(r => <p key={r.id} className="mt-2 text-sm"><a className="break-words text-[var(--sea)]" href={`/mi-fiscalia?causaId=${status.causaId}`}>Esperando respuesta de Mi Fiscalía: {r.title}</a><span className="block break-words text-xs text-[var(--muted)]">Presentación registrada por el usuario{r.folio ? ` · Folio ${r.folio}` : ""}</span></p>)}{status.waitingTasks.length > 5 && <a className="mt-2 block text-sm text-[var(--sea)]" href={`/tareas?causaId=${status.causaId}`}>Revisar todas las tareas en espera</a>}{status.counts.movimientos > 5 && <a className="text-sm text-[var(--sea)]" href="#actividad">Revisar los {status.counts.movimientos} movimientos pendientes</a>}</div>
        <div><h3 className="font-semibold">Qué se necesita ahora</h3><ul className="mt-2 space-y-2 text-sm">{status.needs.map(item => <li key={item.source}><a href={item.href} className="break-words text-[var(--sea)]">{item.title}</a></li>)}</ul>{!status.needs.length && <p className="mt-2 text-sm">Revisar el último movimiento y registrar la siguiente gestión o espera.</p>}</div>
      </div>
      {status.missing.length > 0 && <details className="mt-4 text-sm" open><summary className="cursor-pointer font-medium">Información por comprobar</summary><ul className="mt-2 list-disc space-y-1 pl-5">{status.missing.map(text => <li key={text}>{text}</li>)}</ul></details>}
      {canUseAi && <div className="mt-4 border-t border-[var(--line)] pt-4"><h3 className="font-semibold">Lectura de Altazor</h3><div role="status" className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{unavailable ? "El análisis se actualizará al recuperar la comprobación de los datos." : current?.text ? caseStatusReferences(current.text, status).map((part, index) => part.href ? <a key={index} href={part.href} className="text-[var(--sea)] underline underline-offset-2" title={part.label}>{part.label}</a> : part.unverified ? <span key={index} className="font-medium" title={part.text}>[Referencia no comprobada]</span> : part.text) : current?.error || "Altazor está preparando el estado de la causa…"}</div></div>}
      <p className="mt-4 text-xs text-[var(--muted)]">Las fechas provienen de los plazos registrados. La distancia indicada es de calendario; el análisis no recalcula términos legales ni acredita el expediente judicial. Las esperas reflejan marcas guardadas que pueden requerir actualización.</p>
    </>}
  </section>;
}
