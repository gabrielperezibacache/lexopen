import { prisma } from "@/lib/db";
import { formatDate } from "@/components/ui";
import { labelMateria, MATERIAS } from "@/lib/chile";
import { JurisprudenciaSearch } from "@/components/JurisprudenciaSearch";

export default async function JurisprudenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; materia?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || "").trim().toLowerCase();
  const materia = sp.materia;

  const all = await prisma.jurisprudencia.findMany({ orderBy: { fecha: "desc" } });
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
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Base doctrinal
        </p>
        <h1 className="display mt-2 text-4xl">Jurisprudencia</h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
          Consulte roles de Corte Suprema, Cortes de Apelaciones y Tribunal Constitucional.
          Corpus demo incluido; conecte su fuente oficial o scraper en producción.
        </p>
      </div>

      <JurisprudenciaSearch materias={[...MATERIAS]} />

      <div className="space-y-4">
        {items.map((j) => (
          <article key={j.id} className="panel rounded-3xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--copper)]">
                  {j.fuente} · {j.rol}
                </div>
                <h2 className="mt-1 text-xl font-semibold">
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
