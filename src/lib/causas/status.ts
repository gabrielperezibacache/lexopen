import { civilDateKey, diffCivilDays, santiagoDateKey } from "@/lib/chile-time";

type Deadline = { id: string; titulo: string; estado: string; fechaLimite: Date; esFatal: boolean };
type Step = { id: string; titulo: string; estado: string; fechaLimite: Date | null; responsable: { name: string } | null };
type Movement = { id: string; titulo: string; fecha: Date; fuente: string };
export type CaseStatusInput = {
  id: string; estado: string; etapa: string; fechaNotificacion: Date | null;
  pjudLastSyncAt: Date | null; pjudLastSyncStatus: string | null; pjudMonitoreoActivo: boolean;
  plazos: Deadline[]; tramites: Step[]; movimientos: Movement[]; pendientes: Movement[];
  _count: { plazos: number; tramites: number; movimientos: number };
  tasks?: { id: string; title: string; status: string; waitingOn: string | null; assignee: { name: string } | null }[];
  taskCount?: number;
};

/** Describes saved evidence only. Calendar distances are NOT a legal recomputation. */
export function buildCaseStatus(row: CaseStatusInput, now = new Date()) {
  const today = santiagoDateKey(now);
  const deadlines = row.plazos.map(p => ({ id: p.id, title: p.titulo, date: civilDateKey(p.fechaLimite),
    days: diffCivilDays(today, civilDateKey(p.fechaLimite)), fatal: p.esFatal, recordedState: p.estado,
  })).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const steps = row.tramites.map(t => ({ id: t.id, title: t.titulo, state: t.estado,
    date: t.fechaLimite ? civilDateKey(t.fechaLimite) : null, owner: t.responsable?.name ?? null,
  }));
  const waiting = row.pendientes.map(m => ({ id: m.id, title: m.titulo, date: civilDateKey(m.fecha), source: m.fuente }));
  const waitingTasks = (row.tasks ?? []).filter(t => t.waitingOn || ["waiting_client", "blocked"].includes(t.status)).map(t => ({ id: t.id, title: t.title, state: t.status, waitingOn: t.waitingOn }));
  const latest = row.movimientos[0];
  const missing = [
    ...(!row.fechaNotificacion ? ["No consta fecha de notificación: comprobarla antes de computar nuevos plazos."] : []),
    ...(!row._count.plazos ? ["No hay plazos abiertos registrados; esto no confirma que no existan vencimientos legales."] : []),
    ...(!latest ? ["No hay movimientos registrados para confirmar el último avance."] : []),
    ...(!row.pjudMonitoreoActivo ? ["Monitoreo judicial no activo: contrastar el expediente antes de concluir que no hubo novedades."] : []),
    ...(row.pjudMonitoreoActivo && (row.pjudLastSyncStatus !== "ok" || !row.pjudLastSyncAt) ? ["La última sincronización judicial no está confirmada como completa."] : []),
    ...(row._count.plazos > deadlines.length || row._count.tramites > steps.length || row._count.movimientos > waiting.length || (row.taskCount ?? 0) > (row.tasks?.length ?? 0) ? ["Se muestra una selección de pendientes; revisar las secciones completas de la causa."] : []),
  ];
  const urgent = deadlines.filter(p => p.days <= 7 || p.recordedState === "vencido");
  const priorities = [...new Map([
    ...urgent.filter(p => p.days < 0 || p.recordedState === "vencido").slice(0, 2),
    ...urgent.filter(p => p.days >= 0 && p.recordedState !== "vencido").slice(0, 3),
    ...urgent,
  ].map(p => [p.id, p])).values()].slice(0, 5);
  const needs = [
    ...priorities.map(p => ({ title: `${p.days < 0 || p.recordedState === "vencido" ? "Revisar vencimiento" : p.days === 0 ? "Atender hoy" : "Preparar cumplimiento"}: ${p.title}`, source: `plazo:${p.id}`, href: "#plazos" })),
    ...steps.slice(0, 5).map(t => ({ title: `${t.title}${t.owner ? ` · ${t.owner}` : " · asignar responsable"}`, source: `tramite:${t.id}`, href: "#tramites" })),
    ...(row.tasks ?? []).slice(0, 5).map(t => ({ title: `${t.title} · ${t.status === "waiting_client" ? "esperando al cliente" : t.status === "blocked" ? "desbloquear tarea" : t.assignee?.name ?? "asignar responsable"}`, source: `tarea:${t.id}`, href: `/tareas?causaId=${row.id}` })),
  ];
  return { causaId: row.id, today, state: row.estado, stage: row.etapa, deadlines, steps, waiting, waitingTasks, needs, missing,
    counts: row._count, taskCount: row.taskCount ?? 0,
    latest: latest ? { id: latest.id, title: latest.titulo, date: civilDateKey(latest.fecha), source: latest.fuente } : null,
    judicialSync: { at: row.pjudLastSyncAt?.toISOString() ?? null, status: row.pjudLastSyncStatus, enabled: row.pjudMonitoreoActivo },
  };
}
export type CaseStatus = ReturnType<typeof buildCaseStatus>;
