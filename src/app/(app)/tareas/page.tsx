import { GlobalTasksPanel } from "@/components/GlobalTasksPanel";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { causaAccessWhere, siteAccessWhere as scopedsiteAccessWhere, taskAccessWhere as scopedtaskAccessWhere } from "@/lib/auth/causa-access";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";

export default async function GlobalTasksPage() {
  const user = await requireStaff();
  const { dict } = await getI18n();
  const h = dict.hubs.tareas;
  const causaFilter = causaAccessWhere(user);
  const [tasks, sites, users] = await Promise.all([
    prisma.task.findMany({
      where: { AND: [scopedtaskAccessWhere(user), {
        OR: [{ causaId: null }, { causa: causaFilter }],
      }] },
      include: {
        site: { select: { id: true, name: true } },
        causa: { select: { id: true, titulo: true, rit: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 500,
    }),
    prisma.site.findMany({
      where: { AND: [scopedsiteAccessWhere(user), { status: "active" }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
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
          causaId: t.causaId,
          origen: t.origen,
          site: t.site ? { id: t.site.id, name: t.site.name } : null,
          causa: t.causa
            ? { id: t.causa.id, titulo: t.causa.titulo, rit: t.causa.rit }
            : null,
          assignee: t.assignee
            ? { id: t.assignee.id, name: t.assignee.name }
            : null,
        }))}
        sites={sites}
        users={users}
        currentUserId={user.id}
      />
    </div>
  );
}
