import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth/access";
import { NewClienteForm } from "@/components/clientes/NewClienteForm";
import { clienteListInclude } from "@/lib/clientes/list";
import { StatusBadge } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/sites/SiteNav";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const user = await requireStaffPage();
  const { t } = await getI18n();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const estado = sp.estado;

  const LIST_TAKE = 100;
  const [clientes, abogados] = await Promise.all([
    prisma.cliente.findMany({
      where: {
        AND: [
          estado ? { estado } : {},
          q
            ? {
                OR: [
                  { razonSocial: { contains: q, mode: "insensitive" } },
                  { rut: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
        ],
      },
      include: clienteListInclude(user),
      orderBy: { updatedAt: "desc" },
      take: LIST_TAKE,
    }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "abogado", "asistente"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("crm.eyebrow")}
        title={t("crm.title")}
        artwork="clients"
        subtitle={t("crm.subtitle")}
        actions={<NewClienteForm abogados={abogados} userId={user.id} />}
      />

      <form className="panel grid items-end gap-4 rounded-[var(--radius-lg)] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.5fr)_auto]" role="search">
        <label className="block space-y-2 text-sm font-medium">
          <span>{t("crm.colClient")}</span>
        <input
          className="input"
          name="q"
          defaultValue={q || ""}
          placeholder={t("crm.searchPlaceholder")}
        />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>{t("crm.colStatus")}</span>
        <select className="select" name="estado" defaultValue={estado || ""}>
          <option value="">{t("crm.filterAll")}</option>
          <option value="activo">{t("crm.filterActive")}</option>
          <option value="inactivo">{t("crm.filterInactive")}</option>
        </select>
        </label>
        <button className="btn btn-secondary" type="submit">
          {t("crm.filter")}
        </button>
      </form>

      {clientes.length > 0 ? (
        <p className="text-xs text-[var(--muted)]">
          Mostrando hasta {LIST_TAKE} clientes más recientes.
        </p>
      ) : null}
      <div className="panel overflow-hidden rounded-[var(--radius-lg)]">
        <div className="overflow-x-auto">
          <table role="table" className="data-table min-w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr role="row">
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">{t("crm.colClient")}</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">{t("crm.colRut")}</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">{t("crm.colCases")}</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">{t("crm.colPending")}</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">{t("crm.colDocs")}</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">{t("crm.colLawyer")}</th>
                <th role="columnheader" scope="col" className="px-4 py-3 font-medium">{t("crm.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const pend = c.causas.reduce(
                  (n, causa) => n + causa._count.tramites,
                  0
                );
                return (
                  <tr role="row" key={c.id} className="table-row">
                    <td role="cell" data-label={t("crm.colClient")} className="data-table-primary px-4 py-3">
                      <Link
                        href={`/clientes/${c.id}`}
                        className="font-medium hover:text-[var(--sea)]"
                      >
                        {c.razonSocial}
                      </Link>
                      <div className="text-xs text-[var(--muted)]">
                        {c.tipo} · {c.email || t("crm.noEmail")}
                      </div>
                    </td>
                    <td role="cell" data-label={t("crm.colRut")} className="px-4 py-3">{c.rut || "—"}</td>
                    <td role="cell" data-label={t("crm.colCases")} className="px-4 py-3">{c._count.causas}</td>
                    <td role="cell" data-label={t("crm.colPending")} className="px-4 py-3">{pend}</td>
                    <td role="cell" data-label={t("crm.colDocs")} className="px-4 py-3">{c._count.documentos}</td>
                    <td role="cell" data-label={t("crm.colLawyer")} className="px-4 py-3">{c.abogado?.name || "—"}</td>
                    <td role="cell" data-label={t("crm.colStatus")} className="px-4 py-3">
                      <StatusBadge
                        estado={c.estado === "activo" ? "activa" : "suspendida"}
                      />
                    </td>
                  </tr>
                );
              })}
              {clientes.length === 0 && (
                <tr role="row">
                  <td role="cell"
                    colSpan={7}
                    className="px-4 py-10 text-center text-[var(--muted)]"
                  >
                    {t("crm.empty")}
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
