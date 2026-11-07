import { PageHeader } from "@/components/ui/PageHeader";
import { MinutaDetailActions } from "@/components/minutas/MinutaDetailActions";
import { formatDateTime } from "@/components/ui";
import { requiredCausaWhere as scopedrequiredCausaWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { driveFileUrl } from "@/lib/integrations/drive-folder";
import { labelModalidadMinuta, labelTipoMinuta } from "@/lib/minutas";
import Link from "next/link";
import { notFound } from "next/navigation";

type Params = {
  params: Promise<{ id: string; minutaId: string }>;
  searchParams: Promise<{ aviso?: string }>;
};

export default async function MinutaDetailPage({ params, searchParams }: Params) {
  const user = await requireStaff();
  const { id, minutaId } = await params;
  const sp = await searchParams;
  const minuta = await prisma.minuta.findFirst({
    where: { AND: [scopedrequiredCausaWhere(user), { id: minutaId }] },
    include: {
      causa: true,
      autor: { select: publicUserSelect },
      acciones: true,
      documento: true,
    },
  });
  if (!minuta || minuta.causaId !== id) notFound();
  if (minuta.confidencial && !canSeeConfidential(user)) {
    notFound();
  }

  const rank: Record<string, number> = {
    pendiente: 0,
    en_curso: 1,
    hecha: 2,
    cancelada: 3,
  };
  const acciones = [...minuta.acciones].sort((a, b) => {
    const ra = rank[a.estado] ?? 9;
    const rb = rank[b.estado] ?? 9;
    if (ra !== rb) return ra - rb;
    const da = a.fechaLimite?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const db = b.fechaLimite?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={`/causas/${id}`} className="inline-flex min-h-11 items-center text-sm text-[var(--sea)] hover:underline">
        ← {minuta.causa.titulo}
      </Link>
      <PageHeader artwork="writing"
        title={minuta.titulo}
        subtitle={<>{formatDateTime(minuta.fecha)} · {minuta.autor?.name || "Sin autor"} · {minuta.causa.rit || "Sin RIT"}</>}
        actions={<Link href={`/causas/${id}/minuta/nueva?tipo=${minuta.tipo}`} className="btn btn-primary">Nueva minuta</Link>}
      />
          <div className="flex flex-wrap gap-2">
            <span className="badge badge-sea">{labelTipoMinuta(minuta.tipo)}</span>
            <span className="badge badge-ink">
              {labelModalidadMinuta(minuta.modalidad)}
            </span>
            {minuta.confidencial && (
              <span className="badge badge-pendiente">confidencial</span>
            )}
          </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel space-y-5 rounded-[var(--radius-lg)] p-5 lg:col-span-2">
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
          <div className="panel rounded-[var(--radius-lg)] p-5 text-sm">
            <h2 className="text-lg font-semibold">Contexto</h2>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-[var(--muted)]">Lugar</dt>
                <dd className="font-medium">{minuta.lugar || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Participantes</dt>
                <dd className="font-medium">{minuta.participantes || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Documento</dt>
                <dd className="font-medium">
                  {minuta.documento?.nombre || "—"}
                </dd>
              </div>
              {minuta.googleDriveFileId && (
                <div>
                  <dt className="text-[var(--muted)]">Drive</dt>
                  <dd className="font-medium">
                    <a
                      href={driveFileUrl(minuta.googleDriveFileId)}
                      className="text-[var(--sea)]"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver archivo
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <MinutaDetailActions
            minutaId={minuta.id}
            acciones={acciones}
            folderId={minuta.causa.googleDriveFolderId}
            googleDriveFileId={minuta.googleDriveFileId}
            aviso={sp.aviso || null}
          />
        </aside>
      </div>
    </div>
  );
}
