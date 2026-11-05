import type { Prisma } from "@prisma/client";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { renderTaskWorkbook, TASK_EXPORT_LIMIT } from "./export-xlsx";
import { compareWorkspaceTasks, taskWorkspaceWhere, workspaceTaskCausa, workspaceTaskSelect, type TaskWorkspaceFilters } from "./workspace";

export async function exportPendingTasks(actor: CausaAccessUser, filters: TaskWorkspaceFilters, client: Pick<Prisma.TransactionClient, "task"> = prisma) {
  const where = taskWorkspaceWhere(actor, { ...filters, status: "pending" });
  const status = filters.status;
  const rows = await client.task.findMany({
    where: status && status !== "pending" && status !== "all" ? { AND: [where, { status }] } : where,
    select: workspaceTaskSelect,
    take: TASK_EXPORT_LIMIT + 1,
  });
  const tasks = rows.map(row => {
    const causa = workspaceTaskCausa(row);
    return { ...row, causaId: causa?.id ?? null, cause: causa ? [causa.rit, causa.titulo].filter(Boolean).join(" · ") : null, assignee: row.assignee?.name ?? null };
  });
  tasks.sort((a, b) => compareWorkspaceTasks(a, b, filters.prioritizedCausaId));
  return renderTaskWorkbook(tasks);
}
