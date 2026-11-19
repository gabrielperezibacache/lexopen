import { z } from "zod";
import { formatCivilDate } from "@/lib/chile-time";

const savedBasis = z.object({
  profile: z.string(), start: z.string(), due: z.string(), days: z.number(),
  review: z.object({
    reviewer: z.string(), reviewedOn: z.string(), legalBasis: z.string(),
    effectiveFrom: z.string(), effectiveThrough: z.string(),
  }),
  sources: z.array(z.object({ articles: z.string(), url: z.string().url() })),
});

/** Read the stored edition even when the current rule or the deadline has changed. */
export function CivilDeadlineDetails({ value, currentRegime }: { value: unknown; currentRegime: string | null }) {
  const result = savedBasis.safeParse(value);
  if (!result.success) return <p className="text-xs">El fundamento guardado requiere revisión.</p>;
  const basis = result.data;
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer font-medium">Fundamento del cálculo civil original</summary>
      <div className="mt-2 space-y-1">
        {currentRegime !== basis.profile && <p>La fecha vigente fue revisada manualmente.</p>}
        <p>Notificación efectiva del {formatCivilDate(basis.start)}. Término individual de {basis.days} días. Vencimiento original del {formatCivilDate(basis.due)}.</p>
        <p>{basis.profile} · Revisión de {basis.review.reviewer} del {formatCivilDate(basis.review.reviewedOn)}.</p>
        <p>Vigencia revisada del {formatCivilDate(basis.review.effectiveFrom)} al {formatCivilDate(basis.review.effectiveThrough)}. {basis.review.legalBasis}</p>
        <ul className="list-inside list-disc">{basis.sources.map(source => (
          <li key={source.url}>{source.url.startsWith("https://www.bcn.cl/") ? <a href={source.url}>{source.articles}</a> : source.articles}</li>
        ))}</ul>
      </div>
    </details>
  );
}
