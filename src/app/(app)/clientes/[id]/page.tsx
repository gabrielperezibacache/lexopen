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
import { DocumentoIngestForm } from "@/components/DocumentoIngestForm";
import { DocumentoAiActions } from "@/components/ai/DocumentoAiActions";
import { confidentialWhere } from "@/lib/api";
import { TRAMITES_ABIERTOS } from "@/lib/tramites";
import { getI18n } from "@/lib/i18n/server";
import { siteTipoLabel } from "@/lib/sites/labels";

type Params = { params: Promise<{ id: string }> };
type Search = { searchParams: Promise<{ causa?: string }> };

export default async function ClienteDetailPage({
  params,
  searchParams,
}: Params & Search) {
  const user = await requireStaffPage();
  const { t, dict } = await getI18n();
  const { id } = await params;
  const sp = await searchParams;
  const focusCausaId = sp.causa || null;

  const [cliente, abogados] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id },
      include: {
        abogado: { select: { id: true, name: true } },
        documentos: {
          where: confidentialWhere(user.role),
          orderBy: { updatedAt: "desc" },
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
        },
        causas: {
          orderBy: { updatedAt: "desc" },
          include: {
            abogado: { select: { id: true, name: true } },
            tramites: {
              orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
              include: {
                responsable: { select: { id: true, name: true } },
              },
            },
            _count: { select: { documentos: true, plazos: true } },
          },
        },
        sites: {
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
  ]);

  if (!cliente) notFound();

  const tramitesPendientes = cliente.causas.reduce(
    (n, c) =>
      n +
      c.tramites.filter((t) =>
        TRAMITES_ABIERTOS.includes(t.estado as "pendiente" | "en_curso")
      ).length,
    0
  );
  const tramitesHechos = cliente.causas.reduce(
    (n, c) => n + c.tramites.filter((t) => t.estado === "hecho").length,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clientes" className="text-sm text-[var(--sea)]">
          ← Clientes
        </Link>
        <h1 className="display mt-2 break-words text-2xl sm:text-3xl md:text-4xl">{cliente.razonSocial}</h1>
        <p className="mt-2 break-words text-[var(--ink-soft)]/80">
          {cliente.rut || "Sin RUT"} · {cliente.tipo} ·{" "}
          {cliente.abogado?.name || "Sin abogado asignado"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge
            estado={cliente.estado === "activo" ? "activa" : "suspendida"}
          />
          <span className="badge badge-ink">{cliente.causas.length} causas</span>
          <span className="badge badge-pendiente">
            {tramitesPendientes} trámites pend.
          </span>
          <span className="badge badge-activa">{tramitesHechos} hechos</span>
          <span className="badge badge-sea">
            {cliente.documentos.length} docs
          </span>
        </div>
      </div>

      <section className="panel rounded-3xl p-5">
        <h2 className="mb-4 text-lg font-semibold">Datos del cliente</h2>
        <ClienteEditForm cliente={cliente} abogados={abogados} />
      </section>

      <section className="panel rounded-3xl p-5">
        <h2 className="mb-4 text-lg font-semibold">{t("sites.clientSection.title")}</h2>
        {cliente.sites.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]/70">{t("sites.clientSection.empty")}</p>
        ) : (
          <div className="space-y-3">
            {cliente.sites.map((site) => (
              <div
                key={site.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] px-4 py-3"
              >
                <div>
                  <div className="font-medium">{site.name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className="badge badge-ink">{siteTipoLabel(dict, site.tipo)}</span>
                    {site.isClientVisible && (
                      <span className="badge badge-sea">{t("siteTabs.portalVisible")}</span>
                    )}
                    {site.causa && (
                      <Link href={`/causas/${site.causa.id}`} className="text-[var(--sea)]">
                        {site.causa.rit || site.causa.titulo}
                      </Link>
                    )}
                  </div>
                </div>
                <Link href={`/sites/${site.id}`} className="btn btn-secondary text-sm">
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
            <p className="text-sm text-[var(--ink-soft)]/70">
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
            className="panel group scroll-mt-24 rounded-3xl p-5"
            open={
              cliente.causas.length === 1 || focusCausaId === causa.id
            }
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
                  <div className="mt-1 text-sm text-[var(--ink-soft)]/75">
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
                            t.estado as "pendiente" | "en_curso"
                          )
                        ).length
                      }{" "}
                      pend.
                    </span>
                  </div>
                </div>
                <span className="text-xs text-[var(--ink-soft)]/55 group-open:hidden">
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
          <p className="text-sm text-[var(--ink-soft)]/70">
            Archivos del cliente (también puede asociarlos a una causa).
          </p>
        </div>
        <DocumentoIngestForm
          lockedClienteId={cliente.id}
          causas={cliente.causas.map((c) => ({
            id: c.id,
            label: c.rit || c.titulo,
          }))}
        />
        <div className="space-y-2">
          {cliente.documentos.map((d) => (
            <div
              key={d.id}
              className="rounded-2xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{d.nombre}</div>
                  <div className="text-xs text-[var(--ink-soft)]/60">
                    {d.tipo}
                    {d.causa ? ` · ${d.causa.rit || d.causa.titulo}` : " · carpeta cliente"}
                    {" · "}
                    {formatDate(d.updatedAt)}
                    {d.autor ? ` · ${d.autor.name}` : ""}
                  </div>
                </div>
                <Link
                  href={`/api/documentos/${d.id}/content`}
                  className="btn btn-ghost text-xs"
                >
                  Descargar
                </Link>
              </div>
              <DocumentoAiActions
                documentoId={d.id}
                causaId={d.causa?.id}
              />
            </div>
          ))}
          {cliente.documentos.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">
              Carpeta vacía. Suba el primer documento.
            </p>
          )}
        </div>
      </section>

      <ClienteAiChat
        clienteId={cliente.id}
        clienteNombre={cliente.razonSocial}
      />
    </div>
  );
}
