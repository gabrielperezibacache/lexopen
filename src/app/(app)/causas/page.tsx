import Link from "next/link";
import { prisma } from "@/lib/db";
import { labelEtapa, labelMateria } from "@/lib/chile";
import { StatusBadge, formatDate } from "@/components/ui";
import { Plus } from "lucide-react";
import { CausasFilters } from "@/components/CausasFilters";
import { CausaManageActions } from "@/components/CausaManageActions";
import { requireStaff } from "@/lib/auth/session";
import { PageHeader } from "@/components/sites/SiteNav";
import { labelCausaOrigen } from "@/lib/pjud/causa-origin";
import { getI18n } from "@/lib/i18n/server";

export default async function CausasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; materia?: string; estado?: string }>;
}) {
  const user = await requireStaff();
  const { t } = await getI18n();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const materia = sp.materia;
  /** Default to active causas so archivadas don't clutter the hub. */
  const rawEstado = sp.estado;
  const estado =
    rawEstado === undefined || rawEstado === ""
      ? "activa"
      : rawEstado === "all"
        ? ""
        : rawEstado;

  const LIST_TAKE = 100;
  const causas = await prisma.causa.findMany({
    where: {
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
      ],
    },
    include: {
      cliente: true,
      abogado: true,
      _count: { select: { documentos: true, plazos: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: LIST_TAKE,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("causas.eyebrow")}
        title={t("causas.title")}
        subtitle={t("causas.subtitle")}
        actions={
          <>
            <Link href="/causas/mis-causas" className="btn btn-ghost">
              Mis Causas
            </Link>
            <Link href="/causas/monitoreo" className="btn btn-secondary">
              Monitoreo PJUD
            </Link>
            <Link href="/causas/nueva" className="btn btn-primary">
              <Plus size={16} /> {t("causas.newCase")}
            </Link>
          </>
        }
      />

      <CausasFilters defaultEstado={estado || ""} />

      {causas.length > 0 ? (
        <p className="text-xs text-[var(--ink-soft)]/65">
          Mostrando hasta {LIST_TAKE} causas más recientes
          {estado === "activa" ? " (activas)" : estado ? ` (${estado})` : ""}.
        </p>
      ) : null}
      <div className="panel overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--ink)] text-white/90">
              <tr>
                <th className="px-4 py-3 font-medium">Causa</th>
                <th className="px-4 py-3 font-medium">Tribunal</th>
                <th className="px-4 py-3 font-medium">Materia</th>
                <th className="px-4 py-3 font-medium">Etapa</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Actualizado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {causas.map((c) => {
                const origen = labelCausaOrigen({
                  pjudFromMisCausas: c.pjudFromMisCausas,
                  pjudSource: c.pjudSource,
                });
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
                        {origen ? ` · ${origen}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">{c.tribunal}</td>
                    <td className="px-4 py-3">{labelMateria(c.materia)}</td>
                    <td className="px-4 py-3">{labelEtapa(c.etapa)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge estado={c.estado} />
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
                    colSpan={7}
                    className="px-4 py-10 text-center text-[var(--ink-soft)]/70"
                  >
                    {q || materia || (estado && estado !== "activa") ? (
                      <>
                        No hay causas con esos filtros.{" "}
                        <Link href="/causas" className="text-[var(--sea)]">
                          Ver activas
                        </Link>
                      </>
                    ) : (
                      <>
                        Aún no hay causas activas.{" "}
                        <Link href="/causas/nueva" className="text-[var(--sea)]">
                          Crear la primera
                        </Link>{" "}
                        o importe desde{" "}
                        <Link
                          href="/causas/mis-causas"
                          className="text-[var(--sea)]"
                        >
                          Mis Causas
                        </Link>
                        .
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
