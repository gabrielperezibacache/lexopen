import Link from "next/link";
import { prisma } from "@/lib/db";
import { civilDateKey, civilMonthQueryRange, formatCivilDate } from "@/lib/chile-time";
import { clasificarUrgencia, labelTipoComputo } from "@/lib/plazos";
import { UrgenciaBadge, pageTitleClass } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import {
  CalendarioClient,
  type EventoListItem,
} from "@/components/calendario/CalendarioClient";
import {
  CalendarioBoard,
  type BoardDay,
} from "@/components/calendario/CalendarioBoard";
import {
  mondayOfWeek,
  shiftWeek,
  weekDays,
  weekQueryRange,
} from "@/lib/calendario/week";
import { GoogleCalendarPullButton } from "@/components/calendario/GoogleCalendarPullButton";

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

type Vista = "mes" | "semana" | "agenda";

function parseVista(raw?: string): Vista {
  if (raw === "semana" || raw === "agenda") return raw;
  return "mes";
}

type Props = {
  searchParams: Promise<{
    ym?: string;
    tipo?: string;
    nuevo?: string;
    vista?: string;
    semana?: string;
  }>;
};

export default async function CalendarioPage({ searchParams }: Props) {
  await requireStaff();
  const sp = await searchParams;
  const vista = parseVista(sp.vista);
  const { year, monthIndex } = parseYm(sp.ym);
  const filterTipo = (sp.tipo || "todos").toLowerCase();
  const todayKey = civilDateKey(new Date());
  const currentYm = ymKey(year, monthIndex);

  const weekMonday =
    vista === "semana"
      ? mondayOfWeek(
          sp.semana && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana)
            ? sp.semana
            : todayKey
        )
      : mondayOfWeek(todayKey);

  const range =
    vista === "semana"
      ? weekQueryRange(weekMonday)
      : civilMonthQueryRange(year, monthIndex);

  const [plazos, tasks, causasTabla, movAudiencias, eventosRaw, causasOptions] =
    await Promise.all([
      prisma.plazo.findMany({
        where: {
          estado: { in: ["pendiente", "vencido"] },
          fechaLimite: { gte: range.start, lte: range.end },
        },
        include: { causa: true },
        orderBy: { fechaLimite: "asc" },
      }),
      prisma.task.findMany({
        where: {
          status: { not: "done" },
          dueDate: { gte: range.start, lte: range.end },
        },
        include: { site: true },
        orderBy: { dueDate: "asc" },
      }),
      prisma.causa.findMany({
        where: {
          proximaTabla: { gte: range.start, lte: range.end },
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
          fecha: { gte: range.start, lte: range.end },
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
      prisma.evento.findMany({
        where: {
          estado: { not: "cancelado" },
          inicio: { gte: range.start, lte: range.end },
        },
        include: { causa: { select: { id: true, rit: true, titulo: true } } },
        orderBy: { inicio: "asc" },
        take: 300,
      }),
      prisma.causa.findMany({
        where: { estado: { in: ["activa", "suspensa"] } },
        select: { id: true, rit: true, titulo: true },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    ]);

  const eventos: EventoListItem[] = eventosRaw.map((e) => ({
    id: e.id,
    titulo: e.titulo,
    tipo: e.tipo,
    inicio: e.inicio.toISOString(),
    fin: e.fin ? e.fin.toISOString() : null,
    todoElDia: e.todoElDia,
    lugar: e.lugar,
    modalidad: e.modalidad,
    notas: e.notas,
    causaId: e.causaId,
    causaLabel: e.causa ? e.causa.rit || e.causa.titulo : null,
    tipoAudiencia: e.tipoAudiencia,
    tribunal: e.tribunal,
  }));

  const upcomingPlazos = await prisma.plazo.findMany({
    where: { estado: { in: ["pendiente", "vencido"] } },
    include: { causa: true },
    orderBy: { fechaLimite: "asc" },
    take: 12,
  });

  const cells =
    vista === "semana"
      ? weekDays(weekMonday).map((ymd) => ({ ymd: ymd as string | null }))
      : monthMatrix(year, monthIndex);

  const monthLabel = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1, 12)));

  const weekLabel = `${dayLabel(weekMonday)} – ${dayLabel(
    weekDays(weekMonday)[6]
  )}`;

  const prevYm = shiftYm(year, monthIndex, -1);
  const nextYm = shiftYm(year, monthIndex, 1);
  const prevSemana = shiftWeek(weekMonday, -1);
  const nextSemana = shiftWeek(weekMonday, 1);

  function qs(extra: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    p.set("vista", extra.vista || vista);
    if ((extra.vista || vista) === "semana") {
      p.set("semana", extra.semana || weekMonday);
    } else {
      p.set("ym", extra.ym || currentYm);
    }
    if (filterTipo !== "todos") p.set("tipo", filterTipo);
    if (extra.nuevo) p.set("nuevo", extra.nuevo);
    if (extra.tipo) p.set("tipo", extra.tipo);
    return `/calendario?${p.toString()}`;
  }

  function show(tipo: string) {
    return filterTipo === "todos" || filterTipo === tipo;
  }

  function eventsOn(key: string) {
    const p = show("plazo")
      ? plazos.filter((x) => civilDateKey(x.fechaLimite) === key)
      : [];
    const t = show("tarea")
      ? tasks.filter((x) => x.dueDate && civilDateKey(x.dueDate) === key)
      : [];
    const a = show("audiencia")
      ? [
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
        ]
      : [];
    const ev = show("evento")
      ? eventos.filter((x) => civilDateKey(new Date(x.inicio)) === key)
      : [];
    return { p, t, a, ev };
  }

  const boardDays: BoardDay[] = cells.map((c) => {
    if (!c.ymd) return { ymd: null, p: [], t: [], a: [], ev: [] };
    const { p, t, a, ev } = eventsOn(c.ymd);
    return {
      ymd: c.ymd,
      p: p.map((x) => ({
        id: x.id,
        titulo: x.titulo,
        causaId: x.causaId,
        esFatal: x.esFatal,
        fechaLimite: x.fechaLimite.toISOString(),
      })),
      t: t.map((x) => ({
        id: x.id,
        title: x.title,
        siteId: x.siteId,
      })),
      a: a.map((x) => ({
        id: x.id,
        titulo: x.titulo,
        causaId: x.causaId,
      })),
      ev: ev.map((x) => ({
        id: x.id,
        titulo: x.titulo,
        tipo: x.tipo,
        inicio: x.inicio,
        causaId: x.causaId,
      })),
    };
  });

  const agendaDays = cells
    .map((c) => c.ymd)
    .filter((ymd): ymd is string => Boolean(ymd))
    .map((ymd) => ({ ymd, ...eventsOn(ymd) }))
    .filter(({ p, t, a, ev }) => p.length > 0 || t.length > 0 || a.length > 0 || ev.length > 0);

  const weekLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const heading = vista === "semana" ? weekLabel : monthLabel;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            Agenda del estudio
          </p>
          <h1 className={pageTitleClass}>Calendario</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]/80 sm:text-base">
            Plazos procesales, tareas, eventos y audiencias. Arrastre eventos
            (verde) entre días en mes o semana.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {(
              [
                ["mes", "Mes"],
                ["semana", "Semana"],
                ["agenda", "Agenda"],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={qs({ vista: value })}
                className={`rounded-full px-3 py-1 ${
                  vista === value
                    ? "bg-[var(--ink)] text-white"
                    : "bg-white/70 text-[var(--ink-soft)]"
                }`}
                data-testid={`cal-vista-${value}`}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {[
              ["todos", "Todos"],
              ["plazo", "Plazos"],
              ["tarea", "Tareas"],
              ["audiencia", "Audiencias"],
              ["evento", "Eventos"],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={qs({ tipo: value })}
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
          <GoogleCalendarPullButton />
          <Link href={qs({ nuevo: "1" })} className="btn btn-primary flex-1 sm:flex-none">
            Nuevo evento
          </Link>
          <Link
            href={
              vista === "semana"
                ? qs({ semana: prevSemana })
                : qs({ ym: prevYm })
            }
            className="btn btn-ghost flex-1 sm:flex-none"
            aria-label={vista === "semana" ? "Semana anterior" : "Mes anterior"}
          >
            ← <span className="sm:hidden">Ant.</span>
            <span className="hidden sm:inline">Anterior</span>
          </Link>
          <Link href="/calendario" className="btn btn-secondary flex-1 sm:flex-none">
            Hoy
          </Link>
          <Link
            href={
              vista === "semana"
                ? qs({ semana: nextSemana })
                : qs({ ym: nextYm })
            }
            className="btn btn-ghost flex-1 sm:flex-none"
            aria-label={vista === "semana" ? "Semana siguiente" : "Mes siguiente"}
          >
            <span className="sm:hidden">Sig.</span>
            <span className="hidden sm:inline">Siguiente</span> →
          </Link>
        </div>
      </div>

      <section className="panel rounded-3xl p-4">
        <h2 className="mb-3 text-center text-lg font-semibold capitalize">
          {heading}
        </h2>

        {/* Mobile: always agenda list */}
        <div className="space-y-3 md:hidden">
          {agendaDays.map(({ ymd, p, t, a, ev }) => (
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
                {ev.map((x) => (
                  <Link
                    key={x.id}
                    href={x.causaId ? `/causas/${x.causaId}` : "/calendario"}
                    className="block rounded-lg bg-emerald-100 px-2 py-1.5 text-sm text-emerald-950"
                  >
                    {x.tipo === "audiencia" ? "Audiencia · " : "Evento · "}
                    {x.titulo}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {agendaDays.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">
              Sin eventos en este periodo para el filtro seleccionado.
            </p>
          )}
        </div>

        {/* Desktop+: mes/semana board con DnD; agenda = lista */}
        <div className="hidden md:block">
          {vista === "agenda" ? (
            <div className="space-y-3">
              {agendaDays.map(({ ymd, p, t, a, ev }) => (
                <div
                  key={ymd}
                  className="rounded-2xl border border-[var(--line)] bg-white/60 px-3 py-3"
                >
                  <div className="text-sm font-semibold">{dayLabel(ymd)}</div>
                  <div className="mt-2 space-y-1.5 text-sm">
                    {p.map((x) => (
                      <Link
                        key={x.id}
                        href={x.causaId ? `/causas/${x.causaId}` : "/plazos"}
                        className="block text-[var(--ink)]"
                      >
                        {x.esFatal ? "Fatal · " : "Plazo · "}
                        {x.titulo}
                      </Link>
                    ))}
                    {t.map((x) => (
                      <Link
                        key={x.id}
                        href={x.siteId ? `/sites/${x.siteId}/tareas` : "/tareas"}
                        className="block"
                      >
                        Tarea · {x.title}
                      </Link>
                    ))}
                    {a.map((x) => (
                      <Link key={x.id} href={`/causas/${x.causaId}`} className="block">
                        Audiencia · {x.titulo}
                      </Link>
                    ))}
                    {ev.map((x) => (
                      <Link
                        key={x.id}
                        href={x.causaId ? `/causas/${x.causaId}` : "/calendario"}
                        className="block"
                      >
                        {x.tipo === "audiencia" ? "Audiencia · " : "Evento · "}
                        {x.titulo}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              {agendaDays.length === 0 && (
                <p className="text-sm text-[var(--ink-soft)]/65">
                  Sin eventos en este periodo.
                </p>
              )}
            </div>
          ) : (
            <CalendarioBoard
              mode={vista === "semana" ? "semana" : "mes"}
              days={boardDays}
              todayKey={todayKey}
              weekLabels={weekLabels}
            />
          )}
        </div>
      </section>

      <CalendarioClient
        eventos={eventos}
        causas={causasOptions.map((c) => ({ id: c.id, label: c.rit || c.titulo }))}
        autoOpenNuevo={sp.nuevo === "1"}
        currentYm={currentYm}
      />

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
                  {p.causa?.rit || "Sin causa"} · {labelTipoComputo(p.tipoComputo)} ·{" "}
                  {formatCivilDate(p.fechaLimite)}
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
