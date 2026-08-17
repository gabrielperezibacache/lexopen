import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertSitePageAccess } from "@/lib/auth/access";
import { SiteNav } from "@/components/sites/SiteNav";
import { StatusBadge, formatDate } from "@/components/ui";
import { NewTaskButton, TaskStatusButton } from "@/components/sites/NewTaskButton";
import { EmptyState } from "@/components/EmptyState";
import { getI18n } from "@/lib/i18n/server";
import { taskPriorityLabel, taskStatusLabel } from "@/lib/sites/labels";

type Params = { params: Promise<{ id: string }> };

export default async function SiteTasksPage({ params }: Params) {
  const { id } = await params;
  await assertSitePageAccess(id);
  const { t, dict } = await getI18n();
  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      members: { include: { user: true } },
      cliente: true,
      causa: true,
    },
  });
  if (!site) notFound();
  const tasks = await prisma.task.findMany({
    where: { siteId: id },
    include: { assignee: true, creator: true },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  return (
    <div>
      <SiteNav
        siteId={site.id}
        siteName={site.name}
        tipo={site.tipo}
        color={site.color}
        active="/tareas"
        clienteName={site.cliente?.razonSocial}
        causaRit={site.causa?.rit || site.causa?.titulo}
        isClientVisible={site.isClientVisible}
        status={site.status}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <p className="text-sm text-[var(--ink-soft)]/75">
          Gestión de proyecto — asignación, prioridad y fechas límite.
        </p>
        <NewTaskButton
          siteId={site.id}
          members={site.members.map((m) => ({ id: m.user.id, name: m.user.name }))}
        />
      </div>
      <div className="space-y-3">
        {tasks.map((task) => (
          <div key={task.id} className="panel flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{task.title}</h2>
                <StatusBadge
                  estado={
                    task.status === "done"
                      ? "cumplido"
                      : task.priority === "urgent"
                        ? "vencido"
                        : "pendiente"
                  }
                />
                <span className="badge badge-ink">{taskPriorityLabel(dict, task.priority)}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
                {task.assignee?.name || "Sin asignar"} · {formatDate(task.dueDate)} ·{" "}
                {taskStatusLabel(dict, task.status)}
              </p>
              {task.description && (
                <p className="mt-2 text-sm text-[var(--ink-soft)]/80">{task.description}</p>
              )}
            </div>
            <TaskStatusButton taskId={task.id} siteId={site.id} status={task.status} />
          </div>
        ))}
        {tasks.length === 0 && (
          <EmptyState
            title={t("sites.tasksEmpty")}
            description=""
            action={
              <NewTaskButton
                siteId={site.id}
                members={site.members.map((m) => ({ id: m.user.id, name: m.user.name }))}
              />
            }
          />
        )}
      </div>
    </div>
  );
}
