import Link from "next/link";
import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { formatDate } from "@/components/ui";

export default async function CalendarPage() {
  const [tasks, plazos] = await Promise.all([
    prisma.task.findMany({
      where: { dueDate: { not: null } },
      include: { site: true, assignee: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.plazo.findMany({
      include: { causa: true, responsable: true },
      orderBy: { fechaLimite: "asc" },
    }),
  ]);

  const events = [
    ...tasks.map((t) => ({
      id: `task-${t.id}`,
      date: t.dueDate!,
      title: t.title,
      kind: "task" as const,
      href: t.siteId ? `/sites/${t.siteId}/tareas` : "/tareas",
      meta: t.assignee?.name || "",
    })),
    ...plazos.map((p) => ({
      id: `plazo-${p.id}`,
      date: p.fechaLimite,
      title: p.titulo,
      kind: "plazo" as const,
      href: p.causaId ? `/causas/${p.causaId}` : "/plazos",
      meta: p.causa?.rit || p.tipo,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div>
      <ModuleHeader
        eyebrow="Shared calendar"
        title="Calendario"
        subtitle="Tasks HighQ + plazos procesales chilenos en una sola línea de tiempo."
      />
      <div className="panel overflow-hidden rounded-3xl">
        <div className="divide-y divide-[var(--line)]">
          {events.map((e) => (
            <Link
              key={e.id}
              href={e.href}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-white/60"
            >
              <div>
                <div className="text-xs uppercase tracking-[0.12em] text-[var(--copper)]">
                  {e.kind === "task" ? "Task" : "Plazo Chile"}
                </div>
                <div className="mt-1 font-medium">{e.title}</div>
                <div className="text-sm text-[var(--ink-soft)]/65">{e.meta}</div>
              </div>
              <div className="text-sm font-semibold">{formatDate(e.date)}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
