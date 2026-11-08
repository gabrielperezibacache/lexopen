import { EmptyState } from "@/components/EmptyState";
import { FileCommentForm } from "@/components/sites/FileCommentForm";
import { SiteFileActions } from "@/components/sites/SiteFileActions";
import { SiteNav } from "@/components/sites/SiteNav";
import { formatDate } from "@/components/ui";
import { assertSitePageAccess, clientVisibleFileWhere } from "@/lib/auth/access";
import { siteAccessWhere as scopedsiteAccessWhere, siteFileReadWhere as scopedsiteFileReadWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { isCliente } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import {
  fileVersionListSelect,
  siteFileListSelect,
} from "@/lib/sites/file-select";
import Link from "next/link";
import { notFound } from "next/navigation";

type Params = { params: Promise<{ id: string }> };

export default async function SiteFilesPage({ params }: Params) {
  const { id } = await params;
  const user = await assertSitePageAccess(id);
  const clientView = isCliente(user.role);
  const fileWhere = clientVisibleFileWhere(user);
  const fileSelect = {
    ...siteFileListSelect,
    versions: {
      orderBy: { version: "desc" as const },
      take: 3,
      select: fileVersionListSelect,
    },
    ...(clientView
      ? {}
      : {
          comments: {
            include: { author: { select: publicUserSelect } },
            orderBy: { createdAt: "desc" as const },
            take: 3,
          },
        }),
  };

  // ⚡ Bolt: Fetch site, folders, and root files concurrently to save database round trips
  const [site, folders, rootFiles] = await Promise.all([
    prisma.site.findFirst({
      where: { AND: [scopedsiteAccessWhere(user), { id }] },
      select: { id: true, name: true, tipo: true, color: true },
    }),
    prisma.folder.findMany({
      where: { siteId: id },
      include: {
        files: {
          where: { AND: [scopedsiteFileReadWhere(user), fileWhere] },
          select: fileSelect,
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.siteFile.findMany({
      where: { AND: [scopedsiteFileReadWhere(user), { siteId: id, folderId: null, ...fileWhere }] },
      select: fileSelect,
    }),
  ]);

  if (!site) notFound();

  return (
    <div>
      <SiteNav
        siteId={site.id}
        siteName={site.name}
        tipo={site.tipo}
        color={site.color}
        active="/archivos"
        clientView={clientView}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-soft)]/75">
          {clientView
            ? "Documentos compartidos contigo. Los demás archivos permanecen dentro del equipo."
            : "Archivos del equipo"}
        </p>
        {!clientView && (
          <SiteFileActions
            siteId={site.id}
            folders={folders.map((f) => ({
              id: f.id,
              name: f.name,
              parentId: f.parentId,
            }))}
          />
        )}
      </div>

      <div className="space-y-4">
        {folders.length === 0 && rootFiles.length === 0 && (
          <EmptyState
            title="Todavía no hay archivos"
            description="Añade un archivo o importa una carpeta para empezar a organizar los documentos del equipo."
          />
        )}
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
                    {!clientView &&
                      (() => {
                        const comments = (
                          f as {
                            comments?: Array<{
                              body: string;
                              author?: { name?: string | null } | null;
                            }>;
                          }
                        ).comments;
                        const first = comments?.[0];
                        if (!first) return null;
                        return (
                          <div className="mt-2 text-xs text-[var(--ink-soft)]/80">
                            {first.author?.name}: {first.body}
                          </div>
                        );
                      })()}
                  </div>
                  <div className="text-xs text-[var(--ink-soft)]/60">
                    <a
                      href={`/api/sites/${site.id}/files/${f.id}/content`}
                      className="text-[var(--sea)]"
                    >
                      Descargar
                    </a>{" "}
                    · {f.versions.length} versiones
                    {!clientView && <><Link href={`/sites/${site.id}/archivos/${f.id}/fuentes`} className="ml-3 text-[var(--sea)]">Ver fuentes</Link><Link href={`/offline.html?kind=adjunto&record=${f.id}`} className="ml-3 inline-flex min-h-11 items-center text-[var(--sea)]">Sin conexión</Link></>}
                    {!clientView && (
                      <details className="mt-2">
                        <summary className="min-h-11 cursor-pointer py-3 text-[var(--ink-soft)]">Comentar</summary>
                        <FileCommentForm siteId={site.id} fileId={f.id} />
                      </details>
                    )}
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
            <h2 className="text-lg font-semibold">Raíz del espacio</h2>
            <div className="mt-3 space-y-2">
              {rootFiles.map((f) => (
                <div key={f.id} className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                  {f.name} · v{f.version} ·{" "}
                  <a
                    href={`/api/sites/${site.id}/files/${f.id}/content`}
                    className="text-[var(--sea)]"
                  >
                    Descargar
                  </a>
                  {!clientView && <><Link href={`/sites/${site.id}/archivos/${f.id}/fuentes`} className="ml-3 text-[var(--sea)]">Ver fuentes</Link><Link href={`/offline.html?kind=adjunto&record=${f.id}`} className="ml-3 inline-flex min-h-11 items-center text-[var(--sea)]">Sin conexión</Link></>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
