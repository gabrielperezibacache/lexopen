import { prisma } from "@/lib/db";
import { StatusBadge, UrgenciaBadge } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { civilDateKey, civilMonthQueryRange, formatCivilDate } from "@/lib/chile-time";
import { diasRestantes, labelDiasRestantes, labelTipoComputo } from "@/lib/plazos";
import Link from "next/link";
import { PlazoGoogleButton } from "@/components/PlazoGoogleButton";
import { PlazoForm } from "@/components/PlazoForm";
import { publicUserSelect } from "@/lib/auth/public-user";
import { requireStaff } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

type Props = {
  searchParams: Promise<{
    mes?: string;
    causaId?: string;
    fechaLimite?: string;
    desde?: string;
    dias?: string;
    computo?: string;
    titulo?: string;
  }>;
};

function monthView(value?: string) {
  const today = civilDateKey(new Date());
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
  await requireStaff();
  const { t, dict, locale } = await getI18n();
  const h = dict.hubs.plazos;
  const sp = await searchParams;
  const { start, end, year, monthIndex } = monthView(sp.mes);
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const [plazosRaw, causas, responsables] = await Promise.all([
    prisma.plazo.findMany({
      where: { fechaLimite: { gte: start, lte: end } },
      include: { causa: true, responsable: { select: publicUserSelect } },
      orderBy: { fechaLimite: "asc" },
    }),
    prisma.causa.findMany({
      where: { estado: { in: ["activa", "suspensa"] } },
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
  const plazos = plazosRaw.filter((plazo) =>
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
        eyebrow={h.eyebrow}
        title={h.title}
        subtitle={h.subtitle}
        actions={
          <Link className="btn btn-secondary" href="/agente?utility=plazos">
            {h.analyze}
          </Link>
        }
      />

      <PlazoForm
        causas={causas.map((c) => ({ id: c.id, label: c.rit || c.titulo }))}
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

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Link
          className="btn btn-ghost order-2 flex-1 sm:order-1 sm:flex-none"
          href={`/plazos?mes=${prev}`}
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
          href={`/plazos?mes=${next}`}
          aria-label={t("common.nextMonth")}
        >
          <span className="sm:hidden">Sig.</span>
          <span className="hidden sm:inline">{t("common.nextMonth")}</span> →
        </Link>
      </div>

      <div className="space-y-3">
        {plazos.length === 0 && (
          <EmptyState
            title={h.title}
            description={h.empty}
            actionLabel={h.openCalendar}
            actionHref="/calendario"
          />
        )}
        {plazos.map((p) => (
          <div
            key={p.id}
            className="panel flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-xl)] px-5 py-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{p.titulo}</h2>
                <StatusBadge estado={p.estado} />
                <UrgenciaBadge fecha={p.fechaLimite} estado={p.estado} />
                <span className="badge badge-ink">{p.tipo}</span>
                <span className="badge badge-ink">{labelTipoComputo(p.tipoComputo)}</span>
                {p.esFatal && <span className="badge badge-vencido">{h.fatal}</span>}
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">
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
            <PlazoGoogleButton plazoId={p.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
