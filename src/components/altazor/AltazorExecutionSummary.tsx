export type ExecutionProgress = { summary: string; planned: number; completed: number; failed: number };

export function AltazorExecutionSummary({ progress, status }: { progress: ExecutionProgress; status: string }) {
  const total = Math.max(0, progress.planned), completed = Math.min(total, Math.max(0, progress.completed)), failed = Math.max(0, progress.failed);
  const working = ["queued", "running", "confirmed", "delegating"].includes(status);
  const label = status === "awaiting_confirmation" ? "Antes de empezar" : status === "queued" ? "En cola" : status === "delegating" ? "Ícaros en curso" : working ? "En curso" : status === "cancelled" ? "Detenido" : failed || ["failed", "partial", "blocked", "interrupted"].includes(status) ? "Requiere revisión" : "Finalizado";
  return <section className="altazor-execution-summary" aria-label="Resumen del encargo" data-testid="altazor-execution-summary">
    <div className="altazor-execution-heading"><strong>{label}</strong><span {...(working ? { role: "status", "aria-live": "polite" as const, "aria-atomic": true } : {})}>{total > 0 ? `${completed} de ${total} ${total === 1 ? "acción completada" : "acciones completadas"}` : working ? "Preparando el trabajo" : "Sin acciones registradas"}{failed > 0 ? ` · ${failed} ${failed === 1 ? "incidencia" : "incidencias"}` : ""}</span></div>
    {(working || status === "awaiting_confirmation") && <p>{progress.summary}</p>}
    {total > 0 && <progress value={completed} max={total} aria-label="Acciones completadas" />}
  </section>;
}
