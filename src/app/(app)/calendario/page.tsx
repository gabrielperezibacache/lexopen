import Link from "next/link";
import { prisma } from "@/lib/db";
import { civilDateKey, civilMonthQueryRange, formatCivilDate } from "@/lib/chile-time";
import { clasificarUrgencia, labelTipoComputo } from "@/lib/plazos";
import { UrgenciaBadge, pageTitleClass } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";

function monthMatrix(year: number, monthIndex: number) {
  const firstDow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const startPad = (firstDow + 6) % 7; // Monday-first
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const month = String(monthIndex + 1).padStart(2, "0");
  const cells: Array<{ ymd: string | null }> = [];
  for (let i = 0; i < startPad; i++) cells.push({ ymd: null });
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      ymd: `${year}-${month}-${String(day).padStart(2, "0")}`,
    });
  }
  while (cells.length % 7 !== 0) cells.push({ ymd: null });
  return cells;
}

function parseYm(ym?: string) {
  const today = civilDateKey(new Date());
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const match = ym?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : todayYear;
  const month = match ? Number(match[2]) : todayMonth;
  const anchor = new Date(Date.UTC(year, (month >= 1 && month <= 12 ? month : todayMonth) - 1, 1));
  return { year: anchor.getUTCFullYear(), monthIndex: anchor.getUTCMonth() };
}

function ymKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function shiftYm(year: number, monthIndex: number, delta: number) {
  const next = new Date(Date.UTC(year, monthIndex + delta, 1));
  return ymKey(next.getUTCFullYear(), next.getUTCMonth());
}

function dayLabel(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

type Props = { searchParams: Promise<{ ym?: string; tipo?: string }> };

export default async function CalendarioPage({ searchParams }: Props) {
  await requireStaff();
  const sp = await searchParams;
  const { year, monthIndex } = parseYm(sp.ym);
  const filterTipo = (sp.tipo || "todos").toLowerCase();
  const todayKey = civilDateKey(new Date());
  const { start: monthStart, end: monthEnd } = civilMonthQueryRange(year, monthIndex);

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

  const cells = monthMatrix(year, monthIndex);
  const monthLabel = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1, 12)));
  const currentYm = ymKey(year, monthIndex);
  const prevYm = shiftYm(year, monthIndex, -1);
  const nextYm = shiftYm(year, monthIndex, 1);

  function eventsOn(key: string) {
    const p =
      filterTipo === "tarea" || filterTipo === "audiencia"
        ? []
        : plazos.filter((x) => civilDateKey(x.fechaLimite) === key);
    const t =
      filterTipo === "plazo" || filterTipo === "audiencia"
        ? []
        : tasks.filter((x) => x.dueDate && civilDateKey(x.dueDate) === key);
    const a =
      filterTipo === "plazo" || filterTipo === "tarea"
        ? []
        : [
            ...causasTabla
              .filter((c) => c.proximaTabla && civilDateKey(c.proximaTabla) === key)
              .map((c) => ({
                id: `tabla-${c.id}`,
                titulo: c.proximaTablaNota || `Tabla · ${c.rit || c.titulo}`,
                causaId: c.id,
                sala: c.sala,
              })),
            ...movAudiencias
              .filter((m) => civilDateKey(m.fecha) === key)
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
    .map((c) => c.ymd)
    .filter((ymd): ymd is string => Boolean(ymd))
    .map((ymd) => ({ ymd, ...eventsOn(ymd) }))
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
                href={`/calendario?ym=${currentYm}&tipo=${value}`}
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
          {agendaDays.map(({ ymd, p, t, a }) => (
            <div
              key={ymd}
              className="rounded-2xl border border-[var(--line)] bg-white/60 px-3 py-3"
            >
              <div className="text-sm font-semibold">{dayLabel(ymd)}</div>
              <div className="mt-2 space-y-1.5">
                {p.map((x) => (
                  <Link
                    key={x.id}
                    href={x.causaId ? `/causas/${x.causaId}` : "/plazos"}
                    className={`block rounded-lg px-2 py-1.5 text-sm ${
                      x.esFatal ||
                      clasificarUrgencia(x.fechaLimite) === "critico" ||
                      clasificarUrgencia(x.fechaLimite) === "vencido"
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
              if (!c.ymd) {
                return <div key={`e-${i}`} className="min-h-24 rounded-xl bg-white/30" />;
              }
              const { p, t, a } = eventsOn(c.ymd);
              const isToday = c.ymd === todayKey;
              return (
                <div
                  key={c.ymd}
                  className={`min-h-24 rounded-xl border px-2 py-2 ${
                    isToday
                      ? "border-[var(--sea)] bg-[var(--sea)]/8"
                      : "border-[var(--line)] bg-white/60"
                  }`}
                >
                  <div className="text-xs font-semibold">{Number(c.ymd.slice(8))}</div>
                  <div className="mt-1 space-y-1">
                    {p.slice(0, 2).map((x) => (
                      <Link
                        key={x.id}
                        href={x.causaId ? `/causas/${x.causaId}` : "/plazos"}
                        className={`block truncate rounded px-1 text-[10px] ${
                          x.esFatal ||
                          clasificarUrgencia(x.fechaLimite) === "critico" ||
                          clasificarUrgencia(x.fechaLimite) === "vencido"
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
                  {p.causa?.rit || "Sin causa"} · {labelTipoComputo(p.tipoComputo)} · {formatCivilDate(p.fechaLimite)}
                </div>
              </div>
              <UrgenciaBadge fecha={p.fechaLimite} />
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
