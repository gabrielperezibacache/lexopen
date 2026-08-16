import Link from "next/link";
import { prisma } from "@/lib/db";
import { clasificarUrgencia } from "@/lib/plazos";
import { formatDate, pageTitleClass } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";

function monthMatrix(base: Date) {
  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date | null }> = [];
  for (let i = 0; i < startPad; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d, 12) });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null });
  return cells;
}

function parseYm(ym?: string) {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1, 12);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 12);
}

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1, 12);
}

type Props = { searchParams: Promise<{ ym?: string; tipo?: string }> };

export default async function CalendarioPage({ searchParams }: Props) {
  await requireStaff();
  const sp = await searchParams;
  const monthDate = parseYm(sp.ym);
  const filterTipo = (sp.tipo || "todos").toLowerCase();
  const now = new Date();
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);

  const [plazos, tasks, causasTabla, movAudiencias] = await Promise.all([
    prisma.plazo.findMany({
      where: {
        estado: { in: ["pendiente", "vencido"] },
        fechaLimite: { gte: monthStart, lte: monthEnd },
      },
      include: { causa: true },
      orderBy: { fechaLimite: "asc" },
    }),
    prisma.task.findMany({
      where: {
        status: { not: "done" },
        dueDate: { gte: monthStart, lte: monthEnd },
      },
      include: { site: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.causa.findMany({
      where: {
        proximaTabla: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        rit: true,
        titulo: true,
        proximaTabla: true,
        proximaTablaNota: true,
        sala: true,
      },
    }),
    prisma.causaMovimiento.findMany({
      where: {
        tipo: "audiencia",
        fecha: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        titulo: true,
        fecha: true,
        causaId: true,
        causa: { select: { rit: true, titulo: true } },
      },
      take: 200,
    }),
  ]);

  const upcomingPlazos = await prisma.plazo.findMany({
    where: { estado: { in: ["pendiente", "vencido"] } },
    include: { causa: true },
    orderBy: { fechaLimite: "asc" },
    take: 12,
  });

  const cells = monthMatrix(monthDate);
  const monthLabel = monthDate.toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });
  const prevYm = ymKey(shiftMonth(monthDate, -1));
  const nextYm = ymKey(shiftMonth(monthDate, 1));

  function eventsOn(day: Date) {
    const key = day.toISOString().slice(0, 10);
    const p =
      filterTipo === "tarea" || filterTipo === "audiencia"
        ? []
        : plazos.filter((x) => x.fechaLimite.toISOString().slice(0, 10) === key);
    const t =
      filterTipo === "plazo" || filterTipo === "audiencia"
        ? []
        : tasks.filter(
            (x) => x.dueDate && x.dueDate.toISOString().slice(0, 10) === key
          );
    const a =
      filterTipo === "plazo" || filterTipo === "tarea"
        ? []
        : [
            ...causasTabla
              .filter(
                (c) =>
                  c.proximaTabla &&
                  c.proximaTabla.toISOString().slice(0, 10) === key
              )
              .map((c) => ({
                id: `tabla-${c.id}`,
                titulo: c.proximaTablaNota || `Tabla · ${c.rit || c.titulo}`,
                causaId: c.id,
                sala: c.sala,
              })),
            ...movAudiencias
              .filter((m) => m.fecha.toISOString().slice(0, 10) === key)
              .map((m) => ({
                id: m.id,
                titulo: m.titulo,
                causaId: m.causaId,
                sala: null as string | null,
              })),
          ];
    return { p, t, a };
  }

  const agendaDays = cells
    .map((c) => c.date)
    .filter((d): d is Date => Boolean(d))
    .map((day) => ({ day, ...eventsOn(day) }))
    .filter(({ p, t, a }) => p.length > 0 || t.length > 0 || a.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            Agenda del estudio
          </p>
          <h1 className={pageTitleClass}>Calendario</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]/80 sm:text-base">
            Plazos procesales, tareas y audiencias (próxima tabla / movimientos).
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {[
              ["todos", "Todos"],
              ["plazo", "Plazos"],
              ["tarea", "Tareas"],
              ["audiencia", "Audiencias"],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={`/calendario?ym=${ymKey(monthDate)}&tipo=${value}`}
                className={`rounded-full px-3 py-1 ${
                  filterTipo === value
                    ? "bg-[var(--sea)] text-white"
                    : "bg-white/70 text-[var(--ink-soft)]"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Link
            href={`/calendario?ym=${prevYm}`}
            className="btn btn-ghost flex-1 sm:flex-none"
            aria-label="Mes anterior"
          >
            ← <span className="sm:hidden">Ant.</span>
            <span className="hidden sm:inline">Anterior</span>
          </Link>
          <Link href="/calendario" className="btn btn-secondary flex-1 sm:flex-none">
            Hoy
          </Link>
          <Link
            href={`/calendario?ym=${nextYm}`}
            className="btn btn-ghost flex-1 sm:flex-none"
            aria-label="Mes siguiente"
          >
            <span className="sm:hidden">Sig.</span>
            <span className="hidden sm:inline">Siguiente</span> →
          </Link>
        </div>
      </div>

      <section className="panel rounded-3xl p-4">
        <h2 className="mb-3 text-center text-lg font-semibold capitalize">{monthLabel}</h2>

        {/* Mobile: agenda list */}
        <div className="space-y-3 md:hidden">
          {agendaDays.map(({ day, p, t, a }) => (
            <div
              key={day.toISOString()}
              className="rounded-2xl border border-[var(--line)] bg-white/60 px-3 py-3"
            >
              <div className="text-sm font-semibold">
                {day.toLocaleDateString("es-CL", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </div>
              <div className="mt-2 space-y-1.5">
                {p.map((x) => (
                  <Link
                    key={x.id}
                    href={x.causaId ? `/causas/${x.causaId}` : "/plazos"}
                    className={`block rounded-lg px-2 py-1.5 text-sm ${
                      x.esFatal || clasificarUrgencia(x.fechaLimite) === "critico"
                        ? "bg-red-100 text-red-800"
                        : "bg-[var(--copper)]/15 text-[var(--ink)]"
                    }`}
                  >
                    {x.esFatal ? "Fatal · " : "Plazo · "}
                    {x.titulo}
                  </Link>
                ))}
                {t.map((x) => (
                  <Link
                    key={x.id}
                    href={x.siteId ? `/sites/${x.siteId}/tareas` : "/tareas"}
                    className="block rounded-lg bg-[var(--sea)]/10 px-2 py-1.5 text-sm text-[var(--ink)]"
                  >
                    Tarea · {x.title}
                  </Link>
                ))}
                {a.map((x) => (
                  <Link
                    key={x.id}
                    href={`/causas/${x.causaId}`}
                    className="block rounded-lg bg-amber-100 px-2 py-1.5 text-sm text-amber-950"
                  >
                    Audiencia · {x.titulo}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {agendaDays.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">
              Sin eventos este mes para el filtro seleccionado.
            </p>
          )}
        </div>

        {/* Desktop+: month grid */}
        <div className="hidden md:block">
          <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]/55">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {cells.map((c, i) => {
              if (!c.date) {
                return <div key={`e-${i}`} className="min-h-24 rounded-xl bg-white/30" />;
              }
              const { p, t, a } = eventsOn(c.date);
              const isToday = c.date.toDateString() === now.toDateString();
              return (
                <div
                  key={c.date.toISOString()}
                  className={`min-h-24 rounded-xl border px-2 py-2 ${
                    isToday
                      ? "border-[var(--sea)] bg-[var(--sea)]/8"
                      : "border-[var(--line)] bg-white/60"
                  }`}
                >
                  <div className="text-xs font-semibold">{c.date.getDate()}</div>
                  <div className="mt-1 space-y-1">
                    {p.slice(0, 2).map((x) => (
                      <Link
                        key={x.id}
                        href={x.causaId ? `/causas/${x.causaId}` : "/plazos"}
                        className={`block truncate rounded px-1 text-[10px] ${
                          x.esFatal || clasificarUrgencia(x.fechaLimite) === "critico"
                            ? "bg-red-100 text-red-800"
                            : "bg-[var(--copper)]/15 text-[var(--ink)]"
                        }`}
                        title={x.titulo}
                      >
                        {x.esFatal ? "F · " : ""}
                        {x.titulo}
                      </Link>
                    ))}
                    {t.slice(0, 2).map((x) => (
                      <Link
                        key={x.id}
                        href={x.siteId ? `/sites/${x.siteId}/tareas` : "/tareas"}
                        className="block truncate rounded bg-[var(--sea)]/10 px-1 text-[10px] text-[var(--ink)]"
                        title={x.title}
                      >
                        {x.title}
                      </Link>
                    ))}
                    {a.slice(0, 2).map((x) => (
                      <Link
                        key={x.id}
                        href={`/causas/${x.causaId}`}
                        className="block truncate rounded bg-amber-100 px-1 text-[10px] text-amber-950"
                        title={x.titulo}
                      >
                        {x.titulo}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Próximos plazos</h2>
        <div className="mt-4 space-y-2">
          {upcomingPlazos.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line)] px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium break-words">
                  {p.esFatal ? "Fatal · " : ""}
                  {p.titulo}
                </div>
                <div className="text-xs text-[var(--ink-soft)]/65">
                  {p.causa?.rit || "Sin causa"} · {p.tipoComputo} · {formatDate(p.fechaLimite)}
                </div>
              </div>
              <span className="badge badge-pendiente">{clasificarUrgencia(p.fechaLimite)}</span>
            </div>
          ))}
          {upcomingPlazos.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">No hay plazos pendientes.</p>
          )}
        </div>
      </section>
    </div>
  );
}
