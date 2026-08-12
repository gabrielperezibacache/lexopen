import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth/access";
import { NewClienteForm } from "@/components/clientes/NewClienteForm";
import { TRAMITES_ABIERTOS } from "@/lib/tramites";
import { StatusBadge } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  await requireStaffPage();
  const { t } = await getI18n();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const estado = sp.estado;

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
      include: {
        abogado: { select: { id: true, name: true } },
        _count: { select: { causas: true, documentos: true } },
        causas: {
          select: {
            tramites: {
              where: { estado: { in: [...TRAMITES_ABIERTOS] } },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "abogado", "asistente"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            {t("crm.eyebrow")}
          </p>
          <h1 className="display mt-2 text-4xl">{t("crm.title")}</h1>
          <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
            {t("crm.subtitle")}
          </p>
        </div>
        <NewClienteForm abogados={abogados} />
      </div>

      <form className="flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          name="q"
          defaultValue={q || ""}
          placeholder={t("crm.searchPlaceholder")}
        />
        <select className="select" name="estado" defaultValue={estado || ""}>
          <option value="">{t("crm.filterAll")}</option>
          <option value="activo">{t("crm.filterActive")}</option>
          <option value="inactivo">{t("crm.filterInactive")}</option>
        </select>
        <button className="btn btn-secondary" type="submit">
          {t("crm.filter")}
        </button>
      </form>

      <div className="panel overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--ink)] text-white/90">
              <tr>
                <th className="px-4 py-3 font-medium">{t("crm.colClient")}</th>
                <th className="px-4 py-3 font-medium">{t("crm.colRut")}</th>
                <th className="px-4 py-3 font-medium">{t("crm.colCases")}</th>
                <th className="px-4 py-3 font-medium">{t("crm.colPending")}</th>
                <th className="px-4 py-3 font-medium">{t("crm.colDocs")}</th>
                <th className="px-4 py-3 font-medium">{t("crm.colLawyer")}</th>
                <th className="px-4 py-3 font-medium">{t("crm.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const pend = c.causas.reduce(
                  (n, causa) => n + causa.tramites.length,
                  0
                );
                return (
                  <tr key={c.id} className="table-row">
                    <td className="px-4 py-3">
                      <Link
                        href={`/clientes/${c.id}`}
                        className="font-medium hover:text-[var(--sea)]"
                      >
                        {c.razonSocial}
                      </Link>
                      <div className="text-xs text-[var(--ink-soft)]/60">
                        {c.tipo} · {c.email || t("crm.noEmail")}
                      </div>
                    </td>
                    <td className="px-4 py-3">{c.rut || "—"}</td>
                    <td className="px-4 py-3">{c._count.causas}</td>
                    <td className="px-4 py-3">{pend}</td>
                    <td className="px-4 py-3">{c._count.documentos}</td>
                    <td className="px-4 py-3">{c.abogado?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        estado={c.estado === "activo" ? "activa" : "suspendida"}
                      />
                    </td>
                  </tr>
                );
              })}
              {clientes.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-[var(--ink-soft)]/70"
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
