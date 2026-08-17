import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { isAdmin, isCliente } from "@/lib/auth/rbac";
import { clientSiteWhere } from "@/lib/auth/access";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { NewSiteButton } from "@/components/sites/NewSiteButton";
import { EmptyState } from "@/components/EmptyState";
import { SitesGuidePanel } from "@/components/sites/SitesGuidePanel";
import { SitesFilters } from "@/components/sites/SitesFilters";
import { formatDate } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { siteTipoLabel } from "@/lib/sites/labels";

const LIST_TAKE = 100;

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; estado?: string; portal?: string }>;
}) {
  const user = await requireUser();
  const { t, dict } = await getI18n();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const tipo = sp.tipo?.trim();
  const rawEstado = sp.estado;
  const estado =
    rawEstado === undefined || rawEstado === ""
      ? "active"
      : rawEstado === "all"
        ? ""
        : rawEstado;
  const portalOnly = sp.portal === "1";

  const sites = await prisma.site.findMany({
    where: {
      AND: [
        isCliente(user.role) ? clientSiteWhere(user.id) : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { slug: { contains: q, mode: "insensitive" } },
                { causa: { rit: { contains: q, mode: "insensitive" } } },
                { cliente: { razonSocial: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {},
        tipo ? { tipo } : {},
        estado ? { status: estado } : {},
        portalOnly ? { isClientVisible: true } : {},
      ],
    },
    select: {
      id: true,
      name: true,
      description: true,
      tipo: true,
      color: true,
      status: true,
      isClientVisible: true,
      updatedAt: true,
      cliente: { select: { id: true, razonSocial: true } },
      causa: { select: { id: true, rit: true, titulo: true } },
      _count: { select: { files: true, tasks: true, members: true, isheets: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: LIST_TAKE,
  });

  const staff = !isCliente(user.role);

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow={t("sites.eyebrow")}
        title={t("sites.title")}
        subtitle={t("sites.subtitle")}
        actions={
          staff ? <NewSiteButton isAdmin={isAdmin(user.role)} /> : undefined
        }
      />

      {staff && <SitesGuidePanel />}
      {staff && <SitesFilters defaultStatus={estado || "active"} />}

      {sites.length > 0 && staff && (
        <p className="text-xs text-[var(--ink-soft)]/65">
          {t("sites.table.showing").replace("{count}", String(LIST_TAKE))}
          {estado === "active" ? ` (${t("sites.filters.active").toLowerCase()})` : ""}
        </p>
      )}

      {sites.length === 0 ? (
        <EmptyState
          title={t("sites.emptyTitle")}
          description={t("sites.emptyDescription")}
          action={staff ? <NewSiteButton isAdmin={isAdmin(user.role)} /> : undefined}
        />
      ) : staff ? (
        <>
          <div className="hidden md:block panel overflow-hidden rounded-3xl">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--ink)] text-white/90">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("sites.table.site")}</th>
                    <th className="px-4 py-3 font-medium">{t("sites.table.type")}</th>
                    <th className="px-4 py-3 font-medium">{t("sites.table.client")}</th>
                    <th className="px-4 py-3 font-medium">{t("sites.table.case")}</th>
                    <th className="px-4 py-3 font-medium">{t("sites.table.portal")}</th>
                    <th className="px-4 py-3 font-medium">{t("sites.table.files")}</th>
                    <th className="px-4 py-3 font-medium">{t("sites.table.tasks")}</th>
                    <th className="px-4 py-3 font-medium">{t("sites.table.updated")}</th>
                    <th className="px-4 py-3 font-medium">{t("sites.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => (
                    <tr key={s.id} className="border-t border-[var(--line)]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                          <Link href={`/sites/${s.id}`} className="font-medium text-[var(--sea)] hover:underline">
                            {s.name}
                          </Link>
                        </div>
                        {s.status === "archived" && (
                          <span className="badge badge-ink mt-1">{t("siteTabs.archived")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge badge-ink">{siteTipoLabel(dict, s.tipo)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {s.cliente ? (
                          <Link href={`/clientes/${s.cliente.id}`} className="text-[var(--sea)] hover:underline">
                            {s.cliente.razonSocial}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.causa ? (
                          <Link href={`/causas/${s.causa.id}`} className="text-[var(--sea)] hover:underline">
                            {s.causa.rit || s.causa.titulo}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.isClientVisible ? t("sites.table.yes") : t("sites.table.no")}
                      </td>
                      <td className="px-4 py-3">{s._count.files}</td>
                      <td className="px-4 py-3">{s._count.tasks}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(s.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/sites/${s.id}`} className="text-[var(--sea)] hover:underline">
                          {t("sites.table.open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 md:hidden">
            {sites.map((s) => (
              <Link
                key={s.id}
                href={`/sites/${s.id}`}
                className="panel group rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="mt-1 h-3 w-3 rounded-full" style={{ background: s.color }} />
                  <span className="badge badge-ink">{siteTipoLabel(dict, s.tipo)}</span>
                </div>
                <h2 className="mt-3 break-words text-xl font-semibold group-hover:text-[var(--sea)]">
                  {s.name}
                </h2>
                <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-soft)]/75">
                  {s.description || t("sites.noDescription")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {s.isClientVisible && (
                    <span className="badge badge-sea">{t("siteTabs.portalVisible")}</span>
                  )}
                  {s.status === "archived" && (
                    <span className="badge badge-ink">{t("siteTabs.archived")}</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--ink-soft)]/65">
                  <span>{s._count.files} {t("sites.table.files").toLowerCase()}</span>
                  <span>{s._count.tasks} {t("sites.table.tasks").toLowerCase()}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <div
              key={s.id}
              className="panel rounded-3xl p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="mt-1 h-3 w-3 rounded-full" style={{ background: s.color }} />
                <span className="badge badge-ink">{siteTipoLabel(dict, s.tipo)}</span>
              </div>
              <Link href={`/sites/${s.id}/archivos`}>
                <h2 className="mt-3 break-words text-xl font-semibold hover:text-[var(--sea)]">
                  {s.name}
                </h2>
              </Link>
              <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-soft)]/75">
                {s.description || t("sites.noDescription")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/sites/${s.id}/archivos`} className="btn btn-secondary text-sm">
                  {t("sites.clientCard.files")}
                </Link>
                <Link href={`/sites/${s.id}/qa`} className="btn btn-ghost text-sm">
                  {t("sites.clientCard.qa")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
