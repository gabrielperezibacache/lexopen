import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { requireStaff } from "@/lib/auth/session";
import { GlobalTasksPanel } from "@/components/GlobalTasksPanel";
import { getI18n } from "@/lib/i18n/server";

export default async function GlobalTasksPage() {
  const user = await requireStaff();
  const { dict } = await getI18n();
  const h = dict.hubs.tareas;
  const [tasks, sites, users] = await Promise.all([
    prisma.task.findMany({
      include: { site: true, assignee: true },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    prisma.site.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { not: "cliente" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <ModuleHeader
        eyebrow={h.eyebrow}
        title={h.title}
        subtitle={`${h.subtitle} ${user.name}.`}
      />
      <GlobalTasksPanel
        initialTasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString() ?? null,
          siteId: t.siteId,
          assigneeId: t.assigneeId,
          site: t.site ? { id: t.site.id, name: t.site.name } : null,
          assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
        }))}
        sites={sites}
        users={users}
        currentUserId={user.id}
      />
    </div>
  );
}
