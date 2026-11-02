import { MinutaPlantillasManager } from "@/components/minutas/MinutaPlantillasManager";
import { formatDateTime, StatusBadge } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { minutaConfidentialWhere } from "@/lib/api";
import { causaAccessWhere as scopedcausaAccessWhere, requiredCausaWhere as scopedrequiredCausaWhere } from "@/lib/auth/causa-access";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { ACCIONES_ABIERTAS, labelTipoMinuta } from "@/lib/minutas";
import { ClipboardPen } from "lucide-react";
import Link from "next/link";

export default async function MinutasPage() {
  const user = await requireStaff();
  const { dict } = await getI18n();
  const h = dict.hubs.minutas;
  const [minutas, causas, accionesAbiertasTotal, plantillas] = await Promise.all([
    prisma.minuta.findMany({
      where: { AND: [scopedrequiredCausaWhere(user), minutaConfidentialWhere(user)] },
      include: {
        causa: { select: { id: true, titulo: true, rit: true } },
        autor: { select: { name: true } },
        // ⚡ Bolt: Fetches the count from the database rather than loading the whole array into memory.
        _count: {
          select: {
            acciones: {
              where: { estado: { in: [...ACCIONES_ABIERTAS] } },
            },
          },
        },
      },
      orderBy: { fecha: "desc" },
      take: 40,
    }),
    prisma.causa.findMany({
      where: { AND: [scopedcausaAccessWhere(user), { estado: "activa" }] },
      select: { id: true, titulo: true, rit: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.minutaAccion.count({
      where: {
        estado: { in: [...ACCIONES_ABIERTAS] },
        minuta: minutaConfidentialWhere(user),
      },
    }),
    prisma.minutaPlantilla.findMany({
      orderBy: [{ tipo: "asc" }, { nombre: "asc" }],
      take: 50,
    }),
  ]);

  const pendientes = accionesAbiertasTotal;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={h.eyebrow}
        title={h.title}
        subtitle={h.subtitle}
        actions={
          <>
            <Link className="btn btn-secondary" href="/agente?utility=draft">
              Borrador con IA
            </Link>
            <div className="inline-flex items-center gap-3 px-2 text-sm">
              <span className="text-[var(--muted)]">Acciones abiertas</span>
              <span className="display text-2xl tabular-nums">{pendientes}</span>
            </div>
          </>
        }
      />

      <section className="panel rounded-[var(--radius-lg)] p-5">
        <h2 className="text-lg font-semibold">Registrar ahora</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Elija la causa y genere la minuta en cuatro pasos.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {causas.map((c) => (
            <div
              key={c.id}
              className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] px-4 py-3 transition hover:border-[var(--sea)]/40"
            >
              <Link href={`/causas/${c.id}/minuta/nueva`} className="block">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardPen size={14} className="text-[var(--copper)]" />
                  {c.rit || "Sin RIT"}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                  {c.titulo}
                </div>
              </Link>
              <Link
                href={`/agente?causaId=${c.id}&utility=draft`}
                className="mt-2 inline-block text-xs text-[var(--sea)]"
              >
                Borrador con IA
              </Link>
            </div>
          ))}
        </div>
        {causas.length === 0 && (
          <p className="mt-4 text-sm text-[var(--muted)]">
            No hay causas activas.{" "}
            <Link href="/causas/nueva" className="text-[var(--sea)]">
              Cree una causa
            </Link>{" "}
            para registrar el primer traspaso.
          </p>
        )}
      </section>

      {(user.role === "admin" || user.role === "abogado") && (
        <MinutaPlantillasManager plantillas={plantillas} />
      )}

      {minutas.length === 0 ? (
        <EmptyState
          title="Sin minutas"
          description="Aún no hay minutas. Genere la primera tras una audiencia, reunión o llamada."
        />
      ) : (
      <section className="panel overflow-hidden rounded-[var(--radius-lg)]">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-lg font-semibold">Recientes</h2>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {minutas.map((m) => (
            <Link
              key={m.id}
              href={`/causas/${m.causaId}/minutas/${m.id}`}
              className="flex min-w-0 flex-wrap items-center justify-between gap-4 px-5 py-5 transition-colors hover:bg-[var(--mist)]"
            >
              <div className="min-w-0 flex-1 basis-64">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-sea">
                    {labelTipoMinuta(m.tipo)}
                  </span>
                  <span className="break-words font-semibold">{m.titulo}</span>
                </div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  {m.causa.rit || m.causa.titulo} ·{" "}
                  {m.autor?.name || "Sin autor"} · {formatDateTime(m.fecha)}
                </div>
              </div>
              <div className="text-sm sm:text-right">
                {m._count.acciones > 0 ? (
                  <StatusBadge estado="pendiente" />
                ) : (
                  <StatusBadge estado="cumplido" />
                )}
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {m._count.acciones} acción(es) abierta(s)
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
      )}
    </div>
  );
}
