import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { labelEtapa, labelMateria } from "@/lib/chile";
import { StatusBadge, formatDate } from "@/components/ui";
import { Plus } from "lucide-react";
import { CausasFilters } from "@/components/CausasFilters";
import { CausaManageActions } from "@/components/CausaManageActions";
import { requireStaff } from "@/lib/auth/session";
import { PageHeader } from "@/components/sites/SiteNav";
import {
  causaOrigenWhere,
  labelCausaOrigen,
} from "@/lib/pjud/causa-origin";
import {
  diasEntre,
  labelSemaforo,
  semaforoPorDiasSinMovimiento,
} from "@/lib/pjud/classify";
import { getI18n } from "@/lib/i18n/server";

const PAGE_SIZE = 50;

const DOT: Record<string, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-400",
  rojo: "bg-rose-500",
  gris: "bg-slate-300",
};

function interpolate(
  template: string,
  vars: Record<string, string | number>
) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export default async function CausasPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    materia?: string;
    estado?: string;
    origen?: string;
    monitoreo?: string;
    page?: string;
  }>;
}) {
  const user = await requireStaff();
  const { t } = await getI18n();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const materia = sp.materia;
  const origen = sp.origen?.trim();
  const monitoreo = sp.monitoreo?.trim();
  /** Default to active causas so archivadas don't clutter the hub. */
  const rawEstado = sp.estado;
  const estado =
    rawEstado === undefined || rawEstado === ""
      ? "activa"
      : rawEstado === "all"
        ? ""
        : rawEstado;
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.CausaWhereInput = {
    AND: [
      q
        ? {
            OR: [
              { titulo: { contains: q } },
              { rit: { contains: q } },
              { ruc: { contains: q } },
              { caratula: { contains: q } },
              { tribunal: { contains: q } },
            ],
          }
        : {},
      materia ? { materia } : {},
      estado ? { estado } : {},
      causaOrigenWhere(origen) as Prisma.CausaWhereInput,
      monitoreo === "on"
        ? { pjudMonitoreoActivo: true }
        : monitoreo === "off"
          ? { pjudMonitoreoActivo: false }
          : {},
    ],
  };

  const [total, causas] = await Promise.all([
    prisma.causa.count({ where }),
    prisma.causa.findMany({
      where,
      include: {
        cliente: true,
        abogado: true,
        movimientos: { orderBy: { fecha: "desc" }, take: 1 },
        _count: { select: { documentos: true, plazos: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const filterQuery = new URLSearchParams();
  if (q) filterQuery.set("q", q);
  if (materia) filterQuery.set("materia", materia);
  if (rawEstado) filterQuery.set("estado", rawEstado);
  if (origen) filterQuery.set("origen", origen);
  if (monitoreo) filterQuery.set("monitoreo", monitoreo);
  const qs = (nextPage: number) => {
    const p = new URLSearchParams(filterQuery);
    if (nextPage > 1) p.set("page", String(nextPage));
    const s = p.toString();
    return s ? `/causas?${s}` : "/causas";
  };

  const hasExtraFilters = Boolean(
    q || materia || origen || monitoreo || (estado && estado !== "activa")
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("causas.eyebrow")}
        title={t("causas.title")}
        subtitle={t("causas.subtitle")}
        actions={
          <>
            <Link href="/causas/monitoreo?alta=1#alta-rol" className="btn btn-secondary">
              {t("causas.addByRol")}
            </Link>
            <Link href="/causas/nueva" className="btn btn-primary">
              <Plus size={16} /> {t("causas.newCase")}
            </Link>
          </>
        }
      />

      <CausasFilters defaultEstado={estado || ""} />

      {total > 0 ? (
        <p className="text-xs text-[var(--ink-soft)]/65">
          {interpolate(t("causas.showing"), { from, to, total })}
          {estado === "activa" ? t("causas.showingActive") : estado ? ` (${estado})` : ""}
          .
        </p>
      ) : null}
      <div className="panel overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--ink)] text-white/90">
              <tr>
                <th className="px-4 py-3 font-medium">{t("causas.colCase")}</th>
                <th className="px-4 py-3 font-medium">{t("causas.colCourt")}</th>
                <th className="px-4 py-3 font-medium">{t("causas.colMatter")}</th>
                <th className="px-4 py-3 font-medium">{t("causas.colStage")}</th>
                <th className="px-4 py-3 font-medium">{t("causas.colProcedural")}</th>
                <th className="px-4 py-3 font-medium">{t("causas.colOrigin")}</th>
                <th className="px-4 py-3 font-medium">{t("causas.colPjud")}</th>
                <th className="px-4 py-3 font-medium">{t("causas.colUpdated")}</th>
                <th className="px-4 py-3 font-medium">{t("causas.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {causas.map((c) => {
                const origenLabel = labelCausaOrigen({
                  pjudOrigin: c.pjudOrigin,
                  pjudFromMisCausas: c.pjudFromMisCausas,
                  pjudSource: c.pjudSource,
                });
                const last = c.movimientos[0] || null;
                const dias = last ? diasEntre(last.fecha) : null;
                const semaforo = last
                  ? semaforoPorDiasSinMovimiento(dias)
                  : null;
                const diasLabel =
                  dias === null
                    ? t("causas.noMovement")
                    : dias === 0
                      ? t("causas.daysToday")
                      : interpolate(t("causas.daysAgo"), { n: dias });
                return (
                  <tr key={c.id} className="table-row">
                    <td className="px-4 py-3">
                      <Link
                        href={`/causas/${c.id}`}
                        className="font-medium hover:text-[var(--sea)]"
                      >
                        {c.titulo}
                      </Link>
                      <div className="mt-1 text-xs text-[var(--ink-soft)]/65">
                        {c.rit || "Sin RIT"} ·{" "}
                        {c.cliente?.razonSocial || "Sin cliente"} ·{" "}
                        {c._count.documentos} docs · {c._count.plazos} plazos
                      </div>
                    </td>
                    <td className="px-4 py-3">{c.tribunal}</td>
                    <td className="px-4 py-3">{labelMateria(c.materia)}</td>
                    <td className="px-4 py-3">{labelEtapa(c.etapa)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge estado={c.estado} />
                    </td>
                    <td className="px-4 py-3 text-xs">{origenLabel}</td>
                    <td className="px-4 py-3">
                      {c.pjudMonitoreoActivo ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            {semaforo ? (
                              <span
                                className={`h-2 w-2 rounded-full ${DOT[semaforo]}`}
                                title={labelSemaforo(semaforo)}
                              />
                            ) : null}
                            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                              {t("causas.pjudOn")}
                            </span>
                          </span>
                          <span className="text-[11px] text-[var(--ink-soft)]/65">
                            {diasLabel}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--ink-soft)]/50">
                          {t("causas.pjudOff")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{formatDate(c.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <CausaManageActions
                        causaId={c.id}
                        titulo={c.titulo}
                        estado={c.estado}
                        isAdmin={user.role === "admin"}
                        compact
                      />
                    </td>
                  </tr>
                );
              })}
              {causas.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-[var(--ink-soft)]/70"
                  >
                    {hasExtraFilters ? (
                      <>
                        {t("causas.empty")}{" "}
                        <Link href="/causas" className="text-[var(--sea)]">
                          Ver activas
                        </Link>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p>{t("causas.emptyActive")}</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          <Link href="/causas/nueva" className="btn btn-primary">
                            {t("causas.emptyCreate")}
                          </Link>
                          <Link
                            href="/causas/monitoreo?alta=1#alta-rol"
                            className="btn btn-secondary"
                          >
                            {t("causas.emptyRol")}
                          </Link>
                          <Link
                            href="/causas/mis-causas"
                            className="btn btn-ghost"
                          >
                            {t("causas.emptyClaveunica")}
                          </Link>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={qs(page - 1)} className="text-[var(--sea)]">
              ← {t("causas.prevPage")}
            </Link>
          ) : (
            <span />
          )}
          {page < totalPages ? (
            <Link href={qs(page + 1)} className="text-[var(--sea)]">
              {t("causas.nextPage")} →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
