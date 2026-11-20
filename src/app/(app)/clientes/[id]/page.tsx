import { DocumentDownloads } from "@/components/DocumentDownloads";
import { documentDownloadOptions } from "@/lib/sites/document-download-options";
import { clienteDocumentsWhere } from "@/lib/clientes/documents";
import { listCursorWhere, listWindow } from "@/lib/api/list-window";
import { ListPagination } from "@/components/ui/ListPagination";
import { taskWorkspaceAccessWhere } from "@/lib/tasks/workspace";
import { clienteVersion } from "@/lib/offline/version";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  causaAccessWhere,
  writableCausaWhere,
  documentReadWhere,
  plazoAccessWhere,
  siteAccessWhere,
} from "@/lib/auth/causa-access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth/access";
import { labelEtapa, labelMateria } from "@/lib/chile";
import { StatusBadge, formatDate } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { ClienteEditForm } from "@/components/clientes/ClienteEditForm";
import { TramitesPanel } from "@/components/clientes/TramitesPanel";
import { ClienteAiChat } from "@/components/clientes/ClienteAiChat";
import { uploadDestinations } from "@/lib/causas/upload-destination";
import { DocumentoIngestForm } from "@/components/DocumentoIngestForm";
import { DocumentoAiActions } from "@/components/ai/DocumentoAiActions";
import { TRAMITES_ABIERTOS } from "@/lib/tramites";
import { getI18n } from "@/lib/i18n/server";
import { siteTipoLabel } from "@/lib/sites/labels";

type Params = { params: Promise<{ id: string }> };
type Search = { searchParams: Promise<{ causa?: string; after?: string }> };

export default async function ClienteDetailPage({
  params,
  searchParams,
}: Params & Search) {
  const user = await requireStaffPage();
  const { t, dict } = await getI18n();
  const { id } = await params;
  const sp = await searchParams;
  const focusCausaId = sp.causa || null;

  const [cliente, abogados, documentRows, documentCount, writableCases] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id },
      include: {
        abogado: { select: { id: true, name: true } },
        causas: {
          where: causaAccessWhere(user),
          orderBy: { updatedAt: "desc" },
          include: {
            driveSyncSubscription: { select: { account: true, connectionId: true, folderId: true } },
            abogado: { select: { id: true, name: true } },
            tramites: {
              where: {
                OR: [
                  { task: null },
                  { task: { is: taskWorkspaceAccessWhere(user) } },
                ],
              },
              orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
              include: {
                responsable: { select: { id: true, name: true } },
              },
            },
            _count: {
              select: {
                documentos: { where: documentReadWhere(user) },
                plazos: { where: plazoAccessWhere(user) },
              },
            },
          },
        },
        sites: {
          where: siteAccessWhere(user),
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            tipo: true,
            isClientVisible: true,
            status: true,
            causa: { select: { id: true, rit: true, titulo: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "abogado", "asistente"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.documento.findMany({
      where: {
        AND: [
          clienteDocumentsWhere(id, user),
          listCursorWhere(sp.after, "updatedAt"),
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 51,
      select: {
        id: true,
        nombre: true,
        tipo: true,
        ruta: true,
        extractionStatus: true,
        updatedAt: true,
        causaId: true,
        autor: { select: { name: true } },
        causa: { select: { id: true, rit: true, titulo: true } },
      },
    }),
    prisma.documento.count({ where: clienteDocumentsWhere(id, user) }),
    prisma.causa.findMany({ where: { AND: [{ clienteId: id }, writableCausaWhere(user)] }, select: { id: true } }),
  ]);

  if (!cliente) notFound();
  const uploadCaseIds = new Set(writableCases.map(cause => cause.id));
  const { destinations } = await uploadDestinations(cliente.causas.filter(cause => uploadCaseIds.has(cause.id)), cliente.razonSocial);
  const { items: documentos, next: documentsNext } = listWindow(
    documentRows,
    50,
    "updatedAt",
  );

  const downloads = await documentDownloadOptions(documentos.map(document => document.id));

  // ⚡ Bolt: Calculate multiple counts in a single O(N) pass to avoid redundant iteration and memory overhead.
  let tramitesPendientes = 0;
  let tramitesHechos = 0;
  for (const c of cliente.causas) {
    for (const t of c.tramites) {
      if (t.estado === "hecho") {
        tramitesHechos++;
      } else if (
        TRAMITES_ABIERTOS.includes(t.estado as "pendiente" | "en_curso")
      ) {
        tramitesPendientes++;
      }
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/clientes"
        className="inline-flex min-h-11 items-center text-sm text-[var(--sea)] hover:underline"
      >
        ← Clientes
      </Link>
      <PageHeader
        title={cliente.razonSocial}
        subtitle={
          <>
            {cliente.rut || "Sin RUT"} · {cliente.tipo} ·{" "}
            {cliente.abogado?.name || "Sin abogado asignado"}
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <StatusBadge
          estado={cliente.estado === "activo" ? "activa" : "suspendida"}
        />
        <span className="badge badge-ink">{cliente.causas.length} causas</span>
        <span className="badge badge-pendiente">
          {tramitesPendientes} trámites pend.
        </span>
        <span className="badge badge-activa">{tramitesHechos} hechos</span>
        <span className="badge badge-sea">{documentCount} docs</span>
      </div>

      <section className="panel rounded-[var(--radius-lg)] p-5">
        <h2 className="mb-4 text-lg font-semibold">Datos del cliente</h2>
        <ClienteEditForm
          cliente={{ ...cliente, version: clienteVersion(cliente) }}
          abogados={abogados}
        />
      </section>

      <section className="panel rounded-[var(--radius-lg)] p-5">
        <h2 className="mb-4 text-lg font-semibold">
          {t("sites.clientSection.title")}
        </h2>
        {cliente.sites.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {t("sites.clientSection.empty")}
          </p>
        ) : (
          <div className="space-y-3">
            {cliente.sites.map((site) => (
              <div
                key={site.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--line)] px-4 py-3"
              >
                <div>
                  <div className="font-medium">{site.name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className="badge badge-ink">
                      {siteTipoLabel(dict, site.tipo)}
                    </span>
                    {site.isClientVisible && (
                      <span className="badge badge-sea">
                        {t("siteTabs.portalVisible")}
                      </span>
                    )}
                    {site.causa && (
                      <Link
                        href={`/causas/${site.causa.id}`}
                        className="text-[var(--sea)]"
                      >
                        {site.causa.rit || site.causa.titulo}
                      </Link>
                    )}
                  </div>
                </div>
                <Link
                  href={`/sites/${site.id}`}
                  className="btn btn-secondary text-sm"
                >
                  {t("sites.clientSection.open")}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Causas y trámites</h2>
            <p className="text-sm text-[var(--muted)]">
              Por cada causa: trámites pendientes vs hechos del estudio.
            </p>
          </div>
          <Link
            href={`/causas/nueva?clienteId=${cliente.id}`}
            className="btn btn-secondary"
          >
            Nueva causa
          </Link>
        </div>

        {cliente.causas.map((causa) => (
          <details
            key={causa.id}
            id={`causa-${causa.id}`}
            className="panel group scroll-mt-24 rounded-[var(--radius-lg)] p-5"
            open={cliente.causas.length === 1 || focusCausaId === causa.id}
          >
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/causas/${causa.id}#tramites`}
                    className="text-base font-semibold text-[var(--sea)] hover:underline"
                  >
                    {causa.rit || causa.titulo}
                  </Link>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {causa.titulo} · {causa.tribunal}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge estado={causa.estado} />
                    <span className="badge badge-sea">
                      {labelMateria(causa.materia)}
                    </span>
                    <span className="badge badge-ink">
                      {labelEtapa(causa.etapa)}
                    </span>
                    <span className="badge badge-pendiente">
                      {
                        causa.tramites.filter((t) =>
                          TRAMITES_ABIERTOS.includes(
                            t.estado as "pendiente" | "en_curso",
                          ),
                        ).length
                      }{" "}
                      pend.
                    </span>
                  </div>
                </div>
                <span className="text-xs text-[var(--muted)] group-open:hidden">
                  Expandir trámites
                </span>
              </div>
            </summary>
            <div className="mt-5 border-t border-[var(--line)] pt-4">
              <TramitesPanel
                causaId={causa.id}
                tramites={causa.tramites}
                materia={causa.materia}
                responsables={abogados}
                compact
              />
            </div>
          </details>
        ))}

        {cliente.causas.length === 0 && (
          <EmptyState
            title="Sin causas todavía"
            description="Abra la primera causa para llevar trámites, documentos y el expediente del cliente."
            actionLabel="Nueva causa"
            actionHref={`/causas/nueva?clienteId=${cliente.id}`}
          />
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Carpeta de documentos</h2>
          <p className="text-sm text-[var(--muted)]">
            Archivos del cliente y de sus causas accesibles.
          </p>
        </div>
        <DocumentoIngestForm
          lockedClienteId={cliente.id}
          clientName={cliente.razonSocial}
          causas={destinations}
        />
        <div className="space-y-2">
          {documentos.map((d) => (
            <div
              key={d.id}
              className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{d.nombre}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {d.tipo}
                    {d.causa
                      ? ` · ${d.causa.rit || d.causa.titulo}`
                      : " · carpeta cliente"}
                    {" · "}
                    {formatDate(d.updatedAt)}
                    {d.autor ? ` · ${d.autor.name}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <DocumentDownloads id={d.id} options={downloads.get(d.id)} className="btn btn-ghost text-xs" />
                </div>
              </div>
              <DocumentoAiActions documentoId={d.id} causaId={d.causa?.id} />
            </div>
          ))}
          {documentCount === 0 && (
            <p className="text-sm text-[var(--muted)]">
              No hay documentos accesibles del cliente ni de sus causas.
            </p>
          )}
        </div>
        <ListPagination
          path={`/clientes/${id}`}
          filters={{ causa: sp.causa }}
          after={sp.after}
          next={documentsNext}
          count={documentos.length}
        />
      </section>

      <ClienteAiChat
        clienteId={cliente.id}
        clienteNombre={cliente.razonSocial}
      />
    </div>
  );
}
