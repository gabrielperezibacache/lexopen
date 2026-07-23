import { prisma } from "@/lib/db";
import { formatDate, StatusBadge } from "@/components/ui";
import Link from "next/link";

export default async function PortalPage() {
  const causas = await prisma.causa.findMany({
    where: { estado: "activa" },
    include: {
      cliente: true,
      plazos: {
        where: { estado: { in: ["pendiente", "vencido"] } },
        orderBy: { fechaLimite: "asc" },
        take: 2,
      },
      documentos: { take: 3, orderBy: { updatedAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Experiencia cliente
        </p>
        <h1 className="display mt-2 text-4xl">Portal del cliente</h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
          Vista simplificada al estilo HighQ Client Portal: estado de causas, plazos visibles y
          documentos compartidos.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {causas.map((c) => (
          <article key={c.id} className="panel rounded-3xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--ink-soft)]/55">
                  {c.cliente?.razonSocial || "Cliente"}
                </div>
                <h2 className="mt-1 text-xl font-semibold">{c.titulo}</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
                  {c.rit || "Sin RIT"} · {c.tribunal}
                </p>
              </div>
              <StatusBadge estado={c.estado} />
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold">Próximos hitos</h3>
              <ul className="mt-2 space-y-2">
                {c.plazos.map((p) => (
                  <li key={p.id} className="text-sm text-[var(--ink-soft)]/80">
                    {formatDate(p.fechaLimite)} — {p.titulo}
                  </li>
                ))}
                {c.plazos.length === 0 && (
                  <li className="text-sm text-[var(--ink-soft)]/60">Sin hitos próximos.</li>
                )}
              </ul>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold">Documentos compartidos</h3>
              <ul className="mt-2 space-y-1">
                {c.documentos.map((d) => (
                  <li key={d.id} className="text-sm text-[var(--ink-soft)]/80">
                    {d.nombre}
                  </li>
                ))}
              </ul>
            </div>

            <Link href={`/causas/${c.id}`} className="mt-5 inline-flex text-sm text-[var(--sea)]">
              Ver detalle interno →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
