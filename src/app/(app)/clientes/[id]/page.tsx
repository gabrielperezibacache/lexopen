import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth/access";
import { labelEtapa, labelMateria } from "@/lib/chile";
import { StatusBadge, formatDate } from "@/components/ui";
import { ClienteEditForm } from "@/components/clientes/ClienteEditForm";
import { TramitesPanel } from "@/components/clientes/TramitesPanel";
import { ClienteAiChat } from "@/components/clientes/ClienteAiChat";
import { DocumentoUploadForm } from "@/components/DocumentoUploadForm";
import { TRAMITES_ABIERTOS } from "@/lib/tramites";

type Params = { params: Promise<{ id: string }> };

export default async function ClienteDetailPage({ params }: Params) {
  await requireStaffPage();
  const { id } = await params;

  const [cliente, abogados] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id },
      include: {
        abogado: { select: { id: true, name: true } },
        documentos: {
          orderBy: { updatedAt: "desc" },
          include: { autor: { select: { name: true } }, causa: true },
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
        <h1 className="display mt-2 text-4xl">{cliente.razonSocial}</h1>
        <p className="mt-2 text-[var(--ink-soft)]/80">
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
            className="panel group rounded-3xl p-5"
            open={cliente.causas.length === 1}
          >
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/causas/${causa.id}`}
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
              <TramitesPanel causaId={causa.id} tramites={causa.tramites} compact />
            </div>
          </details>
        ))}

        {cliente.causas.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]/65">
            Este cliente aún no tiene causas.{" "}
            <Link
              href={`/causas/nueva?clienteId=${cliente.id}`}
              className="text-[var(--sea)]"
            >
              Crear la primera
            </Link>
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Carpeta de documentos</h2>
          <p className="text-sm text-[var(--ink-soft)]/70">
            Archivos del cliente (también puede asociarlos a una causa).
          </p>
        </div>
        <DocumentoUploadForm
          clienteId={cliente.id}
          causas={cliente.causas.map((c) => ({
            id: c.id,
            label: c.rit || c.titulo,
          }))}
        />
        <div className="space-y-2">
          {cliente.documentos.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm"
            >
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
