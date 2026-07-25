import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/components/ui";
import { labelModalidadMinuta, labelTipoMinuta } from "@/lib/minutas";
import { MinutaDetailActions } from "@/components/minutas/MinutaDetailActions";

type Params = { params: Promise<{ id: string; minutaId: string }> };

export default async function MinutaDetailPage({ params }: Params) {
  const { id, minutaId } = await params;
  const minuta = await prisma.minuta.findUnique({
    where: { id: minutaId },
    include: {
      causa: true,
      autor: true,
      acciones: { orderBy: [{ estado: "asc" }, { fechaLimite: "asc" }] },
      documento: true,
    },
  });
  if (!minuta || minuta.causaId !== id) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/causas/${id}`} className="text-sm text-[var(--sea)]">
            ← {minuta.causa.titulo}
          </Link>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="badge badge-sea">{labelTipoMinuta(minuta.tipo)}</span>
            <span className="badge badge-ink">
              {labelModalidadMinuta(minuta.modalidad)}
            </span>
            {minuta.confidencial && (
              <span className="badge badge-pendiente">confidencial</span>
            )}
          </div>
          <h1 className="display mt-2 text-4xl">{minuta.titulo}</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]/75">
            {formatDateTime(minuta.fecha)} ·{" "}
            {minuta.autor?.name || "Sin autor"} ·{" "}
            {minuta.causa.rit || "Sin RIT"}
          </p>
        </div>
        <Link
          href={`/causas/${id}/minuta/nueva?tipo=${minuta.tipo}`}
          className="btn btn-primary"
        >
          Nueva minuta
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel rounded-3xl p-5 lg:col-span-2 space-y-5">
          <section>
            <h2 className="text-lg font-semibold">Resumen ejecutivo</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink-soft)]/90">
              {minuta.resumenEjecutivo}
            </p>
          </section>
          {minuta.hechosRelevantes && (
            <section>
              <h2 className="text-lg font-semibold">Hechos relevantes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink-soft)]/90">
                {minuta.hechosRelevantes}
              </p>
            </section>
          )}
          {minuta.acuerdos && (
            <section>
              <h2 className="text-lg font-semibold">Acuerdos / resoluciones</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink-soft)]/90">
                {minuta.acuerdos}
              </p>
            </section>
          )}
          {minuta.estadoCausaNota && (
            <section>
              <h2 className="text-lg font-semibold">Estado tras el acto</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink-soft)]/90">
                {minuta.estadoCausaNota}
              </p>
            </section>
          )}
          {minuta.riesgosAlertas && (
            <section>
              <h2 className="text-lg font-semibold">Riesgos y alertas</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink-soft)]/90">
                {minuta.riesgosAlertas}
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="panel rounded-3xl p-5 text-sm">
            <h2 className="text-lg font-semibold">Contexto</h2>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-[var(--ink-soft)]/55">Lugar</dt>
                <dd className="font-medium">{minuta.lugar || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]/55">Participantes</dt>
                <dd className="font-medium">{minuta.participantes || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--ink-soft)]/55">Documento</dt>
                <dd className="font-medium">
                  {minuta.documento?.nombre || "—"}
                </dd>
              </div>
              {minuta.googleDriveFileId && (
                <div>
                  <dt className="text-[var(--ink-soft)]/55">Drive file</dt>
                  <dd className="break-all font-medium">
                    {minuta.googleDriveFileId}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <MinutaDetailActions
            minutaId={minuta.id}
            acciones={minuta.acciones}
            hasDriveFolder={Boolean(minuta.causa.googleDriveFolderId)}
            googleDriveFileId={minuta.googleDriveFileId}
          />
        </aside>
      </div>
    </div>
  );
}
