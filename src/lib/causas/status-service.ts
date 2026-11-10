import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { causaAccessWhere, plazoAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { taskWorkspaceAccessWhere, taskWorkspaceWhere } from "@/lib/tasks/workspace";
import { httpError } from "@/lib/auth/access";
import { buildCaseStatus } from "./status";
import { santiagoDateKey, santiagoMidnight } from "@/lib/chile-time";

export async function readCaseStatus(id: string, user: CausaAccessUser, db = prisma) {
  const plazos = { AND: [plazoAccessWhere(user), { estado: { in: ["pendiente", "vencido"] } }] };
  const tramites = { estado: { in: ["pendiente", "en_curso"] }, OR: [{ task: null }, { task: { is: taskWorkspaceAccessWhere(user) } }] };
  const row = await db.causa.findFirst({
    where: { AND: [{ id }, causaAccessWhere(user)] },
    select: {
      id: true, estado: true, etapa: true, fechaNotificacion: true, pjudLastSyncAt: true, pjudLastSyncStatus: true, pjudMonitoreoActivo: true,
      plazos: { where: plazos, orderBy: [{ fechaLimite: "asc" }, { id: "asc" }], take: 100, select: { id: true, titulo: true, estado: true, fechaLimite: true, esFatal: true } },
      tramites: { where: tramites, orderBy: [{ fechaLimite: { sort: "asc", nulls: "last" } }, { orden: "asc" }, { id: "asc" }], take: 40, select: { id: true, titulo: true, estado: true, fechaLimite: true, responsable: { select: { name: true } } } },
      movimientos: { orderBy: [{ fecha: "desc" }, { id: "asc" }], take: 1, select: { id: true, titulo: true, fecha: true, fuente: true } },
      _count: { select: { plazos: { where: plazos }, tramites: { where: tramites }, movimientos: { where: { pendienteResolucion: true } } } },
    },
  });
  if (!row) throw httpError("Causa no encontrada o sin acceso", 404);
  // Repeat the ethical-wall predicate for this second read as membership may expire.
  const today = santiagoDateKey(new Date());
  const taskWhere = taskWorkspaceWhere(user, { causaId: id });
  const [pendientes, upcoming, tasks, taskCount] = await Promise.all([
    db.causaMovimiento.findMany({ where: { causaId: id, pendienteResolucion: true, causa: causaAccessWhere(user) }, orderBy: [{ fecha: "desc" }, { id: "asc" }], take: 20, select: { id: true, titulo: true, fecha: true, fuente: true } }),
    // Many historical overdue records must not hide the next real deadlines.
    db.plazo.findMany({ where: { AND: [plazos, { causaId: id, causa: causaAccessWhere(user), OR: [{ fechaLimite: { gte: santiagoMidnight(today) } }, { fechaLimite: new Date(today) }] }] }, orderBy: [{ fechaLimite: "asc" }, { id: "asc" }], take: 20, select: { id: true, titulo: true, estado: true, fechaLimite: true, esFatal: true } }),
    db.task.findMany({ where: taskWhere, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { id: "asc" }], take: 40, select: { id: true, title: true, status: true, waitingOn: true, assignee: { select: { name: true } } } }),
    db.task.count({ where: taskWhere }),
  ]);
  const status = buildCaseStatus({ ...row, plazos: [...new Map([...row.plazos, ...upcoming].map(p => [p.id, p])).values()], pendientes, tasks, taskCount });
  const fingerprint = createHash("sha256").update(JSON.stringify({ user: { id: user.id, role: user.role, grants: user.capabilityGrants, revokes: user.capabilityRevokes }, status })).digest("hex");
  return { status, fingerprint };
}
