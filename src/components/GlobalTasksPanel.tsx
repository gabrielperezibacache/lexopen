"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, formatDate } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { apiMutation } from "@/lib/api-mutation";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  siteId: string | null;
  assigneeId: string | null;
  site: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
};

type SiteOpt = { id: string; name: string };
type UserOpt = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  todo: "Por hacer",
  in_progress: "En curso",
  blocked: "Bloqueada",
  done: "Hecha",
};

export function GlobalTasksPanel({
  initialTasks,
  sites,
  users,
  currentUserId,
}: {
  initialTasks: Task[];
  sites: SiteOpt[];
  users: UserOpt[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [status, setStatus] = useState("");
  const [siteId, setSiteId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (status && t.status !== status) return false;
      if (siteId && t.siteId !== siteId) return false;
      if (assigneeId === "me" && t.assigneeId !== currentUserId) return false;
      if (assigneeId && assigneeId !== "me" && t.assigneeId !== assigneeId) return false;
      return true;
    });
  }, [tasks, status, siteId, assigneeId, currentUserId]);

  async function reload() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (siteId) params.set("siteId", siteId);
    if (assigneeId === "me") params.set("mine", "1");
    else if (assigneeId) params.set("assigneeId", assigneeId);
    const res = await fetch(`/api/tasks?${params.toString()}`);
    if (res.ok) setTasks(await res.json());
    router.refresh();
  }

  async function createTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const result = await apiMutation("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        description: fd.get("description"),
        priority: fd.get("priority"),
        dueDate: fd.get("dueDate") || null,
        siteId: fd.get("siteId") || null,
        assigneeId: fd.get("assigneeId") || null,
      }),
    });
    setBusy(false);
    if (!result.ok) return;
    setOpen(false);
    form.reset();
    await reload();
  }

  async function setTaskStatus(id: string, next: string) {
    const result = await apiMutation<Task>("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    if (!result.ok) return;
    const updated = result.data;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)));
  }

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-end gap-3 rounded-3xl p-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">Estado</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="todo">Por hacer</option>
            <option value="in_progress">En curso</option>
            <option value="blocked">Bloqueada</option>
            <option value="done">Hecha</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">Espacio</span>
          <select className="select" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Todos</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">Asignado</span>
          <select
            className="select"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="me">Yo</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary ml-auto" type="button" onClick={() => setOpen(true)}>
          Nueva tarea
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin tareas con estos filtros"
          description="Cree una tarea global o ábrala desde un espacio concreto."
          action={
            <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
              Nueva tarea
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="panel flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{t.title}</h2>
                  <StatusBadge
                    estado={
                      t.status === "done"
                        ? "cumplido"
                        : t.priority === "urgent"
                          ? "vencido"
                          : "pendiente"
                    }
                  />
                  <span className="badge badge-ink">{STATUS_LABEL[t.status] || t.status}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
                  {t.assignee?.name || "Sin asignar"} · {formatDate(t.dueDate)} ·{" "}
                  {t.site ? (
                    <Link href={`/sites/${t.site.id}/tareas`} className="text-[var(--sea)]">
                      {t.site.name}
                    </Link>
                  ) : (
                    "Sin espacio"
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {t.status !== "in_progress" && t.status !== "done" && (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setTaskStatus(t.id, "in_progress")}
                  >
                    En curso
                  </button>
                )}
                {t.status !== "done" ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setTaskStatus(t.id, "done")}
                  >
                    Marcar hecha
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setTaskStatus(t.id, "todo")}
                  >
                    Reabrir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={createTask} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Nueva tarea</h3>
            <input className="input" name="title" required placeholder="Título" />
            <textarea className="textarea" name="description" placeholder="Descripción" />
            <select className="select" name="siteId" defaultValue="">
              <option value="">Sin espacio</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className="select" name="assigneeId" defaultValue="">
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select className="select" name="priority" defaultValue="medium">
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
            <input className="input" type="date" name="dueDate" />
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={busy} type="submit">
                {busy ? "…" : "Crear"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
