import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/sites/SiteNav";
import { formatDate } from "@/components/ui";
import { SiteFileActions } from "@/components/sites/SiteFileActions";

type Params = { params: Promise<{ id: string }> };

export default async function SiteFilesPage({ params }: Params) {
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();

  const folders = await prisma.folder.findMany({
    where: { siteId: id },
    include: {
      files: {
        include: {
          versions: { orderBy: { version: "desc" }, take: 3 },
          comments: { include: { author: true } },
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  const rootFiles = await prisma.siteFile.findMany({
    where: { siteId: id, folderId: null },
    include: {
      versions: { orderBy: { version: "desc" }, take: 3 },
      comments: { include: { author: true } },
    },
  });

  return (
    <div>
      <SiteNav siteId={site.id} siteName={site.name} tipo={site.tipo} color={site.color} active="/archivos" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-soft)]/75">
          Virtual Data Room / Files — carpetas, versiones, comentarios y metadata.
        </p>
        <SiteFileActions siteId={site.id} />
      </div>

      <div className="space-y-4">
        {folders.map((folder) => (
          <section key={folder.id} className="panel rounded-3xl p-5">
            <h2 className="text-lg font-semibold">{folder.name}</h2>
            <div className="mt-3 divide-y divide-[var(--line)]">
              {folder.files.map((f) => (
                <div key={f.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div>
                    <div className="font-medium">{f.name}</div>
                    <div className="text-xs text-[var(--ink-soft)]/65">
                      v{f.version} · {formatDate(f.updatedAt)}
                      {f.tags ? ` · ${f.tags}` : ""}
                    </div>
                    {f.comments[0] && (
                      <div className="mt-2 text-xs text-[var(--ink-soft)]/80">
                        💬 {f.comments[0].author?.name}: {f.comments[0].body}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-[var(--ink-soft)]/60">
                    {f.versions.length} versiones
                  </div>
                </div>
              ))}
              {folder.files.length === 0 && (
                <p className="py-3 text-sm text-[var(--ink-soft)]/60">Carpeta vacía</p>
              )}
            </div>
          </section>
        ))}

        {rootFiles.length > 0 && (
          <section className="panel rounded-3xl p-5">
            <h2 className="text-lg font-semibold">Raíz del site</h2>
            <div className="mt-3 space-y-2">
              {rootFiles.map((f) => (
                <div key={f.id} className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                  {f.name} · v{f.version}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
