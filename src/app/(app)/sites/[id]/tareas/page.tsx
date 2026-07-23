import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/sites/SiteNav";
import { StatusBadge, formatDate } from "@/components/ui";
import { NewTaskButton, TaskStatusButton } from "@/components/sites/NewTaskButton";

type Params = { params: Promise<{ id: string }> };

export default async function SiteTasksPage({ params }: Params) {
  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: { members: { include: { user: true } } },
  });
  if (!site) notFound();
  const tasks = await prisma.task.findMany({
    where: { siteId: id },
    include: { assignee: true, creator: true },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  return (
    <div>
      <SiteNav siteId={site.id} siteName={site.name} tipo={site.tipo} color={site.color} active="/tareas" />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--ink-soft)]/75">
          Legal project management — asignación, prioridad y due dates.
        </p>
        <NewTaskButton
          siteId={site.id}
          members={site.members.map((m) => ({ id: m.user.id, name: m.user.name }))}
        />
      </div>
      <div className="space-y-3">
        {tasks.map((t) => (
          <div key={t.id} className="panel flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4">
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
                <span className="badge badge-ink">{t.priority}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
                {t.assignee?.name || "Sin asignar"} · {formatDate(t.dueDate)} · {t.status}
              </p>
              {t.description && (
                <p className="mt-2 text-sm text-[var(--ink-soft)]/80">{t.description}</p>
              )}
            </div>
            <TaskStatusButton taskId={t.id} siteId={site.id} status={t.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
