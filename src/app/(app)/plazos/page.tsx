import { prisma } from "@/lib/db";
import { StatusBadge, formatDate } from "@/components/ui";
import Link from "next/link";
import { PlazoGoogleButton } from "@/components/PlazoGoogleButton";

export default async function PlazosPage() {
  const plazos = await prisma.plazo.findMany({
    include: { causa: true, responsable: true },
    orderBy: { fechaLimite: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Gestión de términos
        </p>
        <h1 className="display mt-2 text-4xl">Plazos</h1>
        <p className="mt-2 text-[var(--ink-soft)]/80">
          Plazos procesales, audiencias e internos. Envíelos a Google Calendar con un clic.
        </p>
      </div>

      <div className="space-y-3">
        {plazos.map((p) => (
          <div
            key={p.id}
            className="panel flex flex-wrap items-center justify-between gap-4 rounded-3xl px-5 py-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{p.titulo}</h2>
                <StatusBadge estado={p.estado} />
                <span className="badge badge-ink">{p.tipo}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
                {formatDate(p.fechaLimite)} ·{" "}
                {p.causa ? (
                  <Link href={`/causas/${p.causa.id}`} className="text-[var(--sea)]">
                    {p.causa.rit || p.causa.titulo}
                  </Link>
                ) : (
                  "Sin causa"
                )}{" "}
                · {p.responsable?.name || "Sin responsable"}
              </p>
              {p.descripcion && (
                <p className="mt-2 text-sm text-[var(--ink-soft)]/80">{p.descripcion}</p>
              )}
            </div>
            <PlazoGoogleButton plazoId={p.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
