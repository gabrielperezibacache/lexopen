import { prisma } from "@/lib/db";
import { formatDate } from "@/components/ui";
import { labelMateria, MATERIAS } from "@/lib/chile";
import { JurisprudenciaSearch } from "@/components/JurisprudenciaSearch";
import { requireStaff } from "@/lib/auth/session";
import { PageHeader } from "@/components/sites/SiteNav";

export default async function JurisprudenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; materia?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const q = (sp.q || "").trim().toLowerCase();
  const materia = sp.materia;

  const all = await prisma.jurisprudencia.findMany({
    orderBy: { fecha: "desc" },
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
  const items = all.filter((j) => {
    if (materia && j.materia !== materia) return false;
    if (!q) return true;
    const hay = [j.rol, j.tribunal, j.caratula, j.descripcion, j.doctrina, j.tags, j.materia]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base doctrinal"
        title="Jurisprudencia"
        subtitle="Consulte roles de Corte Suprema, Cortes de Apelaciones y Tribunal Constitucional. Corpus demo incluido; conecte su fuente oficial o scraper en producción."
      />

      <JurisprudenciaSearch materias={[...MATERIAS]} />

      <div className="space-y-4">
        {items.map((j) => (
          <article key={j.id} className="panel rounded-3xl p-5">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--copper)]">
                  {j.fuente} · {j.rol}
                </div>
                <h2 className="mt-1 break-words text-xl font-semibold">
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
          <div className="panel rounded-3xl p-8 text-center text-[var(--ink-soft)]/70">
            Sin resultados para esa búsqueda.
          </div>
        )}
      </div>
    </div>
  );
}
