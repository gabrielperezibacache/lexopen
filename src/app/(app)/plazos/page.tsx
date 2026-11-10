import { PlazoForm } from "@/components/PlazoForm";
import { PlazoGoogleButton } from "@/components/PlazoGoogleButton";
import { StatusBadge, UrgenciaBadge } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { causaAccessWhere as scopedcausaAccessWhere, plazoAccessWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { requireStaff } from "@/lib/auth/session";
import { civilDateKey, civilDayQueryRange, santiagoDateKey, civilMonthQueryRange, formatCivilDate } from "@/lib/chile-time";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { diasRestantes, labelDiasRestantes, labelTipoComputo } from "@/lib/plazos";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  searchParams: Promise<{
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

function monthView(value?: string) {
  const today = santiagoDateKey(new Date());
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : todayYear;
  const month = match ? Number(match[2]) : todayMonth;
  const safeMonth = month >= 1 && month <= 12 ? month : todayMonth;
  const anchor = new Date(Date.UTC(year, safeMonth - 1, 1));
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
  if (sp.causaId && (typeof sp.causaId !== "string" || sp.causaId.length > 120)) notFound();
  const selectedCause = sp.causaId ? await prisma.causa.findFirst({ where: { AND: [scopedcausaAccessWhere(user), { id: sp.causaId }] }, select: { id: true, titulo: true, rit: true } }) : null;
  if (sp.causaId && !selectedCause) notFound();
  const scopeHref = (query: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, causaId: selectedCause?.id })) if (value) params.set(key, value);
    return `/plazos${params.size ? `?${params}` : ""}`;
  };
  const { start, end, year, monthIndex } = monthView(sp.mes);
  const overdue = sp.vista === "mis-vencidos";
  const today = civilDayQueryRange(santiagoDateKey(new Date())).start;
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const [plazosRaw, causas, responsables] = await Promise.all([
    prisma.plazo.findMany({
      where: { AND: [plazoAccessWhere(user), ...(selectedCause ? [{ causaId: selectedCause.id }] : []), (overdue ? { estado: "pendiente", responsableId: user.id, fechaLimite: { lt: today } } : { fechaLimite: { gte: start, lte: end } })] },
      include: { causa: true, responsable: { select: publicUserSelect } },
      orderBy: { fechaLimite: "asc" },
      ...(overdue ? { take: 101 } : {}),
    }),
    prisma.causa.findMany({
      where: { AND: [scopedcausaAccessWhere(user), { estado: { in: ["activa", "suspensa"] } }] },
      select: { id: true, rit: true, titulo: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "abogado", "asistente"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const causeOptions = selectedCause && !causas.some(c => c.id === selectedCause.id) ? [selectedCause, ...causas] : causas;
  const plazos = overdue ? plazosRaw.slice(0, 100) : plazosRaw.filter((plazo) =>
    civilDateKey(plazo.fechaLimite).startsWith(monthKey)
  );
  const prev = shiftMonthParam(year, monthIndex, -1);
  const next = shiftMonthParam(year, monthIndex, 1);
  const monthLabel = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1, 12)));

  return (
    <div className="space-y-6">
      <PageHeader
        artwork="deadlines"
        eyebrow={h.eyebrow}
        title={h.title}
        subtitle={h.subtitle}
        actions={
          <Link className="btn btn-secondary" href="/agente?utility=plazos">
            {h.analyze}
          </Link>
        }
      />

      <nav className="flex flex-wrap gap-2" aria-label={locale === "en" ? "Deadline view" : "Vista de plazos"}><Link href={scopeHref({ mes: sp.mes })} className={`btn ${overdue ? "btn-secondary" : "btn-primary"}`} aria-current={!overdue ? "page" : undefined}>{locale === "en" ? "By month" : "Por mes"}</Link><Link href={scopeHref({ vista: "mis-vencidos", mes: sp.mes })} className={`btn ${overdue ? "btn-primary" : "btn-secondary"}`} aria-current={overdue ? "page" : undefined}>{locale === "en" ? "My overdue deadlines" : "Mis vencidos pendientes"}</Link></nav>
      <form method="GET" className="panel flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] p-4" aria-label={locale === "en" ? "Deadline filters" : "Filtros de plazos"}>
        {sp.mes && <input type="hidden" name="mes" value={sp.mes} />}{overdue && <input type="hidden" name="vista" value="mis-vencidos" />}
        <label className="min-w-0 flex-1 text-sm">{locale === "en" ? "Filter by case" : "Filtrar por causa"}<select aria-label={locale === "en" ? "Filter by case" : "Filtrar por causa"} className="select mt-1" name="causaId" defaultValue={selectedCause?.id || ""}><option value="">{locale === "en" ? "All accessible cases" : "Todas las causas accesibles"}</option>{causeOptions.map(c => <option key={c.id} value={c.id}>{c.rit ? `${c.rit} · ` : ""}{c.titulo}</option>)}</select></label>
        <button className="btn btn-secondary">{locale === "en" ? "Apply filters" : "Aplicar filtros"}</button>
        {selectedCause && <Link className="btn btn-ghost" href={overdue ? "/plazos?vista=mis-vencidos" : `/plazos?mes=${monthKey}`}>{locale === "en" ? "Clear case filter" : "Quitar filtro de causa"}</Link>}
      </form>
      {selectedCause && <p className="text-sm text-[var(--muted)]">{locale === "en" ? "Deadlines for" : "Plazos de"} <Link className="text-[var(--sea)]" href={`/causas/${selectedCause.id}`}>{selectedCause.titulo}</Link>.</p>}
      {overdue && <p role="status" className="text-sm">{locale === "en" ? "Pending deadlines assigned to you before today, across all months." : "Plazos pendientes asignados a ti anteriores a hoy, de todos los meses."}{plazosRaw.length > 100 ? (locale === "en" ? " Showing the 100 oldest." : " Se muestran los 100 más antiguos.") : ""}</p>}
      <details open={!overdue} className="space-y-3"><summary className="cursor-pointer py-3 font-medium">{locale === "en" ? "Register a deadline" : "Registrar un plazo"}</summary>
      <PlazoForm
        causas={causeOptions.map((c) => ({ id: c.id, label: c.rit || c.titulo }))}
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
      </details>

      {!overdue && <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Link
          className="btn btn-ghost order-2 flex-1 sm:order-1 sm:flex-none"
          href={scopeHref({ mes: prev })}
          aria-label={t("common.previousMonth")}
        >
          ← <span className="sm:hidden">Ant.</span>
          <span className="hidden sm:inline">{t("common.previousMonth")}</span>
        </Link>
        <h2 className="order-1 text-center text-lg font-semibold capitalize sm:order-2">
          {h.calendarHeading.replace("{month}", monthLabel)}
        </h2>
        <Link
          className="btn btn-ghost order-3 flex-1 sm:flex-none"
          href={scopeHref({ mes: next })}
          aria-label={t("common.nextMonth")}
        >
          <span className="sm:hidden">Sig.</span>
          <span className="hidden sm:inline">{t("common.nextMonth")}</span> →
        </Link>
      </div>}

      <div className="space-y-3">
        {plazos.length === 0 && (
          <EmptyState
            title={h.title}
            description={overdue ? (locale === "en" ? "No overdue pending deadlines assigned to you were found in the accessible records." : "No se encontraron plazos vencidos pendientes asignados a ti en los registros accesibles.") : h.empty}
            actionLabel={h.openCalendar}
            actionHref="/calendario"
          />
        )}
        {plazos.map((p) => (
          <div
            key={p.id}
            className="panel flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-xl)] px-5 py-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words font-semibold">{p.titulo}</h2>
                <StatusBadge estado={p.estado} />
                <UrgenciaBadge fecha={p.fechaLimite} estado={p.estado} />
                <span className="badge badge-ink">{p.tipo}</span>
                <span className="badge badge-ink">{labelTipoComputo(p.tipoComputo)}</span>
                {p.esFatal && <span className="badge badge-vencido">{h.fatal}</span>}
              </div>
              <p className="mt-1 break-words text-sm text-[var(--muted)]">
                {formatCivilDate(p.fechaLimite)}
                {p.estado === "pendiente"
                  ? ` · ${labelDiasRestantes(diasRestantes(p.fechaLimite))}`
                  : ""}{" "}
                ·{" "}
                {p.causa ? (
                  <Link href={`/causas/${p.causa.id}`} className="text-[var(--sea)]">
                    {p.causa.rit || p.causa.titulo}
                  </Link>
                ) : (
                  h.noCause
                )}{" "}
                · {p.responsable?.name || h.noOwner}
              </p>
              {p.descripcion && (
                <p className="mt-2 text-sm text-[var(--muted)]">{p.descripcion}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2"><Link href={`/offline.html?kind=plazo&record=${p.id}`} className="btn btn-secondary">Sin conexión</Link><PlazoGoogleButton plazoId={p.id} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
