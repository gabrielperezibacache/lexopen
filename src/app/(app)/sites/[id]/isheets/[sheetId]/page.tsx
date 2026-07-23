import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/sites/SiteNav";
import { ISheetTable } from "@/components/sites/ISheetTable";

type Params = { params: Promise<{ id: string; sheetId: string }> };

export default async function ISheetDetailPage({ params }: Params) {
  const { id, sheetId } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();
  const sheet = await prisma.iSheet.findUnique({
    where: { id: sheetId },
    include: {
      columns: { orderBy: { position: "asc" } },
      rows: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!sheet || sheet.siteId !== id) notFound();

  return (
    <div>
      <SiteNav siteId={site.id} siteName={site.name} tipo={site.tipo} color={site.color} active="/isheets" />
      <div className="mb-4">
        <h2 className="display text-3xl">{sheet.name}</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/75">{sheet.description}</p>
      </div>
      <ISheetTable
        siteId={site.id}
        sheetId={sheet.id}
        columns={sheet.columns.map((c) => ({
          key: c.key,
          name: c.name,
          type: c.type,
          options: c.options,
        }))}
        rows={sheet.rows.map((r) => ({
          id: r.id,
          data: JSON.parse(r.dataJson) as Record<string, string>,
        }))}
      />
    </div>
  );
}
