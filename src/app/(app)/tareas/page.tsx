import { GlobalTasksPanel } from "@/components/GlobalTasksPanel";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { causaAccessWhere, siteAccessWhere } from "@/lib/auth/causa-access";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { taskMutationPermissions } from "@/lib/tasks/service";
import { listWorkspaceTasks, readTaskWorkspaceFilters, workspaceTaskCausa } from "@/lib/tasks/workspace";

export default async function GlobalTasksPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaff();
  const [{ dict }, query, causes, sites, users, delegators] = await Promise.all([
    getI18n(),
    searchParams,
    prisma.causa.findMany({
      where: causaAccessWhere(user), select: { id: true, titulo: true, rit: true },
      orderBy: [{ titulo: "asc" }, { id: "asc" }],
    }),
    prisma.site.findMany({
      where: { AND: [siteAccessWhere(user), { status: "active" }] },
      select: { id: true, name: true, causaId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    activeDelegadorIds(user.id, "task.assign"),
  ]);
  const filters = readTaskWorkspaceFilters({ get(key) { const value = query[key]; return typeof value === "string" ? value : null; } });
  if (!causes.some(cause => cause.id === filters.prioritizedCausaId)) filters.prioritizedCausaId = null;
  const { tasks, truncated } = await listWorkspaceTasks(user, filters, 200);

  return (
    <div>
      <ModuleHeader title={dict.hubs.tareas.title} subtitle={dict.hubs.tareas.subtitle} artwork="tasks" />
      <GlobalTasksPanel
        tasks={tasks.map(task => ({
          id: task.id, title: task.title, description: task.description, instructions: task.instructions,
          considerations: task.considerations, status: task.status, priority: task.priority,
          dueDate: task.dueDate?.toISOString() ?? null, updatedAt: task.updatedAt.toISOString(), origen: task.origen,
          causa: workspaceTaskCausa(task), site: task.site ? { id: task.site.id, name: task.site.name } : null,
          assignee: task.assignee, canEdit: taskMutationPermissions(user, task, delegators).edit,
        }))}
        causes={causes}
        sites={sites}
        users={users}
        currentUserId={user.id}
        filters={filters}
        truncated={truncated}
      />
    </div>
  );
}
