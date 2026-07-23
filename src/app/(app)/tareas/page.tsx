import Link from "next/link";
import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { StatusBadge, formatDate } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";

export default async function GlobalTasksPage() {
  const user = await getCurrentUser();
  const tasks = await prisma.task.findMany({
    include: { site: true, assignee: true },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  return (
    <div>
      <ModuleHeader
        eyebrow="Legal project management"
        title="Tasks"
        subtitle={
          user
            ? `Vista global de tareas del estudio. Sesión: ${user.name}.`
            : "Vista global de tareas del estudio."
        }
      />
      <div className="space-y-3">
        {tasks.map((t) => (
          <div key={t.id} className="panel flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{t.title}</h2>
                <StatusBadge
                  estado={t.status === "done" ? "cumplido" : t.priority === "urgent" ? "vencido" : "pendiente"}
                />
              </div>
              <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
                {t.assignee?.name || "Sin asignar"} · {formatDate(t.dueDate)} ·{" "}
                {t.site ? (
                  <Link href={`/sites/${t.site.id}/tareas`} className="text-[var(--sea)]">
                    {t.site.name}
                  </Link>
                ) : (
                  "Sin site"
                )}
              </p>
            </div>
            <span className="badge badge-ink">{t.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
