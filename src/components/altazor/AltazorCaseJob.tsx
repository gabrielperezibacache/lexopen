"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiMutation } from "@/lib/api-mutation";
import {
  createSubmissionKeys,
  operationKey,
} from "@/lib/client-submission-key";
import type { CaseJobView } from "@/lib/altazor/case-jobs/types";

const working = new Set(["queued", "running", "awaiting_help", "saving"]);
const labels: Record<string, string> = {
  queued: "En cola",
  running: "Trabajando",
  awaiting_help: "Esperando tu respuesta",
  awaiting_review: "Listo para revisar",
  awaiting_plan: "Plan actualizado pendiente de confirmar",
  completed: "Completado",
  partial: "Guardado parcial: revisa los recibos",
  interrupted: "Interrumpido",
  blocked: "Requiere revisar el plan",
  cancelled: "Cancelado",
  saving: "Guardando registros confirmados", waiting:"Esperando resultado",failed:"No completado",
};
export function AltazorCaseJob({ id, onContinue }: { id: string; onContinue?: (id: string, hash: string) => void }) {
  const [job, setJob] = useState<CaseJobView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [answer, setAnswer] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pendingSave = useRef<Record<string, unknown> | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { title: string; body: string; selected: boolean }>
  >({});
  const state = useRef<CaseJobView | null>(null),
    inFlight = useRef(false),
    mounted = useRef(true),
    initialized = useRef(-1);
  const keys = useRef(
    createSubmissionKeys(operationKey, `lexopen:case-job:${id}`),
  );
  function clearLocalEdits() {
    setDrafts({});
    setAnswer("");
    pendingSave.current = null;
    setUncertain(false);
    initialized.current = -1;
  }
  function hideUnverifiedJob(accessLost: boolean) {
    if (!mounted.current) return;
    state.current = null;
    setJob(null);
    if (accessLost) clearLocalEdits();
    setError(accessLost
      ? "El encargo ya no está disponible con tu acceso actual."
      : "No se pudo comprobar el encargo. Vuelve a intentarlo para continuar.");
  }
  function accept(value: CaseJobView) {
    if (!mounted.current) return;
    state.current = value;
    setJob(value);
    if (!value.available) {
      clearLocalEdits();
      return;
    }
    if (
      value.status === "awaiting_review" &&
      initialized.current !== value.revision
    ) {
      const rows: (readonly [
        string,
        { title: string; body: string; selected: boolean },
      ])[] =
        value.report?.tasks.map(
          (t, i) =>
            [
              `task-${i}`,
              { title: t.title, body: t.description, selected: true },
            ] as const,
        ) || [];
      if (value.report?.draft)
        rows.push([
          "draft",
          {
            title: value.report.draft.title,
            body: value.report.draft.body,
            selected: true,
          },
        ]);
      if (initialized.current !== -1) {
        pendingSave.current = null;
        setUncertain(false);
        setError("Las propuestas cambiaron. Revisa la versión actual antes de confirmar.");
      }
      setDrafts(Object.fromEntries(rows));
      initialized.current = value.revision;
    }
  }
  async function refresh(advance = false) {
    if (inFlight.current || document.hidden) return;
    inFlight.current = true;
    try {
      const response = await fetch(
        `/api/altazor/case-jobs/${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        hideUnverifiedJob([401, 403, 404, 409, 410].includes(response.status));
        return;
      }
      const value = (await response.json()) as CaseJobView;
      if (mounted.current && !state.current) setError("");
      accept(value);
      if (advance && value.available && working.has(value.status)) {
        const result = await apiMutation<CaseJobView>(
          `/api/altazor/case-jobs/${id}/advance`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: operationKey(),
              expectedRevision: value.revision,
            }),
          },
        );
        if (result.ok) accept(result.data);
        else if (result.status !== 409 && mounted.current)
          setError(result.error);
      }
    } catch {
      hideUnverifiedJob(false);
    } finally {
      inFlight.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    const initial = setTimeout(() => void refresh(true), 0);
    const timer = setInterval(() => {
      if (state.current && working.has(state.current.status))
        void refresh(true);
    }, 5000);
    const focus = () => void refresh(true);
    window.addEventListener("focus", focus);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
    // The request state lives in refs so polling never replaces an edited proposal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  async function action(name: string, payload: Record<string, unknown> = {}) {
    if (!job || busy) return;
    setBusy(true);
    setError("");
    const body = {
      requestId: operationKey(),
      expectedRevision: job.revision,
      ...payload,
    };
    const result = await apiMutation<CaseJobView>(
      `/api/altazor/case-jobs/${id}/${name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (result.ok) {
      accept(result.data);
      if (name === "answer") setAnswer("");
    } else {
      setError(result.error);
      await refresh();
    }
    setBusy(false);
  }
  async function save() {
    if (!job || busy) return;
    const snapshot = Object.entries(drafts)
      .filter(([, v]) => v.selected)
      .map(([key, v]) => ({ id: key, title: v.title, body: v.body }));
    const value = pendingSave.current ||
      job.savedSelection || {
        expectedRevision: job.revision,
        proposals: snapshot,
      };
    const keyPayload = {
      expectedRevision: value.expectedRevision,
      proposals: value.proposals,
    };
    const requestId =
      (value as { requestId?: string }).requestId ||
      job.savedSelection?.requestId ||
      keys.current.forPayload(keyPayload);
    pendingSave.current = { ...value, requestId };
    setBusy(true);
    setError("");
    const result = await apiMutation<CaseJobView>(
      `/api/altazor/case-jobs/${id}/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, requestId }),
      },
    );
    if (result.ok) {
      accept(result.data);
      pendingSave.current = null;
      setUncertain(false);
      if (result.data.status === "completed") keys.current.complete(keyPayload);
    } else {
      setError(result.error);
      const unknown = !result.status || result.status >= 500;
      setUncertain(unknown);
      if (!unknown) pendingSave.current = null;
      if ([403, 404, 409].includes(result.status)) await refresh();
    }
    setBusy(false);
  }
  if (!job)
    return (
      <section className="panel p-3" aria-label="Encargo de la causa">
        <p>{error || "Comprobando encargo…"}</p>
        <button className="btn btn-ghost" onClick={() => void refresh()}>
          Comprobar encargo
        </button>
      </section>
    );
  const edit = (
    key: string,
    field: "title" | "body" | "selected",
    value: string | boolean,
  ) => setDrafts((old) => ({ ...old, [key]: { ...old[key], [field]: value } }));
  return (
    <section
      className="panel min-w-0 space-y-3 p-4"
      aria-label="Encargo de la causa"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>
          {job.status === "completed" && job.progress.failed
            ? "Finalizado con limitaciones"
            : labels[job.status] || "Estado por comprobar"}
        </strong>
        <span>
          {job.progress.completed}/{job.progress.planned} acciones
        </span>
      </div>
      <p className="break-words text-sm">{job.objective}</p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Link
        className="text-sm underline"
        href={`/causas/${job.causaId}/expediente`}
      >
        Abrir expediente
      </Link>
      {job.available && (
        <p className="text-xs text-[var(--muted)]">
          Revisión preparada el{" "}
          {new Intl.DateTimeFormat("es-CL", {
            timeZone: "America/Santiago",
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(job.asOf))}
          , hora de Chile. Usa los registros disponibles; no actualiza OJV.
        </p>
      )}
      {job.available && (
        <p className="text-xs text-[var(--muted)]">
          {job.coverage.extracted}/{job.coverage.documents} documentos
          preparados · {job.coverage.unavailable} sin preparar ·{" "}
          {job.coverage.partial} con extracción parcial. Las etapas de análisis
          constan en el detalle.
        </p>
      )}
      {job.pendingPlan && (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-sm">
            {job.pendingPlan.preview}
          </p>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              void action("resume", { confirmation: job.pendingPlan!.hash })
            }
          >
            Confirmar equipo y fuentes actualizados
          </button>
        </div>
      )}
      {job.available && <details className="text-sm">
        <summary>Equipo y modelos confirmados</summary>
        <p>Altazor · {job.coordinator?.model} · {job.coordinator?.provider}</p>
        <ul>{job.team.map((member, index) => <li key={index}>
          {member.name} · {member.model} · {member.provider}
          {member.memoryLabels?.length > 0 && <ul aria-label={`Recuerdos elegidos para ${member.name}`} className="ml-5 list-disc">
            {member.memoryLabels.map((label, i) => <li key={i}>{label}</li>)}
          </ul>}
        </li>)}</ul>
      </details>}
      {job.help && (
        <div className="space-y-2">
          <p className="text-sm">{job.help.question}</p>
          {job.help.status === "pending" ? (
            <>
              <label className="block text-sm">
                Respuesta al encargo
                <textarea
                  className="input"
                  value={answer}
                  maxLength={4000}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              </label>
              <button
                className="btn btn-primary"
                disabled={busy || !answer.trim()}
                onClick={() => void action("answer", { response: answer })}
              >
                Responder
              </button>
            </>
          ) : (
            <p className="text-sm">
              {job.help.status === "expired"
                ? "Venció el plazo para responder."
                : job.help.status === "cancelled"
                  ? "La solicitud de ayuda se detuvo."
                  : "Respuesta recibida. El encargo espera su continuación."}
            </p>
          )}
        </div>
      )}
      {job.available && job.progress.failed > 0 && (
        <p role="status" className="text-sm">
          {job.progress.failed} acciones no completadas. Revisa esas
          limitaciones antes de guardar propuestas.
        </p>
      )}
      {job.available && job.report && (
        <div className="space-y-2 text-sm">
          <p className="whitespace-pre-wrap break-words">
            {job.report.summary}
          </p>
          {job.report.waits.length > 0 && (
            <>
              <h4 className="font-semibold">Qué se espera</h4>
              <ul className="list-disc pl-5">
                {job.report.waits.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {job.report.needs.length > 0 && (
            <>
              <h4 className="font-semibold">Qué se necesita ahora</h4>
              <ul className="list-disc pl-5">
                {job.report.needs.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-[var(--muted)]">
            Propuesta para revisión profesional. No acredita presentación de
            escritos ni cumplimiento de plazos.
          </p>
          {job.references.length > 0 && (
            <details>
              <summary>Fuentes cotejadas · {job.references.length}</summary>
              <ul className="space-y-2">
                {job.references.map((r) => (
                  <li key={r.id}>
                    <Link className="text-[var(--sea)] underline" href={r.href}>
                      [{r.id}] {r.title}
                    </Link>
                    <blockquote className="whitespace-pre-wrap break-words">
                      {r.quote}
                    </blockquote>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {job.available && job.continuationHash && onContinue && <button type="button" className="btn btn-secondary" disabled={busy}
        onClick={() => onContinue(id, job.continuationHash!)}>Continuar este encargo</button>}
      {job.available && job.status === "awaiting_review" && (
        <fieldset disabled={busy || uncertain} className="min-w-0 space-y-3">
          <legend className="font-semibold">Registros propuestos</legend>
          <p className="text-xs text-[var(--muted)]">Las tareas pertenecen a la causa y se ven según sus permisos. Los borradores son privados.</p>
          {Object.entries(drafts).map(([key, value]) => (
            <div
              key={key}
              className="min-w-0 space-y-2 rounded border border-[var(--line)] p-3"
            >
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={value.selected}
                  onChange={(e) => edit(key, "selected", e.target.checked)}
                />
                {key === "draft"
                  ? "Guardar borrador privado"
                  : "Crear tarea asignada a mí"}
              </label>
              <label className="block text-sm">
                Título de {key === "draft" ? "borrador" : "tarea"}
                <input
                  className="input"
                  maxLength={key === "draft" ? 200 : 300}
                  value={value.title}
                  onChange={(e) => edit(key, "title", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Contenido propuesto
                <textarea
                  className="input min-h-24"
                  maxLength={key === "draft" ? 12000 : 5000}
                  value={value.body}
                  onChange={(e) => edit(key, "body", e.target.value)}
                />
              </label>
            </div>
          ))}
          <button className="btn btn-primary" onClick={() => void save()}>
            Confirmar registros seleccionados
          </button>
        </fieldset>
      )}
      {uncertain && (
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void save()}
        >
          Reintentar confirmación de registros
        </button>
      )}
      {job.available && job.status === "partial" && (
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void save()}
        >
          Reintentar registros pendientes
        </button>
      )}
      {job.receipts.length > 0 && (
        <ul className="space-y-1 text-sm">
          {job.receipts.map((r) => (
            <li key={r.entityId}>
              <Link className="underline" href={r.href}>
                Abrir registro: {r.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <details className="text-sm">
        <summary>Ver acciones y recibos</summary>
        {job.steps.map((s) => (
          <div key={s.id} className="my-2 break-words">
            <span>
              {s.label} · {labels[s.status] || s.status}
              {s.errorCode ? " · requiere revisión" : ""}
            </span>
            {s.href && (
              <Link className="ml-2 underline" href={s.href}>
                Abrir registro
              </Link>
            )}
          </div>
        ))}
        {job.nextStep !== null && (
          <button
            className="btn btn-ghost"
            onClick={async () => {
              const response = await fetch(
                `/api/altazor/case-jobs/${id}?afterStep=${job.nextStep}`,
                { cache: "no-store" },
              );
              if (response.ok) {
                const next = (await response.json()) as CaseJobView;
                accept({ ...next, steps: [...job.steps, ...next.steps] });
              } else
                setError("No se pudieron comprobar las siguientes acciones.");
            }}
          >
            Ver siguientes acciones
          </button>
        )}
      </details>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => void refresh(true)}
        >
          Actualizar estado
        </button>
        {job.canResume && ["blocked", "interrupted"].includes(job.status) && (
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void action("resume")}
          >
            Revisar y reanudar
          </button>
        )}
        {job.help && ["expired", "cancelled"].includes(job.help.status) && (
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void action("resume")}
          >
            Solicitar nueva respuesta
          </button>
        )}
        {!["completed", "cancelled"].includes(job.status) && (
          <button
            className="btn btn-outline"
            disabled={busy}
            onClick={() => void action("cancel")}
          >
            Cancelar encargo
          </button>
        )}
      </div>
    </section>
  );
}
