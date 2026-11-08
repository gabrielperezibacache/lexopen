"use client";

import { Dialog } from "@/components/ui/Dialog";
import { WorkspaceField } from "./WorkspaceField";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";

const STATUS_LABEL: Record<string, string> = {
  todo: "Por hacer",
  in_progress: "En curso",
  blocked: "Bloqueada",
  done: "Hecha",
};

export function NewTaskButton({
  siteId,
  members,
}: {
  siteId: string;
  members: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const submission = useRef(createSubmissionKeys(undefined, `site-task-create:${siteId}`));
  const pending = useRef<{ key: string; payload: Record<string, unknown> } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!retrying || !pending.current) {
      const fd = new FormData(e.currentTarget);
      const payload = {
        title: fd.get("title"), description: fd.get("description"), priority: fd.get("priority"),
        dueDate: fd.get("dueDate") || null, assigneeId: fd.get("assigneeId") || null,
      };
      pending.current = { key: submission.current.forPayload(payload), payload };
    }
    const attempt = pending.current;
    setBusy(true);
    setError("");
    const result = await apiMutation<{ id?: string }>(`/api/sites/${siteId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key },
      body: JSON.stringify(attempt.payload),
    });
    setBusy(false);
    if (!result.ok) {
      const uncertain = retrying || result.status === 0 || result.status === 408 || result.status >= 500;
      setRetrying(uncertain);
      setError(uncertain ? "No se pudo confirmar la tarea. Reintente el guardado para comprobarlo sin duplicarla." : result.error);
      return;
    }
    if (!result.data?.id) { setRetrying(true); setError("El servidor no confirmó la tarea. Reintente el guardado."); return; }
    submission.current.complete(attempt.payload);
    pending.current = null;
    setRetrying(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Nueva tarea
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Nueva tarea">
          <form onSubmit={onSubmit} className="space-y-4">
            <fieldset disabled={busy || retrying} className="space-y-4">
              <legend className="sr-only">Datos de la tarea</legend>
              <WorkspaceField label="Título"><input className="input" name="title" required maxLength={300} placeholder="Título" /></WorkspaceField>
              <WorkspaceField label="Descripción"><textarea className="textarea" name="description" maxLength={20000} placeholder="Descripción" /></WorkspaceField>
              <WorkspaceField label="Prioridad"><select className="select" name="priority" defaultValue="medium">
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select></WorkspaceField>
              <WorkspaceField label="Responsable"><select className="select" name="assigneeId" defaultValue="">
                <option value="">Sin asignar</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select></WorkspaceField>
              <WorkspaceField label="Fecha límite"><input className="input" type="date" name="dueDate" /></WorkspaceField>
            </fieldset>
            {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Creando…" : retrying ? "Reintentar guardado" : "Crear"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

export function TaskStatusButton({
  taskId,
  siteId,
  status,
  updatedAt,
}: {
  taskId: string;
  siteId: string;
  status: string;
  updatedAt: string;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const busy = loadingAction !== null;
  const [error, setError] = useState("");
  const submission = useRef(createSubmissionKeys());

  async function setStatus(next: string) {
    if (busy) return;
    setLoadingAction(next);
    setError("");
    const payload = { id: taskId, status: next, expectedUpdatedAt: updatedAt };
    try {
    const result = await apiMutation(`/api/sites/${siteId}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": submission.current.forPayload(payload) },
      body: JSON.stringify(payload),
    });
    if (!result.ok) {
      setError(result.error || "No se pudo actualizar la tarea");
      return;
    }
    submission.current.complete(payload);
    router.refresh();
    } finally { setLoadingAction(null); }
  }
  if (status === "done") {
    return <span className="text-sm text-[var(--ok)]">{STATUS_LABEL.done}</span>;
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status !== "in_progress" && (
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            aria-busy={loadingAction === "in_progress"}
            onClick={() => setStatus("in_progress")}
          >
            {loadingAction === "in_progress" ? "Actualizando…" : "En curso"}
          </button>
        )}
        <button
          className="btn btn-ghost"
          type="button"
          disabled={busy}
          aria-busy={loadingAction === "done"}
          onClick={() => setStatus("done")}
        >
          {loadingAction === "done" ? "Marcando…" : "Marcar hecha"}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
