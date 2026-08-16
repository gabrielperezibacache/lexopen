"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation(`/api/sites/${siteId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        description: fd.get("description"),
        priority: fd.get("priority"),
        dueDate: fd.get("dueDate") || null,
        assigneeId: fd.get("assigneeId") || null,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo crear la tarea");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Nueva tarea
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={onSubmit} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Nueva tarea</h3>
            <input className="input" name="title" required placeholder="Título" />
            <textarea className="textarea" name="description" placeholder="Descripción" />
            <select className="select" name="priority" defaultValue="medium">
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
            <select className="select" name="assigneeId" defaultValue="">
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input className="input" type="date" name="dueDate" />
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
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
                {busy ? "Creando…" : "Crear"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function TaskStatusButton({
  taskId,
  siteId,
  status,
}: {
  taskId: string;
  siteId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setStatus(next: string) {
    setBusy(true);
    setError("");
    const result = await apiMutation(`/api/sites/${siteId}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status: next }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo actualizar la tarea");
      return;
    }
    router.refresh();
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
            onClick={() => setStatus("in_progress")}
          >
            En curso
          </button>
        )}
        <button
          className="btn btn-ghost"
          type="button"
          disabled={busy}
          onClick={() => setStatus("done")}
        >
          Marcar hecha
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
