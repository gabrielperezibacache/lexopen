import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate, StatusBadge } from "@/components/ui";
import { labelMateria } from "@/lib/chile";
import { TRAMITES_ABIERTOS, isTramiteVencido } from "@/lib/tramites";
import {
  ArrowRight,
  Briefcase,
  ListTodo,
  ContactRound,
  AlertTriangle,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/sites/SiteNav";
import { getI18n } from "@/lib/i18n/server";
import { siteTipoLabel } from "@/lib/sites/labels";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const { t, dict } = await getI18n();
  const now = new Date();

  const [
    causas,
    tasksOpen,
    unread,
    clientesActivos,
    tramitesPendientesCount,
    sitesList,
    tasks,
    actividades,
    minutasRecientes,
    tramitesPendientes,
    tramitesVencidos,
  ] = await Promise.all([
    prisma.causa.count({ where: { estado: "activa" } }),
    prisma.task.count({ where: { status: { in: ["todo", "in_progress", "blocked"] } } }),
    user
      ? prisma.notification.count({ where: { userId: user.id, read: false } })
      : Promise.resolve(0),
    prisma.cliente.count({ where: { estado: "activo" } }),
    prisma.tramite.count({
      where: { estado: { in: [...TRAMITES_ABIERTOS] } },
    }),
    prisma.site.findMany({
      include: {
        _count: { select: { files: true, tasks: true } },
        causa: true,
        cliente: { select: { id: true, razonSocial: true } },
      },
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
      orderBy: [{ fechaLimite: "asc" }, { orden: "asc" }],
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
      },
      orderBy: { fechaLimite: "asc" },
      take: 6,
    }),
  ]);

  const stats = [
    {
      label: t("dashboard.stats.activeClients"),
      value: clientesActivos,
      icon: ContactRound,
      href: "/clientes",
    },
    {
      label: t("dashboard.stats.activeCases"),
      value: causas,
      icon: Briefcase,
      href: "/causas",
    },
    {
      label: t("dashboard.stats.overdueFilings"),
      value: tramitesVencidos.length,
      icon: AlertTriangle,
      href: "/clientes",
    },
    {
      label: t("dashboard.stats.openTasks"),
      value: tasksOpen,
      icon: ListTodo,
      href: "/tareas",
    },
  ];

  function tramiteHref(t: {
    causa: {
      id: string;
      cliente: { id: string } | null;
    };
  }) {
    if (t.causa.cliente) {
      return `/clientes/${t.causa.cliente.id}?causa=${t.causa.id}`;
    }
    return `/causas/${t.causa.id}#tramites`;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("dashboard.eyebrow")}
        title={
          user
            ? t("dashboard.hello").replace("{name}", user.name.split(" ")[0])
            : t("dashboard.titleFallback")
        }
        subtitle={t("dashboard.subtitle")}
        actions={
          <>
            <Link href="/clientes" className="btn btn-secondary">
              {t("dashboard.clients")}
            </Link>
            <Link href="/causas/nueva" className="btn btn-primary">
              {t("dashboard.newCase")} <ArrowRight size={16} />
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href} className="panel rounded-3xl p-5 transition hover:border-[var(--sea)]/40">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--ink-soft)]/70">{label}</span>
              <Icon size={18} className="text-[var(--copper)]" />
            </div>
            <div className="display mt-3 text-3xl sm:text-4xl">{value}</div>
          </Link>
        ))}
      </div>

      <section className="panel rounded-3xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{t("dashboard.tramites.title")}</h2>
            <p className="text-sm text-[var(--ink-soft)]/70">
              {t("dashboard.tramites.openCount").replace(
                "{count}",
                String(tramitesPendientesCount)
              )}
              {tramitesVencidos.length > 0
                ? ` · ${t("dashboard.tramites.overdueCount").replace("{count}", String(tramitesVencidos.length))}`
                : ""}
              {unread > 0
                ? ` · ${t("dashboard.tramites.notificationsCount").replace("{count}", String(unread))}`
                : ""}
            </p>
          </div>
          <Link href="/clientes" className="text-sm text-[var(--sea)]">
            {t("dashboard.viewClients")}
          </Link>
        </div>
        <div className="space-y-3">
          {(tramitesVencidos.length ? tramitesVencidos : tramitesPendientes).map(
            (tramite) => (
              <Link
                key={tramite.id}
                href={tramiteHref(tramite)}
                className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 transition hover:border-[var(--sea)]/40"
              >
                <div className="min-w-0">
                  <div className="break-words font-medium">{tramite.titulo}</div>
                  <div className="mt-1 break-words text-sm text-[var(--ink-soft)]/70">
                    {tramite.causa.cliente?.razonSocial || t("dashboard.tramites.noClient")} ·{" "}
                    {tramite.causa.rit || tramite.causa.titulo}
                    {tramite.fechaLimite ? ` · ${formatDate(tramite.fechaLimite)}` : ""}
                  </div>
                </div>
                <StatusBadge
                  estado={
                    isTramiteVencido(tramite.estado, tramite.fechaLimite, now)
                      ? "vencido"
                      : "pendiente"
                  }
                />
              </Link>
            )
          )}
          {tramitesPendientes.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">
              {t("dashboard.tramites.empty")}
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <h2 className="text-lg font-semibold">{t("dashboard.sites.recent")}</h2>
            <Link href="/sites" className="text-sm text-[var(--sea)]">
              {t("dashboard.sites.all")}
            </Link>
          </div>
          <div className="space-y-3">
            {sitesList.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 transition hover:border-[var(--sea)]/40"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <Link href={`/sites/${s.id}`} className="font-medium text-[var(--ink)] hover:text-[var(--sea)]">
                    {s.name}
                  </Link>
                </div>
                <div className="mt-1 text-sm text-[var(--ink-soft)]/70">
                  {t("dashboard.sites.meta")
                    .replace("{tipo}", siteTipoLabel(dict, s.tipo))
                    .replace("{files}", String(s._count.files))
                    .replace("{tasks}", String(s._count.tasks))}
                  {s.causa?.rit ? ` · ${s.causa.rit}` : ""}
                  {s.cliente?.razonSocial ? (
                    <>
                      {" · "}
                      <Link href={`/clientes/${s.cliente.id}`} className="text-[var(--sea)]">
                        {s.cliente.razonSocial}
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
            {sitesList.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                {t("dashboard.sites.empty")}{" "}
                <Link href="/sites" className="text-[var(--sea)]">
                  {t("dashboard.sites.create")}
                </Link>
              </p>
            )}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <h2 className="text-lg font-semibold">{t("dashboard.tasks.my")}</h2>
            <Link href="/tareas" className="text-sm text-[var(--sea)]">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          <div className="space-y-3">
            {tasks.map((task) => (
              <Link
                key={task.id}
                href={task.siteId ? `/sites/${task.siteId}/tareas` : "/tareas"}
                className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 transition hover:border-[var(--sea)]/40"
              >
                <div className="min-w-0">
                  <div className="break-words font-medium">{task.title}</div>
                  <div className="mt-1 break-words text-sm text-[var(--ink-soft)]/70">
                    {task.site?.name || "—"} · {formatDate(task.dueDate)}
                  </div>
                </div>
                <StatusBadge
                  estado={task.priority === "urgent" ? "vencido" : "pendiente"}
                />
              </Link>
            ))}
            {tasks.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                {t("dashboard.tasks.empty")}{" "}
                <Link href="/tareas" className="text-[var(--sea)]">
                  {t("dashboard.tasks.globalInbox")}
                </Link>
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="panel rounded-3xl p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <h2 className="text-lg font-semibold">{t("dashboard.minutes.recent")}</h2>
          <Link href="/minutas" className="text-sm text-[var(--sea)]">
            {t("dashboard.viewAll")}
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
                {t("dashboard.minutes.pendingCount").replace(
                  "{count}",
                  String(m.acciones.length)
                )}
              </div>
            </Link>
          ))}
          {minutasRecientes.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">
              {t("dashboard.minutes.empty")}
            </p>
          )}
        </div>
      </section>

      <section className="panel rounded-3xl p-5">
        <h2 className="mb-4 text-lg font-semibold">{t("dashboard.activity.recent")}</h2>
        <div className="space-y-3">
          {actividades.map((a) => (
            <div key={a.id} className="flex gap-3 border-b border-[var(--line)] pb-3 last:border-0">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--copper)]" />
              <div>
                <div className="text-sm">{a.mensaje}</div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]/60">
                  {a.user?.name || t("dashboard.activity.system")} ·{" "}
                  {a.site?.name ||
                    a.causa?.rit ||
                    labelMateria(a.causa?.materia || "") ||
                    t("dashboard.activity.general")}{" "}
                  · {formatDate(a.createdAt)}
                </div>
              </div>
            </div>
          ))}
          {actividades.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">{t("dashboard.activity.empty")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
