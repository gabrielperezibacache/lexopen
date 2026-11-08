"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { civilDateKey, formatCivilDate } from "@/lib/chile-time";
import type { TaskWorkspaceFilters } from "@/lib/tasks/workspace";

type UserOption = { id: string; name: string };
type CaseOption = { id: string; titulo: string; rit: string | null };
type SiteOption = { id: string; name: string; causaId: string | null };

export type TaskWorkItem = {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  considerations: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  updatedAt: string;
  origen: string;
  causa: CaseOption | null;
  site: { id: string; name: string } | null;
  assignee: UserOption | null;
  canEdit: boolean;
};

const statuses: Record<string, string> = {
  todo: "Por hacer", in_progress: "En curso", blocked: "Bloqueada",
  waiting_client: "En espera del cliente", done: "Hecha", cancelled: "Cancelada",
};
const priorities: Record<string, string> = { urgent: "Urgente", high: "Alta", medium: "Media", low: "Baja" };
const origins: Record<string, string> = {
  manual: "Manual", minuta: "Minuta", tramite: "Trámite", pjud: "PJUD", checklist: "Lista de control",
  asistente: "Asistente", voz: "Voz", intake: "Ingreso", aprobacion: "Aprobación",
};
const filterOptions = { pending: "Pendientes", closed: "Cerradas", all: "Todas", ...statuses };

function caseLabel(cause: CaseOption) {
  return cause.rit ? `${cause.rit} · ${cause.titulo}` : cause.titulo;
}

function taskParams(filters: TaskWorkspaceFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && !(key === "status" && value === "pending")) params.set(key, value);
  }
  return params;
}

function TaskEditor({ task, cases, sites, initialCaseId, currentUserId, onClose, onSaved }: {
  task: TaskWorkItem | null;
  cases: CaseOption[];
  sites: SiteOption[];
  initialCaseId: string;
  currentUserId: string;
  onClose: () => void;
  onSaved: (notice: string) => void;
}) {
  const router = useRouter();
  const [causaId, setCausaId] = useState(initialCaseId);
  const [siteId, setSiteId] = useState("");
  const [assignee, setAssignee] = useState(task?.assignee?.id || "");
  const [eligibility, setEligibility] = useState<{ url: string; users: UserOption[]; assignOthers: boolean; error: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [retryingSave, setRetryingSave] = useState(false);
  const submission = useRef(createSubmissionKeys(undefined, `task-editor:${currentUserId}:${task?.id || "new"}`));
  const pending = useRef<{ key: string; payload: Record<string, unknown> } | null>(null);
  const search = task ? new URLSearchParams({ taskId: task.id }) : new URLSearchParams({ causaId, siteId });
  const optionsUrl = `/api/tasks/assignees?${search}`;
  const result = eligibility?.url === optionsUrl ? eligibility : null;
  const oldDate = task?.dueDate ? civilDateKey(new Date(task.dueDate)) : "";

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const reply = await fetch(optionsUrl, { signal: controller.signal, cache: "no-store" });
        const data = await reply.json();
        if (controller.signal.aborted) return;
        if (!reply.ok) {
          setEligibility({ url: optionsUrl, users: [], assignOthers: false, error: data.error || "No se pudieron consultar los responsables." });
          return;
        }
        setEligibility({ url: optionsUrl, users: data.users, assignOthers: data.assignOthers, error: "" });
      } catch {
        if (!controller.signal.aborted) setEligibility({ url: optionsUrl, users: [], assignOthers: false, error: "No se pudieron consultar los responsables." });
      }
    })();
    return () => controller.abort();
  }, [optionsUrl]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!retryingSave || !pending.current) {
      const fields = new FormData(event.currentTarget);
      const text = (field: string) => String(fields.get(field) || "").trim();
      const dueDate = text("dueDate");
      const chosenAssignee = fields.get("assigneeId");
      const data = {
        title: text("title"), description: text("description") || null,
        instructions: text("instructions") || null, considerations: text("considerations") || null,
        priority: text("priority"), status: text("status"),
        ...(!task || dueDate !== oldDate ? { dueDate: dueDate || null } : {}),
        ...(chosenAssignee !== null ? { assigneeId: chosenAssignee || null } : {}),
        ...(task ? { id: task.id, expectedUpdatedAt: task.updatedAt } : { causaId: causaId || null, siteId: siteId || null }),
      };
      pending.current = { key: submission.current.forPayload(data), payload: data };
    }
    const attempt = pending.current;
    setSaving(true);
    setError("");
    const response = await apiMutation<{ id?: string }>("/api/tasks", {
      method: task ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key },
      body: JSON.stringify(attempt.payload),
    });
    setSaving(false);
    if (!response.ok) {
      const uncertain = retryingSave || response.status === 0 || response.status === 408 || response.status >= 500;
      setRetryingSave(uncertain);
      setError(uncertain ? "No se pudo confirmar la tarea. Reintente el guardado para comprobarlo sin duplicarla." : response.error);
      return;
    }
    if (!response.data?.id) { setRetryingSave(true); setError("El servidor no confirmó la tarea. Reintente el guardado."); return; }
    submission.current.complete(attempt.payload);
    onSaved(task ? "Tarea actualizada." : "Tarea creada.");
    router.refresh();
  }

  const allowed = result?.users || [];
  const selected = allowed.some(person => person.id === assignee) || assignee === task?.assignee?.id ? assignee : "";
  return (
    <form onSubmit={save} className="space-y-5">
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <fieldset disabled={saving || retryingSave} className="space-y-5">
        <legend className="sr-only">Datos de la tarea</legend>
        <label className="block space-y-2 text-sm font-medium">
          <span>Título</span>
          <input className="input" name="title" required maxLength={300} defaultValue={task?.title} />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Descripción</span>
          <textarea className="textarea" name="description" rows={3} maxLength={20000} defaultValue={task?.description ?? ""} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span>Cómo hacerlo</span>
            <textarea className="textarea" name="instructions" rows={3} maxLength={20000} defaultValue={task?.instructions ?? ""} />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Consideraciones</span>
            <textarea className="textarea" name="considerations" rows={3} maxLength={20000} defaultValue={task?.considerations ?? ""} />
          </label>
        </div>
        {!task && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm font-medium">
              <span>Causa</span>
              <select className="select" value={causaId} onChange={event => { setCausaId(event.target.value); setSiteId(""); setAssignee(""); }}>
                <option value="">Sin causa</option>
                {cases.map(item => <option key={item.id} value={item.id}>{caseLabel(item)}</option>)}
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Espacio</span>
              <select className="select" value={siteId} onChange={event => { setSiteId(event.target.value); setAssignee(""); }}>
                <option value="">Sin espacio</option>
                {sites.filter(site => !causaId || !site.causaId || site.causaId === causaId).map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span>Responsable</span>
            <select className="select" name="assigneeId" value={selected} disabled={!result || Boolean(result.error)} onChange={event => setAssignee(event.target.value)}>
              <option value="" disabled={Boolean(task?.assignee && !result?.assignOthers)}>Sin asignar</option>
              {task?.assignee && !allowed.some(person => person.id === task.assignee?.id) && (
                <option value={task.assignee.id} disabled>{task.assignee.name} · actual</option>
              )}
              {allowed.map(person => <option key={person.id} value={person.id}>{person.id === currentUserId ? `${person.name} (yo)` : person.name}</option>)}
            </select>
            {!result && <span className="block text-xs text-[var(--muted)]" role="status">Consultando responsables…</span>}
            {result?.error && <span className="block text-xs text-[var(--danger)]" role="alert">{result.error}</span>}
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Fecha límite</span>
            <input className="input" type="date" name="dueDate" defaultValue={oldDate} />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Prioridad</span>
            <select className="select" name="priority" defaultValue={task?.priority || "medium"}>
              {Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Estado</span>
            <select className="select" name="status" defaultValue={task?.status || "todo"}>
              {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-4">
        <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Guardando…" : retryingSave ? "Reintentar guardado" : task ? "Guardar cambios" : "Crear tarea"}</button>
      </div>
    </form>
  );
}

export function GlobalTasksPanel({ tasks, filters, causes, sites, users, currentUserId, truncated }: {
  tasks: TaskWorkItem[];
  filters: TaskWorkspaceFilters;
  causes: CaseOption[];
  sites: SiteOption[];
  users: UserOption[];
  currentUserId: string;
  truncated: boolean;
}) {
  const router = useRouter();
  const [filtering, startFiltering] = useTransition();
  const [editor, setEditor] = useState<TaskWorkItem | "new" | null>(null);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [feedback, setFeedback] = useState({ error: "", notice: "" });
  const statusKeys = useRef(new Map<string, ReturnType<typeof createSubmissionKeys>>());
  const currentCase = causes.find(cause => cause.id === filters.prioritizedCausaId);
  const exportParams = taskParams({ ...filters, status: "pending" });

  function changeFilter(key: keyof TaskWorkspaceFilters, value: string) {
    const params = taskParams({ ...filters, [key]: value || null });
    startFiltering(() => router.replace(params.size ? `/tareas?${params}` : "/tareas", { scroll: false }));
  }

  async function setStatus(task: TaskWorkItem, status: string) {
    if (busyTask) return;
    setFeedback({ error: "", notice: "" });
    setBusyTask(task.id);
    const payload = { id: task.id, status, expectedUpdatedAt: task.updatedAt };
    if (!statusKeys.current.has(task.id)) statusKeys.current.set(task.id, createSubmissionKeys());
    const submission = statusKeys.current.get(task.id)!;
    const response = await apiMutation("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": submission.forPayload(payload) },
      body: JSON.stringify(payload),
    });
    setBusyTask(null);
    if (!response.ok) {
      setFeedback({ error: response.error, notice: "" });
      return;
    }
    submission.complete(payload);
    setFeedback({ error: "", notice: status === "done" ? "Tarea marcada como hecha." : "Tarea reabierta." });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-[var(--muted)]">
          {currentCase ? `Primero las tareas de ${caseLabel(currentCase)}. Luego, por prioridad y fecha límite.` : "Ordenadas por prioridad y fecha límite."}
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-secondary" href={`/api/tasks/export?${exportParams}`} download><Download size={16} aria-hidden="true" /> Excel de pendientes</a>
          <button className="btn btn-primary" type="button" onClick={() => setEditor("new")}><Plus size={16} aria-hidden="true" /> Nueva tarea</button>
        </div>
      </div>

      <fieldset disabled={filtering} className="panel space-y-4 rounded-[var(--radius-lg)] p-4" aria-label="Filtros de tareas">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="min-w-0 space-y-2 text-sm">
            <span className="block font-medium">Causa</span>
            <select className="select" value={filters.causaId || ""} onChange={event => changeFilter("causaId", event.target.value)}>
              <option value="">Todas las causas</option>
              {causes.map(cause => <option key={cause.id} value={cause.id}>{caseLabel(cause)}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            <span className="block font-medium">Priorizar causa</span>
            <select className="select" value={filters.prioritizedCausaId || ""} onChange={event => changeFilter("prioritizedCausaId", event.target.value)}>
              <option value="">Sin preferencia</option>
              {causes.map(cause => <option key={cause.id} value={cause.id}>{caseLabel(cause)}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            <span className="block font-medium">Responsable</span>
            <select className="select" value={filters.assigneeId || ""} onChange={event => changeFilter("assigneeId", event.target.value)}>
              <option value="">Todos</option>
              <option value="me">Mis tareas</option>
              <option value="none">Sin asignar</option>
              {users.filter(user => user.id !== currentUserId).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label className="min-w-0 space-y-2 text-sm">
            <span className="block font-medium">Estado</span>
            <select className="select" value={filters.status || "pending"} onChange={event => changeFilter("status", event.target.value)}>
              {Object.entries(filterOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <details open={Boolean(filters.bucket || filters.priority || filters.siteId || filters.origen) || undefined} className="border-t border-[var(--line)] pt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Más filtros</summary>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="min-w-0 space-y-2 text-sm">
              <span className="block font-medium">Vencimiento</span>
              <select className="select" value={filters.bucket || ""} onChange={event => changeFilter("bucket", event.target.value)}>
                <option value="">Cualquier fecha</option><option value="vencidas">Vencidas</option><option value="hoy">Hoy</option><option value="semana">Próximos 7 días</option>
              </select>
            </label>
            <label className="min-w-0 space-y-2 text-sm">
              <span className="block font-medium">Prioridad</span>
              <select className="select" value={filters.priority || ""} onChange={event => changeFilter("priority", event.target.value)}>
                <option value="">Todas</option>
                {Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="min-w-0 space-y-2 text-sm">
              <span className="block font-medium">Espacio</span>
              <select className="select" value={filters.siteId || ""} onChange={event => changeFilter("siteId", event.target.value)}>
                <option value="">Todos</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
            <label className="min-w-0 space-y-2 text-sm">
              <span className="block font-medium">Origen</span>
              <select className="select" value={filters.origen || ""} onChange={event => changeFilter("origen", event.target.value)}>
                <option value="">Todos</option>
                {Object.entries(origins).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </details>
      </fieldset>

      {filtering && <p className="text-sm text-[var(--muted)]" role="status">Actualizando tareas…</p>}
      {feedback.error && <p className="text-sm text-[var(--danger)]" role="alert">{feedback.error}</p>}
      {feedback.notice && <p className="text-sm text-[var(--sea)]" role="status">{feedback.notice}</p>}
      {truncated && <p className="text-sm text-[var(--muted)]">Se muestran las primeras 200 tareas. Acote los filtros para ver las demás.</p>}
      {!tasks.length ? (
        <EmptyState title="Sin tareas con estos filtros" description="Cambie los filtros o cree una tarea para empezar." />
      ) : (
        <ul className="panel divide-y divide-[var(--line)] rounded-[var(--radius-lg)]" aria-label="Tareas por prioridad">
          {tasks.map(task => (
            <li key={task.id} className="flex min-w-0 flex-col justify-between gap-4 px-4 py-5 sm:px-5 lg:flex-row lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words font-semibold">{task.title}</h2>
                  <Badge tone={task.priority === "urgent" ? "danger" : task.priority === "high" ? "warn" : "ink"}>{priorities[task.priority] || task.priority}</Badge>
                  <Badge tone={task.status === "done" ? "ok" : "ink"}>{statuses[task.status] || task.status}</Badge>
                </div>
                <p className="mt-2 break-words text-sm leading-relaxed text-[var(--muted)]">
                  {task.assignee?.name || "Sin asignar"}{task.dueDate ? ` · ${formatCivilDate(task.dueDate)}` : ""}
                  {" · "}
                  {task.causa ? <Link href={`/causas/${task.causa.id}`} className="text-[var(--sea)] hover:underline">{caseLabel(task.causa)}</Link>
                    : task.site ? <Link href={`/sites/${task.site.id}/tareas`} className="text-[var(--sea)] hover:underline">{task.site.name}</Link> : "Sin causa"}
                  {task.origen !== "manual" ? ` · ${origins[task.origen] || task.origen}` : ""}
                </p>
                {task.description && <p className="mt-2 break-words whitespace-pre-wrap text-sm">{task.description}</p>}
                {(task.instructions || task.considerations) && (
                  <details className="mt-2 text-sm">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium">Instrucciones y consideraciones</summary>
                    <dl className="space-y-2">
                      {task.instructions && <div><dt className="font-medium">Cómo hacerlo</dt><dd className="break-words whitespace-pre-wrap text-[var(--muted)]">{task.instructions}</dd></div>}
                      {task.considerations && <div><dt className="font-medium">Consideraciones</dt><dd className="break-words whitespace-pre-wrap text-[var(--muted)]">{task.considerations}</dd></div>}
                    </dl>
                  </details>
                )}
              </div>
              {task.canEdit && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button className="btn btn-ghost" type="button" onClick={() => setEditor(task)}>Editar</button>
                  <a className="btn btn-ghost" href={`/offline.html?kind=task&record=${encodeURIComponent(task.id)}`} aria-label={`Trabajar sin conexión: ${task.title}`}>Sin conexión</a>
                  <button className="btn btn-ghost" type="button" disabled={busyTask !== null} onClick={() => void setStatus(task, task.status === "done" || task.status === "cancelled" ? "todo" : "done")}>
                    {busyTask === task.id ? "Guardando…" : task.status === "done" || task.status === "cancelled" ? "Reabrir" : "Marcar hecha"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editor !== null} title={editor === "new" ? "Nueva tarea" : "Editar tarea"} onClose={() => setEditor(null)} className="w-[min(42rem,calc(100vw-1.5rem))]">
        {editor && (
          <TaskEditor
            key={editor === "new" ? "new" : editor.id}
            task={editor === "new" ? null : editor}
            cases={causes}
            sites={sites}
            initialCaseId={editor === "new" ? filters.causaId || "" : ""}
            currentUserId={currentUserId}
            onClose={() => setEditor(null)}
            onSaved={notice => { setEditor(null); setFeedback({ error: "", notice }); }}
          />
        )}
      </Dialog>
    </div>
  );
}
