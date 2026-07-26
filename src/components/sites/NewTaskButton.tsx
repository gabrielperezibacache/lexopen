"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/sites/${siteId}/tasks`, {
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
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit">
                Crear
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
  async function setStatus(next: string) {
    await fetch(`/api/sites/${siteId}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, status: next }),
    });
    router.refresh();
  }
  if (status === "done") {
    return <span className="text-sm text-[var(--ok)]">{STATUS_LABEL.done}</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "in_progress" && (
        <button className="btn btn-ghost" type="button" onClick={() => setStatus("in_progress")}>
          En curso
        </button>
      )}
      <button className="btn btn-ghost" type="button" onClick={() => setStatus("done")}>
        Marcar hecha
      </button>
    </div>
  );
}
