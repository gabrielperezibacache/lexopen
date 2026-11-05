import type { Prisma } from "@prisma/client";
import { causaAccessWhere, taskAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { addCivilDays, santiagoDateKey, santiagoMidnight } from "@/lib/chile-time";
import { prisma } from "@/lib/db";

export const taskPriorities = ["urgent", "high", "medium", "low"] as const;
const pendingStatuses = ["todo", "in_progress", "blocked", "waiting_client"];
const closedStatuses = ["done", "cancelled"];
const origins = ["manual", "minuta", "pjud", "checklist", "tramite", "asistente", "voz", "intake", "aprobacion"];
const buckets = ["vencidas", "hoy", "semana"] as const;

export type TaskWorkspaceFilters = {
  causaId?: string | null;
  prioritizedCausaId?: string | null;
  assigneeId?: string | null;
  siteId?: string | null;
  origen?: string | null;
  status?: string | null;
  priority?: string | null;
  bucket?: string | null;
};

export function readTaskWorkspaceFilters(params: { get(key: string): string | null }): TaskWorkspaceFilters {
  const bounded = (key: string) => {
    const value = params.get(key);
    return value && value.length <= 100 ? value : null;
  };
  const allowed = (key: string, choices: readonly string[]) => {
    const value = params.get(key);
    return value && choices.includes(value) ? value : null;
  };
  return {
    causaId: bounded("causaId"), prioritizedCausaId: bounded("prioritizedCausaId"),
    assigneeId: bounded("assigneeId"), siteId: bounded("siteId"),
    origen: allowed("origen", origins),
    status: allowed("status", ["pending", "closed", "all", ...pendingStatuses, ...closedStatuses]) || "pending",
    priority: allowed("priority", taskPriorities), bucket: allowed("bucket", buckets),
  };
}

export function taskWorkspaceAccessWhere(user: CausaAccessUser): Prisma.TaskWhereInput {
  return { AND: [
    taskAccessWhere(user),
    // Legacy actions from minutes can lack both direct cause and space.
    { minutaAcciones: { every: { minuta: { causa: causaAccessWhere(user) } } } },
  ] };
}

export function taskWorkspaceCauseMatch(causaId: string): Prisma.TaskWhereInput {
  return { OR: [
    { causaId },
    { causaId: null, site: { causaId } },
    { causaId: null, OR: [{ siteId: null }, { site: { causaId: null } }], minutaAcciones: { some: { minuta: { causaId } } } },
  ] };
}

export function taskWorkspaceWhere(user: CausaAccessUser, filters: TaskWorkspaceFilters, now = new Date()): Prisma.TaskWhereInput {
  const status = filters.status ?? "pending";
  const where: Prisma.TaskWhereInput[] = [taskWorkspaceAccessWhere(user)];
  if (status === "pending") where.push({ status: { in: pendingStatuses } });
  else if (status === "closed") where.push({ status: { in: closedStatuses } });
  else if (status !== "all") where.push({ status });
  if (filters.causaId) where.push(taskWorkspaceCauseMatch(filters.causaId));
  if (filters.siteId) where.push({ siteId: filters.siteId });
  if (filters.origen) where.push({ origen: filters.origen });
  if (filters.priority) where.push({ priority: filters.priority });
  if (filters.assigneeId === "none") where.push({ assigneeId: null });
  else if (filters.assigneeId) where.push({ assigneeId: filters.assigneeId === "me" ? user.id : filters.assigneeId });
  if (filters.bucket) {
    const today = santiagoDateKey(now);
    const start = santiagoMidnight(today);
    const days = filters.bucket === "semana" ? 7 : 1;
    const next = addCivilDays(today, days);
    // Legacy date-only values are stored at UTC midnight. Do not count the
    // next date-only deadline as late-night activity on the current day.
    where.push(filters.bucket === "vencidas"
      ? { dueDate: { lt: start, not: new Date(today) }, status: { in: pendingStatuses } }
      : { OR: [
        { dueDate: { gte: start, lt: santiagoMidnight(next), not: new Date(next) } },
        { dueDate: { in: Array.from({ length: days }, (_, i) => new Date(addCivilDays(today, i))) } },
      ] });
  }
  return { AND: where };
}

const causeSelect = { id: true, titulo: true, rit: true } as const;
export const workspaceTaskSelect = {
  id: true, title: true, description: true, instructions: true, considerations: true, status: true, priority: true,
  dueDate: true, updatedAt: true, causaId: true, siteId: true, assigneeId: true, creatorId: true, origen: true,
  assignee: { select: { id: true, name: true } },
  causa: { select: causeSelect },
  site: { select: { id: true, name: true, causa: { select: causeSelect } } },
  minutaAcciones: { orderBy: { id: "asc" }, take: 1, select: { minuta: { select: { causa: { select: causeSelect } } } } },
} as const satisfies Prisma.TaskSelect;

export type WorkspaceTaskRow = Prisma.TaskGetPayload<{ select: typeof workspaceTaskSelect }>;

export function workspaceTaskCausa(task: Pick<WorkspaceTaskRow, "causa" | "site" | "minutaAcciones">) {
  return task.causa ?? task.site?.causa ?? task.minutaAcciones[0]?.minuta.causa ?? null;
}

type SortableTask = { id: string; causaId: string | null; priority: string; status: string; dueDate: Date | string | null };
const priorityRanks = new Map<string, number>(taskPriorities.map((value, index) => [value, index]));

export function compareWorkspaceTasks(a: SortableTask, b: SortableTask, prioritizedCausaId?: string | null) {
  const closedRank = (task: SortableTask) => Number(closedStatuses.includes(task.status));
  const causeRank = (task: SortableTask) => prioritizedCausaId && task.causaId === prioritizedCausaId ? 0 : 1;
  const due = (task: SortableTask) => task.dueDate === null ? Infinity : new Date(task.dueDate).getTime();
  return closedRank(a) - closedRank(b) || causeRank(a) - causeRank(b) ||
    (priorityRanks.get(a.priority) ?? 4) - (priorityRanks.get(b.priority) ?? 4) || due(a) - due(b) || a.id.localeCompare(b.id);
}

export async function listWorkspaceTasks(user: CausaAccessUser, filters: TaskWorkspaceFilters, limit: number) {
  const where = taskWorkspaceWhere(user, filters);
  const orderBy = [{ dueDate: "asc" }, { id: "asc" }] as const;
  const take = limit + 1;
  const first = await prisma.task.findMany({ where, select: workspaceTaskSelect, orderBy: [...orderBy], take });
  if (first.length < take) {
    const sortKey = (task: WorkspaceTaskRow) => ({ ...task, causaId: workspaceTaskCausa(task)?.id ?? null });
    return { tasks: first.sort((a, b) => compareWorkspaceTasks(sortKey(a), sortKey(b), filters.prioritizedCausaId)), truncated: false };
  }

  // With a full initial page, select by rank in the database before limiting.
  const statusGroups: Prisma.TaskWhereInput[] = filters.status === "all"
    ? [{ status: { notIn: closedStatuses } }, { status: { in: closedStatuses } }]
    : [{}];
  const causeMatch = filters.prioritizedCausaId ? taskWorkspaceCauseMatch(filters.prioritizedCausaId) : null;
  const causeGroups: Prisma.TaskWhereInput[] = causeMatch ? [causeMatch, { NOT: causeMatch }] : [{}];
  const priorityGroups: Prisma.TaskWhereInput[] = filters.priority
    ? [{}]
    : [...taskPriorities.map(priority => ({ priority })), { priority: { notIn: [...taskPriorities] } }];
  const tasks: WorkspaceTaskRow[] = [];
  for (const status of statusGroups) {
    for (const cause of causeGroups) {
      for (const priority of priorityGroups) {
        tasks.push(...await prisma.task.findMany({
          where: { AND: [where, status, cause, priority] }, select: workspaceTaskSelect,
          orderBy: [...orderBy], take: limit - tasks.length,
        }));
        if (tasks.length === limit) return { tasks, truncated: true };
      }
    }
  }
  return { tasks, truncated: true };
}
