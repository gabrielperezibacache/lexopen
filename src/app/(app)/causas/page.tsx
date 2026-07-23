import Link from "next/link";
import { prisma } from "@/lib/db";
import { labelEtapa, labelMateria } from "@/lib/chile";
import { StatusBadge, formatDate } from "@/components/ui";
import { Plus } from "lucide-react";
import { CausasFilters } from "@/components/CausasFilters";

export default async function CausasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; materia?: string; estado?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  const materia = sp.materia;
  const estado = sp.estado;

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
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            Litigio Chile
          </p>
          <h1 className="display mt-2 text-4xl">Causas judiciales</h1>
          <p className="mt-2 text-[var(--ink-soft)]/80">
            RIT, RUC, tribunal, etapa procesal y equipo responsable.
          </p>
        </div>
        <Link href="/causas/nueva" className="btn btn-primary">
          <Plus size={16} /> Nueva causa
        </Link>
      </div>

      <CausasFilters />

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
              </tr>
            </thead>
            <tbody>
              {causas.map((c) => (
                <tr key={c.id} className="table-row">
                  <td className="px-4 py-3">
                    <Link href={`/causas/${c.id}`} className="font-medium hover:text-[var(--sea)]">
                      {c.titulo}
                    </Link>
                    <div className="mt-1 text-xs text-[var(--ink-soft)]/65">
                      {c.rit || "Sin RIT"} · {c.cliente?.razonSocial || "Sin cliente"} ·{" "}
                      {c._count.documentos} docs · {c._count.plazos} plazos
                    </div>
                  </td>
                  <td className="px-4 py-3">{c.tribunal}</td>
                  <td className="px-4 py-3">{labelMateria(c.materia)}</td>
                  <td className="px-4 py-3">{labelEtapa(c.etapa)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge estado={c.estado} />
                  </td>
                  <td className="px-4 py-3">{formatDate(c.updatedAt)}</td>
                </tr>
              ))}
              {causas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--ink-soft)]/70">
                    No hay causas con esos filtros.
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
