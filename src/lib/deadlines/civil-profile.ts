import { createHash } from "node:crypto";
import { addCivilDays, isValidYmd, santiagoDateKey } from "@/lib/chile-time";
import { parseDateInput } from "@/lib/date-input";
import { MAX_DIAS_PLAZO } from "@/lib/plazos";
import { httpError } from "@/lib/auth/access";

// A published review belongs to precisely this edition, calendar and reference set.
export const civilEdition = {
  id: "cl_cpc_individual_days_v1",
  zone: "America/Santiago",
  rules: { firstDay: "day-after-effective-notice", skip: "sundays-and-listed-holidays", saturday: "counts-unless-holiday" },
  coverage: { from: "2026-11-01", through: "2027-02-28" },
  holidays: ["2026-11-01", "2026-12-08", "2026-12-25", "2027-01-01"],
  sources: [
    { articles: "CPC 59, 64, 65 y 66, con la modificación de la Ley 20.774", url: "https://www.bcn.cl/leychile/navegar?idNorma=22740" },
    { articles: "Ley 2.977, feriados y modificaciones aplicables", url: "https://www.bcn.cl/leychile/navegar?idNorma=23639" },
    { articles: "Código Civil 48 y 49", url: "https://www.bcn.cl/leychile/navegar?idNorma=172986" },
  ],
  cases: [
    { id: "sabado", notice: "2026-11-06", days: 1 },
    { id: "domingo", notice: "2026-11-06", days: 2 },
    { id: "inmaculada", notice: "2026-12-04", days: 3 },
    { id: "navidad", notice: "2026-12-23", days: 2 },
    { id: "antes-medianoche", notice: "2026-11-07T02:59:59Z", days: 1 },
    { id: "medianoche", notice: "2026-11-07T03:00:00Z", days: 1 },
    { id: "febrero", notice: "2027-01-29", days: 3 },
  ],
} as const;

export const civilEditionHash = createHash("sha256").update(JSON.stringify(civilEdition)).digest("hex");

export type CivilReview = {
  reviewer: string;
  reviewedOn: string;
  editionHash: string;
  legalBasis: string;
  sourceVersions: Record<string, string>;
  effectiveFrom: string;
  effectiveThrough: string;
  cases: Record<string, { due: string; basis: string }>;
};

// Activation requires a versioned professional review with independent reference dates.
export const publishedCivilReview: CivilReview | null = null;

function notificationDay(value: string) {
  if (isValidYmd(value)) return value;
  const instant = parseDateInput(value);
  if (instant && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return santiagoDateKey(instant);
  throw httpError("Indique la fecha efectiva de notificación o un instante con zona horaria.", 422);
}

function countDays(notice: string, days: number) {
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_DIAS_PLAZO)
    throw httpError("Revise la duración del término en días.", 422);
  const start = notificationDay(notice);
  if (start < civilEdition.coverage.from || start > civilEdition.coverage.through)
    throw httpError("La notificación queda fuera del calendario cubierto. Registre una fecha manual.", 422);
  let date = start;
  const holidays = new Set<string>(civilEdition.holidays);
  for (let remaining = days; remaining > 0;) {
    date = addCivilDays(date, 1);
    if (date > civilEdition.coverage.through)
      throw httpError("El vencimiento supera el calendario cubierto. Registre una fecha manual.", 422);
    if (new Date(date).getUTCDay() !== 0 && !holidays.has(date)) remaining--;
  }
  return { start, date };
}

export function civilReviewReady(review: CivilReview | null = publishedCivilReview): review is CivilReview {
  if (!review || review.editionHash !== civilEditionHash || !review.reviewer.trim() ||
      !isValidYmd(review.reviewedOn) || !review.legalBasis.trim() ||
      !isValidYmd(review.effectiveFrom) || !isValidYmd(review.effectiveThrough) ||
      review.effectiveFrom > civilEdition.coverage.from || review.effectiveThrough < civilEdition.coverage.through)
    return false;
  if (!civilEdition.sources.every(source => isValidYmd(review.sourceVersions[source.url] || "") && review.sourceVersions[source.url] <= review.reviewedOn))
    return false;
  return civilEdition.cases.every(c => {
    const reference = review.cases[c.id];
    return reference?.basis.trim() && reference.due === countDays(c.notice, c.days).date;
  });
}

export function calculateCivilDeadline(input: {
  notice?: string | null; days?: number | null; scopeConfirmed?: boolean; notificationConfirmed?: boolean;
}, review: CivilReview | null = publishedCivilReview) {
  if (!civilReviewReady(review))
    throw httpError("El perfil civil está pendiente de validación profesional. Registre una fecha manual.", 422);
  if (!input.scopeConfirmed || !input.notificationConfirmed || !input.days || !input.notice)
    throw httpError("Confirme el ámbito, la notificación efectiva y los días o registre una fecha manual.", 422);
  const { start, date } = countDays(input.notice, input.days);
  return {
    date,
    basis: {
      profile: civilEdition.id, editionHash: civilEditionHash, timezone: civilEdition.zone,
      scopeConfirmed: true, notificationConfirmed: true, originalNotice: input.notice,
      start, days: input.days, due: date, review,
      sources: civilEdition.sources.map(source => ({ ...source, url: source.url + "&idVersion=" + review.sourceVersions[source.url] })),
    },
  };
}
