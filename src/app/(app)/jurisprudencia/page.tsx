import { prisma } from "@/lib/db";
import { formatDate } from "@/components/ui";
import { labelMateria, MATERIAS } from "@/lib/chile";
import { JurisprudenciaSearch } from "@/components/JurisprudenciaSearch";
import { JurisprudenciaIngestForm } from "@/components/JurisprudenciaIngestForm";
import { requireStaff } from "@/lib/auth/session";
import { PageHeader } from "@/components/sites/SiteNav";
import { EmptyState } from "@/components/EmptyState";
import type { Prisma } from "@prisma/client";
import { isAdmin } from "@/lib/auth/rbac";

const LIST_TAKE = 80;

export default async function JurisprudenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; materia?: string }>;
}) {
  const user = await requireStaff();
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const materia = sp.materia;

  const where: Prisma.JurisprudenciaWhereInput = {
    AND: [
      materia ? { materia } : {},
      q
        ? {
            OR: [
              { rol: { contains: q, mode: "insensitive" } },
              { tribunal: { contains: q, mode: "insensitive" } },
              { caratula: { contains: q, mode: "insensitive" } },
              { descripcion: { contains: q, mode: "insensitive" } },
              { doctrina: { contains: q, mode: "insensitive" } },
              { tags: { contains: q, mode: "insensitive" } },
              { materia: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const items = await prisma.jurisprudencia.findMany({
    where,
    orderBy: { fecha: "desc" },
    take: LIST_TAKE,
    select: {
      id: true,
      rol: true,
      tribunal: true,
      sala: true,
      caratula: true,
      descripcion: true,
      doctrina: true,
      materia: true,
      tags: true,
      fuente: true,
      fecha: true,
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base doctrinal"
        title="Jurisprudencia"
        subtitle="Corpus local (seed demo o importado). No es el repositorio oficial del Poder Judicial."
      />

      <JurisprudenciaSearch materias={[...MATERIAS]} />
      {isAdmin(user.role) && <JurisprudenciaIngestForm />}

      {items.length > 0 ? (
        <p className="text-xs text-[var(--ink-soft)]/65">
          Mostrando hasta {LIST_TAKE} fallos recientes
          {q || materia ? " con estos filtros" : ""}.
        </p>
      ) : null}

      <div className="space-y-4">
        {items.map((j) => (
          <article key={j.id} className="panel rounded-3xl p-5">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--copper)]">
                  {j.fuente} · {j.rol}
                </div>
                <h2 className="mt-1 break-words text-lg font-semibold">
                  {j.caratula || "Sin carátula"}
                </h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
                  {j.tribunal}
                  {j.sala ? ` · ${j.sala}` : ""} · {formatDate(j.fecha)} ·{" "}
                  {j.materia ? labelMateria(j.materia) : "—"}
                </p>
              </div>
              <span className="badge badge-sea">{j.materia || "general"}</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed">{j.descripcion}</p>
            {j.doctrina && (
              <blockquote className="mt-4 border-l-2 border-[var(--copper)] pl-4 text-sm italic text-[var(--ink-soft)]/90">
                {j.doctrina}
              </blockquote>
            )}
          </article>
        ))}
        {items.length === 0 && (
          <EmptyState
            title="Sin resultados en el corpus demo"
            description={
              q || materia
                ? "Pruebe otros filtros o limpie la búsqueda. Este listado no cubre toda la jurisprudencia oficial."
                : "Aún no hay fallos cargados. Use Incorporar (admin) o el seed de demostración."
              }
            actionLabel={q || materia ? "Limpiar filtros" : undefined}
            actionHref={q || materia ? "/jurisprudencia" : undefined}
          />
        )}
      </div>
    </div>
  );
}
