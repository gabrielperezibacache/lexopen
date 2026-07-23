import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/sites/SiteNav";
import { NewISheetButton } from "@/components/sites/NewISheetButton";

type Params = { params: Promise<{ id: string }> };

export default async function SiteISheetsPage({ params }: Params) {
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();
  const sheets = await prisma.iSheet.findMany({
    where: { siteId: id },
    include: {
      columns: true,
      _count: { select: { rows: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <SiteNav siteId={site.id} siteName={site.name} tipo={site.tipo} color={site.color} active="/isheets" />
      <div className="mb-4 flex items-center justify-between">
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-soft)]/75">
          iSheets — tablas estructuradas colaborativas (seguimiento procesal, issues log, reporting).
        </p>
        <NewISheetButton siteId={site.id} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {sheets.map((s) => (
          <Link
            key={s.id}
            href={`/sites/${site.id}/isheets/${s.id}`}
            className="panel rounded-3xl p-5 transition hover:shadow-[var(--shadow)]"
          >
            <h2 className="text-xl font-semibold">{s.name}</h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]/75">
              {s.description || "Sin descripción"}
            </p>
            <div className="mt-4 text-xs text-[var(--ink-soft)]/60">
              {s.columns.length} columnas · {s._count.rows} filas
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
