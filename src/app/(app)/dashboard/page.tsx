import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate, StatusBadge } from "@/components/ui";
import { labelMateria } from "@/lib/chile";
import {
  ArrowRight,
  Briefcase,
  ListTodo,
  ContactRound,
  ClipboardList,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { TRAMITES_ABIERTOS, isTramiteVencido } from "@/lib/tramites";

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
  if (process.env.NODE_ENV === "development") {
    await ensureSeeded();
  }
  const user = await getCurrentUser();

  const now = new Date();
  const [
    causas,
    clientesActivos,
    tramitesPendientesCount,
    tramitesVencidosCount,
    tasksOpen,
    sitesList,
    tasks,
    actividades,
    minutasRecientes,
    tramitesPendientes,
    tramitesVencidos,
  ] = await Promise.all([
      prisma.causa.count({ where: { estado: "activa" } }),
      prisma.cliente.count({ where: { estado: "activo" } }),
      prisma.tramite.count({
        where: { estado: { in: [...TRAMITES_ABIERTOS] } },
      }),
      prisma.tramite.count({
        where: {
          estado: { in: [...TRAMITES_ABIERTOS] },
          fechaLimite: { lt: now },
        },
      }),
      prisma.task.count({ where: { status: { in: ["todo", "in_progress", "blocked"] } } }),
      prisma.site.findMany({
        include: { _count: { select: { files: true, tasks: true } }, causa: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.task.findMany({
        where: {
          status: { not: "done" },
          ...(user ? { assigneeId: user.id } : {}),
        },
        include: { site: true, assignee: true },
        orderBy: { dueDate: "asc" },
        take: 6,
      }),
      prisma.activity.findMany({
        include: { user: true, site: true, causa: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.minuta.findMany({
        include: {
          causa: { select: { id: true, rit: true, titulo: true } },
          acciones: {
            where: { estado: { in: ["pendiente", "en_curso"] } },
          },
        },
        orderBy: { fecha: "desc" },
        take: 5,
      }),
      prisma.tramite.findMany({
        where: { estado: { in: [...TRAMITES_ABIERTOS] } },
        include: {
          causa: {
            select: {
              id: true,
              rit: true,
              titulo: true,
              cliente: { select: { id: true, razonSocial: true } },
            },
          },
          responsable: { select: { name: true } },
        },
        orderBy: [{ fechaLimite: "asc" }, { updatedAt: "desc" }],
        take: 8,
      }),
      prisma.tramite.findMany({
        where: {
          estado: { in: [...TRAMITES_ABIERTOS] },
          fechaLimite: { lt: now },
        },
        include: {
          causa: {
            select: {
              id: true,
              rit: true,
              titulo: true,
              cliente: { select: { id: true, razonSocial: true } },
            },
          },
          responsable: { select: { name: true } },
        },
        orderBy: [{ fechaLimite: "asc" }],
        take: 6,
      }),
    ]);

  const stats = [
    { label: "Clientes activos", value: clientesActivos, icon: ContactRound, href: "/clientes" },
    { label: "Causas activas", value: causas, icon: Briefcase, href: "/causas" },
    {
      label: "Trámites vencidos",
      value: tramitesVencidosCount,
      icon: ClipboardList,
      href: "/clientes",
    },
    { label: "Tareas abiertas", value: tasksOpen, icon: ListTodo, href: "/tareas" },
  ];

  function tramiteHref(t: (typeof tramitesPendientes)[number]) {
    if (t.causa.cliente) {
      return `/clientes/${t.causa.cliente.id}?causa=${t.causa.id}`;
    }
    return `/causas/${t.causa.id}#tramites`;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            Inicio del estudio
          </p>
          <h1 className="display mt-2 text-4xl">
            {user ? `Hola, ${user.name.split(" ")[0]}` : "Inicio"}
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
            Clientes, causas, trámites pendientes, minutas y actividad del estudio.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/clientes" className="btn btn-secondary">
            Clientes
          </Link>
          <Link href="/causas/nueva" className="btn btn-primary">
            Nueva causa <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href} className="panel rounded-3xl p-5 transition hover:border-[var(--sea)]/40">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--ink-soft)]/70">{label}</span>
              <Icon size={18} className="text-[var(--copper)]" />
            </div>
            <div className="display mt-3 text-4xl">{value}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Trámites vencidos
              {tramitesPendientesCount > 0 ? (
                <span className="ml-2 text-sm font-normal text-[var(--ink-soft)]/60">
                  · {tramitesPendientesCount} abiertos
                </span>
              ) : null}
            </h2>
            <Link href="/clientes" className="text-sm text-[var(--sea)]">
              Ver CRM
            </Link>
          </div>
          <div className="space-y-3">
            {(tramitesVencidos.length ? tramitesVencidos : tramitesPendientes).map(
              (t) => {
                const vencido = isTramiteVencido(t.estado, t.fechaLimite, now);
                return (
                  <Link
                    key={t.id}
                    href={tramiteHref(t)}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 transition hover:border-[var(--sea)]/40"
                  >
                    <div>
                      <div className="font-medium">{t.titulo}</div>
                      <div className="mt-1 text-sm text-[var(--ink-soft)]/70">
                        {t.causa.cliente?.razonSocial || "Sin cliente"} ·{" "}
                        {t.causa.rit || t.causa.titulo}
                        {t.fechaLimite
                          ? ` · límite ${formatDate(t.fechaLimite)}`
                          : ""}
                      </div>
                    </div>
                    <StatusBadge
                      estado={
                        vencido
                          ? "vencido"
                          : t.estado === "en_curso"
                            ? "activa"
                            : "pendiente"
                      }
                    />
                  </Link>
                );
              }
            )}
            {tramitesPendientes.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                No hay trámites abiertos.
              </p>
            )}
            {tramitesPendientes.length > 0 && tramitesVencidos.length === 0 && (
              <p className="text-xs text-[var(--ink-soft)]/55">
                Sin vencidos: se muestran los próximos pendientes.
              </p>
            )}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Espacios recientes</h2>
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
                  {s.tipo} · {s._count.files} archivos · {s._count.tasks} tareas
                  {s.causa?.rit ? ` · ${s.causa.rit}` : ""}
                </div>
              </Link>
            ))}
            {sitesList.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                Aún no hay espacios.{" "}
                <Link href="/sites" className="text-[var(--sea)]">
                  Crear un espacio
                </Link>
              </p>
            )}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Mis tareas</h2>
            <Link href="/tareas" className="text-sm text-[var(--sea)]">
              Ver todas
            </Link>
          </div>
          <div className="space-y-3">
            {tasks.map((t) => (
              <Link
                key={t.id}
                href={t.siteId ? `/sites/${t.siteId}/tareas` : "/tareas"}
                className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 transition hover:border-[var(--sea)]/40"
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
              </Link>
            ))}
            {tasks.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                No tiene tareas asignadas.{" "}
                <Link href="/tareas" className="text-[var(--sea)]">
                  Ver bandeja global
                </Link>
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="panel rounded-3xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Minutas recientes</h2>
          <Link href="/minutas" className="text-sm text-[var(--sea)]">
            Ver todas
          </Link>
        </div>
        <div className="space-y-3">
          {minutasRecientes.map((m) => (
            <Link
              key={m.id}
              href={`/causas/${m.causaId}/minutas/${m.id}`}
              className="block rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 transition hover:border-[var(--sea)]/40"
            >
              <div className="font-medium">{m.titulo}</div>
              <div className="mt-1 text-sm text-[var(--ink-soft)]/70">
                {m.causa.rit || m.causa.titulo} · {m.tipo} ·{" "}
                {m.acciones.length} pendientes
              </div>
            </Link>
          ))}
          {minutasRecientes.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">
              Sin minutas aún. Tras cada audiencia o reunión, genere el handoff.
            </p>
          )}
        </div>
      </section>

      <section className="panel rounded-3xl p-5">
        <h2 className="mb-4 text-lg font-semibold">Actividad reciente</h2>
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
          {actividades.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">Sin actividad reciente.</p>
          )}
        </div>
      </section>
    </div>
  );
}
