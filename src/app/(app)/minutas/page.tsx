import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateTime, StatusBadge } from "@/components/ui";
import { ACCIONES_ABIERTAS, labelTipoMinuta } from "@/lib/minutas";
import { ClipboardPen } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { minutaConfidentialWhere } from "@/lib/api";
import { MinutaPlantillasManager } from "@/components/minutas/MinutaPlantillasManager";

export default async function MinutasPage() {
  const user = await requireStaff();
  const [minutas, causas, accionesAbiertasTotal, plantillas] = await Promise.all([
    prisma.minuta.findMany({
      where: minutaConfidentialWhere(user.role),
      include: {
        causa: { select: { id: true, titulo: true, rit: true } },
        autor: { select: { name: true } },
        acciones: {
          where: { estado: { in: [...ACCIONES_ABIERTAS] } },
        },
      },
      orderBy: { fecha: "desc" },
      take: 40,
    }),
    prisma.causa.findMany({
      where: { estado: "activa" },
      select: { id: true, titulo: true, rit: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.minutaAccion.count({
      where: {
        estado: { in: [...ACCIONES_ABIERTAS] },
        minuta: minutaConfidentialWhere(user.role),
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            Continuidad del estudio
          </p>
          <h1 className="display mt-2 text-4xl">Minutas</h1>
          <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
            Traspaso tras audiencias, reuniones y llamadas. Cualquier abogado
            puede retomar la tramitación con el resumen y los próximos pasos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link className="btn btn-secondary" href="/agente?utility=draft">
            Borrador con IA
          </Link>
          <div className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm">
            <div className="text-[var(--ink-soft)]/65">Acciones abiertas</div>
            <div className="display text-3xl">{pendientes}</div>
          </div>
        </div>
      </div>

      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Registrar ahora</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
          Elija la causa y genere la minuta en cuatro pasos.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {causas.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 transition hover:border-[var(--sea)]/40"
            >
              <Link href={`/causas/${c.id}/minuta/nueva`} className="block">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardPen size={14} className="text-[var(--copper)]" />
                  {c.rit || "Sin RIT"}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-[var(--ink-soft)]/70">
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
          <p className="mt-4 text-sm text-[var(--ink-soft)]/65">
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

      <section className="panel overflow-hidden rounded-3xl">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-lg font-semibold">Recientes</h2>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {minutas.map((m) => (
            <Link
              key={m.id}
              href={`/causas/${m.causaId}/minutas/${m.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-white/50"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-sea">
                    {labelTipoMinuta(m.tipo)}
                  </span>
                  <span className="font-medium">{m.titulo}</span>
                </div>
                <div className="mt-1 text-sm text-[var(--ink-soft)]/70">
                  {m.causa.rit || m.causa.titulo} ·{" "}
                  {m.autor?.name || "Sin autor"} · {formatDateTime(m.fecha)}
                </div>
              </div>
              <div className="text-right text-sm">
                {m.acciones.length > 0 ? (
                  <StatusBadge estado="pendiente" />
                ) : (
                  <StatusBadge estado="cumplido" />
                )}
                <div className="mt-1 text-xs text-[var(--ink-soft)]/60">
                  {m.acciones.length} acción(es) abierta(s)
                </div>
              </div>
            </Link>
          ))}
          {minutas.length === 0 && (
            <p className="px-5 py-8 text-sm text-[var(--ink-soft)]/65">
              Aún no hay minutas. Genere la primera tras una audiencia, reunión
              o llamada.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
