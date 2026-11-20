import { ContextDisclosure } from "@/components/ui/ContextDisclosure";
import {
  personalDeadlineWhere,
  upcomingDeadlinePeriod,
} from "@/lib/deadlines/views";
import { DeadlineCard, deadlineCardRelations } from "@/components/DeadlineCard";
import { DeadlineOptions } from "@/components/DeadlineOptions";
import { ListPagination } from "@/components/ui/ListPagination";
import {
  deadlineCursorWhere,
  deadlineWindow,
  deadlineMonth,
} from "@/lib/deadlines/pagination";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { civilReviewReady } from "@/lib/deadlines/civil-profile";
import { getWorkCountry } from "@/lib/config/work-country";
import { PlazoForm } from "@/components/PlazoForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  causaAccessWhere as scopedcausaAccessWhere,
  plazoAccessWhere,
} from "@/lib/auth/causa-access";
import { requireStaff } from "@/lib/auth/session";
import {
  santiagoDateKey,
  civilMonthQueryRange,
  formatCivilDate,
} from "@/lib/chile-time";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  searchParams: Promise<{
    after?: string;
    mes?: string;
    vista?: string;
    causaId?: string;
    fechaLimite?: string;
    desde?: string;
    dias?: string;
    computo?: string;
    titulo?: string;
  }>;
};

function monthView(value: string | undefined, now: Date) {
  const [todayYear, todayMonth] = santiagoDateKey(now).split("-").map(Number);
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : todayYear;
  const month = match ? Number(match[2]) : todayMonth;
  const safeMonth = month >= 1 && month <= 12 ? month : todayMonth;
  const anchor = new Date(
    Date.UTC(year >= 1900 && year <= 2200 ? year : todayYear, safeMonth - 1, 1),
  );
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  return {
    year: y,
    monthIndex: m,
    ...civilMonthQueryRange(y, m),
  };
}

function shiftMonthParam(year: number, monthIndex: number, delta: number) {
  const next = new Date(Date.UTC(year, monthIndex + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function PlazosPage({ searchParams }: Props) {
  const user = await requireStaff();
  const { t, dict, locale } = await getI18n();
  const h = dict.hubs.plazos;
  const sp = await searchParams;
  if (sp.causaId && (typeof sp.causaId !== "string" || sp.causaId.length > 120))
    notFound();
  const selectedCause = sp.causaId
    ? await prisma.causa.findFirst({
        where: { AND: [scopedcausaAccessWhere(user), { id: sp.causaId }] },
        select: { id: true, titulo: true, rit: true },
      })
    : null;
  if (sp.causaId && !selectedCause) notFound();
  const scopeHref = (query: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({
      ...query,
      causaId: selectedCause?.id,
    }))
      if (value) params.set(key, value);
    return `/plazos${params.size ? `?${params}` : ""}`;
  };
  const now = new Date();
  const { year, monthIndex } = monthView(sp.mes, now);
  const overdue = sp.vista === "mis-vencidos";
  const upcoming = sp.vista === "proximos";
  const personalView = overdue || upcoming;
  const period = upcomingDeadlinePeriod(now);
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const where = {
    AND: [
      plazoAccessWhere(user),
      ...(selectedCause ? [{ causaId: selectedCause.id }] : []),
      ...(personalView
        ? [
            personalDeadlineWhere(
              user,
              overdue ? "mis-vencidos" : "proximos",
              now,
            ),
          ]
        : [deadlineMonth(monthKey)]),
    ],
  };
  const [plazosRaw, total, causas, responsables] = await Promise.all([
    prisma.plazo.findMany({
      where: { AND: [where, deadlineCursorWhere(sp.after)] },
      include: deadlineCardRelations(user.id),
      orderBy: [{ fechaLimite: "asc" }, { id: "asc" }],
      take: 101,
    }),
    prisma.plazo.count({ where }),
    prisma.causa.findMany({
      where: {
        AND: [
          scopedcausaAccessWhere(user),
          { estado: { in: ["activa", "suspensa"] } },
        ],
      },
      select: { id: true, rit: true, titulo: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const causeOptions =
    selectedCause && !causas.some((c) => c.id === selectedCause.id)
      ? [selectedCause, ...causas]
      : causas;
  const window = deadlineWindow(plazosRaw, 100);
  const plazos = window.items;
  const prev = shiftMonthParam(year, monthIndex, -1);
  const next = shiftMonthParam(year, monthIndex, 1);
  const monthLabel = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : "es-CL",
    {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(new Date(Date.UTC(year, monthIndex, 1, 12)));

  return (
    <div className="space-y-6">
      <PageHeader
        artwork="deadlines"
        eyebrow={h.eyebrow}
        title={h.title}
        actions={
          <>
            <a className="btn btn-primary" href="#registrar-plazo">
              {locale === "en" ? "Register a deadline" : "Registrar un plazo"}
            </a>
            <Link className="btn btn-ghost" href="/agente?utility=plazos">
              {locale === "en" ? "Review with Altazor" : "Revisar con Altazor"}
            </Link>
          </>
        }
      />

      <nav
        className="flex flex-wrap gap-2"
        aria-label={locale === "en" ? "Deadline view" : "Vista de plazos"}
      >
        <Link
          href={scopeHref({ mes: sp.mes })}
          className={`btn ${personalView ? "btn-secondary" : "btn-primary"}`}
          aria-current={!personalView ? "page" : undefined}
        >
          {locale === "en" ? "By month" : "Por mes"}
        </Link>
        <Link
          href={scopeHref({ vista: "mis-vencidos", mes: sp.mes })}
          className={`btn ${overdue ? "btn-primary" : "btn-secondary"}`}
          aria-current={overdue ? "page" : undefined}
        >
          {locale === "en" ? "My overdue deadlines" : "Mis vencidos pendientes"}
        </Link>
        <Link
          href={scopeHref({ vista: "proximos" })}
          className={`btn ${upcoming ? "btn-primary" : "btn-secondary"}`}
          aria-current={upcoming ? "page" : undefined}
        >
          {locale === "en" ? "Upcoming deadlines" : "Próximos plazos"}
        </Link>
      </nav>
      <ContextDisclosure
        id="filtrar-plazos"
        title={
          selectedCause
            ? "Filtrar por causa · Filtro activo"
            : "Filtrar por causa"
        }
        defaultOpen={Boolean(selectedCause)}
      >
        <form
          method="GET"
          className="panel flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] p-4"
          aria-label={
            locale === "en" ? "Deadline filters" : "Filtros de plazos"
          }
        >
          {sp.mes && <input type="hidden" name="mes" value={sp.mes} />}
          {personalView && (
            <input
              type="hidden"
              name="vista"
              value={overdue ? "mis-vencidos" : "proximos"}
            />
          )}
          <DeadlineOptions
            key={selectedCause?.id || "all"}
            label="Filtrar por causa"
            name="causaId"
            initial={causeOptions.map((c) => ({
              id: c.id,
              label: `${c.rit || ""} ${c.titulo}`,
            }))}
            empty="Todas las causas accesibles"
            initialValue={selectedCause?.id}
          />

          <button className="btn btn-secondary">
            {locale === "en" ? "Apply filters" : "Aplicar filtros"}
          </button>
          {selectedCause && (
            <Link
              className="btn btn-ghost"
              href={
                personalView
                  ? `/plazos?vista=${overdue ? "mis-vencidos" : "proximos"}`
                  : `/plazos?mes=${monthKey}`
              }
            >
              {locale === "en" ? "Clear case filter" : "Quitar filtro de causa"}
            </Link>
          )}
        </form>
      </ContextDisclosure>
      {selectedCause && (
        <p className="text-sm text-[var(--muted)]">
          {locale === "en" ? "Deadlines for" : "Plazos de"}{" "}
          <Link
            className="text-[var(--sea)]"
            href={`/causas/${selectedCause.id}`}
          >
            {selectedCause.titulo}
          </Link>
          .
        </p>
      )}
      {upcoming && (
        <p className="text-sm text-[var(--muted)]">
          {locale === "en" ? "Assigned to you" : "Asignados a ti"} ·{" "}
          {formatCivilDate(period.first)}–{formatCivilDate(period.through)}
        </p>
      )}
      {overdue && (
        <p role="status" className="text-sm">
          {locale === "en"
            ? "Pending deadlines assigned to you before today, across all months."
            : "Plazos pendientes asignados a ti anteriores a hoy, de todos los meses."}
        </p>
      )}
      <ContextDisclosure
        id="registrar-plazo"
        title={locale === "en" ? "Register a deadline" : "Registrar un plazo"}
        defaultOpen={Boolean(
          sp.titulo || sp.fechaLimite || sp.desde || sp.dias || sp.computo,
        )}
        className="space-y-3"
      >
        <PlazoForm
          chile={await getWorkCountry() === "CL"}
          civilAvailable={civilReviewReady()}
          causas={causeOptions.map((c) => ({
            id: c.id,
            label: c.rit || c.titulo,
          }))}
          responsables={responsables.map((u) => ({ id: u.id, label: u.name }))}
          defaults={{
            causaId: sp.causaId || "",
            fechaNotificacion: sp.desde || "",
            diasPlazo: sp.dias || "",
            tipoComputo: sp.computo === "corridos" ? "corridos" : "habiles",
            fechaLimite: sp.fechaLimite || "",
            titulo: sp.titulo || "",
          }}
        />
      </ContextDisclosure>

      {!personalView && (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:flex sm:flex-wrap sm:justify-between">
          <Link
            className="btn btn-ghost order-1 sm:flex-none"
            href={scopeHref({ mes: prev })}
            aria-label={t("common.previousMonth")}
          >
            ← <span className="sm:hidden">Ant.</span>
            <span className="hidden sm:inline">
              {t("common.previousMonth")}
            </span>
          </Link>
          <h2 className="order-2 text-center text-base font-semibold capitalize sm:text-lg">
            {h.calendarHeading.replace("{month}", monthLabel)}
          </h2>
          <Link
            className="btn btn-ghost order-3 sm:flex-none"
            href={scopeHref({ mes: next })}
            aria-label={t("common.nextMonth")}
          >
            <span className="sm:hidden">Sig.</span>
            <span className="hidden sm:inline">{t("common.nextMonth")}</span> →
          </Link>
        </div>
      )}

      <p role="status" className="text-sm">
        {total} plazos en esta vista
      </p>
      <div className="space-y-3">
        {plazos.length === 0 && (
          <EmptyState
            title={h.title}
            description={
              personalView
                ? locale === "en"
                  ? "No pending deadlines assigned to you in this period."
                  : "No tienes plazos pendientes en esta vista."
                : h.empty
            }
            actionLabel={h.openCalendar}
            actionHref="/calendario"
          />
        )}
        {plazos.map((p) => <DeadlineCard
          key={p.id} deadline={p} user={user} labels={h}
          returnTo={`${scopeHref({ mes: monthKey, vista: personalView ? sp.vista : undefined, after: sp.after })}#plazo-${p.id}`}
        />)}
      </div>
      <ListPagination
        path="/plazos"
        filters={{
          mes: monthKey,
          vista: overdue ? "mis-vencidos" : upcoming ? "proximos" : undefined,
          causaId: selectedCause?.id,
        }}
        after={sp.after}
        next={window.next}
        count={plazos.length}
      />
    </div>
  );
}
