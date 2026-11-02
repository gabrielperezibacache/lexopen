import { z } from "zod";

export const BOOK_SOURCE_TYPES = ["book", "judgment", "ruling"] as const;
export const bookSourceTypeSchema = z.enum(BOOK_SOURCE_TYPES);
export type BookSourceType = z.infer<typeof bookSourceTypeSchema>;
export const JUDICIAL_JSON_MAX_BYTES = 16 * 1024;

/** A civil date is deliberately kept as text, without a timezone conversion. */
export function validDecisionDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
const optionalText = (max: number) => z.string().trim().max(max).default("");
const officialUrl = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return !/[\u0000-\u001f\u007f]/.test(value) && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, "Indique una URL HTTP o HTTPS sin credenciales").default("");

/** Manual descriptive metadata; validation does not contact a court or establish authenticity. */
export const judicialMetadataSchema = z.object({
  court: z.string().trim().min(1).max(240),
  chamber: optionalText(160),
  caseNumber: z.string().trim().min(1).max(120),
  rit: optionalText(120),
  ruc: optionalText(120),
  decisionDate: z.string().refine(validDecisionDate, "Indique una fecha civil válida en formato AAAA-MM-DD"),
  caseTitle: optionalText(300),
  matter: optionalText(160),
  jurisdiction: z.string().trim().min(1).max(80).default("CL"),
  officialUrl,
}).strict();
export const judicialMetadataPatchSchema = judicialMetadataSchema.partial();
export type JudicialMetadata = z.infer<typeof judicialMetadataSchema>;

export function normalizeJudicialMetadata(sourceType: BookSourceType, value: unknown): JudicialMetadata | null {
  if (sourceType === "book") {
    if (value !== undefined && value !== null) z.object({}).strict().parse(value);
    return null;
  }
  return judicialMetadataSchema.parse(value);
}

/** No remote requests are made, including for officialUrl. */
export function parseStoredJudicialSource(row: { sourceType?: string; judicialJson?: string }): { sourceType: BookSourceType; judicial: JudicialMetadata | null } {
  const sourceType = bookSourceTypeSchema.parse(row.sourceType ?? "book");
  return { sourceType, judicial: sourceType === "book" ? null : normalizeJudicialMetadata(sourceType, JSON.parse(row.judicialJson || "{}")) };
}
