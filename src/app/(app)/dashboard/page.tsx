import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate, StatusBadge } from "@/components/ui";
import { labelMateria } from "@/lib/chile";
import { ArrowRight, Building2, Briefcase, ListTodo, MessageSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";

async function ensureSeeded() {
  const count = await prisma.site.count().catch(() => 0);
  if (count === 0) {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("npx", ["prisma", "db", "push", "--skip-generate"], {
      cwd: process.cwd(),
      env: process.env,
    }).catch(() => undefined);
    await execFileAsync("npx", ["tsx", "prisma/seed.ts"], {
      cwd: process.cwd(),
      env: process.env,
    });
  }
}

export default async function DashboardPage() {
  await ensureSeeded();
  const user = await getCurrentUser();

  const [sites, causas, tasksOpen, unread, sitesList, tasks, actividades] =
    await Promise.all([
      prisma.site.count({ where: { status: "active" } }),
      prisma.causa.count({ where: { estado: "activa" } }),
      prisma.task.count({ where: { status: { in: ["todo", "in_progress", "blocked"] } } }),
      user
        ? prisma.notification.count({ where: { userId: user.id, read: false } })
        : Promise.resolve(0),
      prisma.site.findMany({
        include: { _count: { select: { files: true, tasks: true } }, causa: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.task.findMany({
        where: { status: { not: "done" } },
        include: { site: true, assignee: true },
        orderBy: { dueDate: "asc" },
        take: 6,
      }),
      prisma.activity.findMany({
        include: { user: true, site: true, causa: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

  const stats = [
    { label: "Sites activos", value: sites, icon: Building2 },
    { label: "Causas activas", value: causas, icon: Briefcase },
    { label: "Tasks abiertas", value: tasksOpen, icon: ListTodo },
    { label: "Notificaciones", value: unread, icon: MessageSquare },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            HighQ-style home
          </p>
          <h1 className="display mt-2 text-4xl">
            {user ? `Hola, ${user.name.split(" ")[0]}` : "Dashboard"}
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
            Sites, tasks, activity stream y causas Chile en un solo control center.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/sites" className="btn btn-secondary">
            Ver sites
          </Link>
          <Link href="/causas/nueva" className="btn btn-primary">
            Nueva causa <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="panel rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--ink-soft)]/70">{label}</span>
              <Icon size={18} className="text-[var(--copper)]" />
            </div>
            <div className="display mt-3 text-4xl">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sites recientes</h2>
            <Link href="/sites" className="text-sm text-[var(--sea)]">
              Todos
            </Link>
          </div>
          <div className="space-y-3">
            {sitesList.map((s) => (
              <Link
                key={s.id}
                href={`/sites/${s.id}`}
                className="block rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 transition hover:border-[var(--sea)]/40"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <div className="font-medium">{s.name}</div>
                </div>
                <div className="mt-1 text-sm text-[var(--ink-soft)]/70">
                  {s.tipo} · {s._count.files} files · {s._count.tasks} tasks
                  {s.causa?.rit ? ` · ${s.causa.rit}` : ""}
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">My tasks</h2>
            <Link href="/tareas" className="text-sm text-[var(--sea)]">
              Ver todas
            </Link>
          </div>
          <div className="space-y-3">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3"
              >
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="mt-1 text-sm text-[var(--ink-soft)]/70">
                    {t.site?.name || "—"} · {formatDate(t.dueDate)}
                  </div>
                </div>
                <StatusBadge
                  estado={t.priority === "urgent" ? "vencido" : "pendiente"}
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel rounded-3xl p-5">
        <h2 className="mb-4 text-lg font-semibold">Activity stream</h2>
        <div className="space-y-3">
          {actividades.map((a) => (
            <div key={a.id} className="flex gap-3 border-b border-[var(--line)] pb-3 last:border-0">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--copper)]" />
              <div>
                <div className="text-sm">{a.mensaje}</div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]/60">
                  {a.user?.name || "Sistema"} · {a.site?.name || a.causa?.rit || labelMateria(a.causa?.materia || "") || "General"} ·{" "}
                  {formatDate(a.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
