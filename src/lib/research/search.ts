import { z } from "zod";

export const RESEARCH_SOURCE_KINDS = ["legislation", "jurisprudence", "administrative", "doctrine"] as const;
export type ResearchSourceKind = typeof RESEARCH_SOURCE_KINDS[number];
export const RESEARCH_LIMITS = { documents: 200, legalSources: 200, candidatesPerKind: 200, results: 20, queryTerms: 16 } as const;

const STOP_WORDS = new Set([
  "a", "al", "ante", "bajo", "con", "cual", "cuales", "cuando", "de", "del", "desde", "donde", "el", "ella", "ellos", "en", "entre", "es", "esa", "ese", "esta", "este", "estos", "ha", "hay", "la", "las", "lo", "los", "o", "para", "por", "que", "se", "segun", "sin", "sobre", "son", "su", "sus", "un", "una", "unos", "unas", "y",
]);

export function normalizeResearchText(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function researchTerms(query: string) {
  const terms = [...new Set((normalizeResearchText(query).match(/[\p{L}\p{N}]+/gu) || []).filter(term => !STOP_WORDS.has(term) && (term.length > 1 || /^\d$/.test(term))))];
  if (!terms.length) throw Object.assign(new Error("Incluya palabras concretas para buscar en las fuentes"), { status: 400 });
  if (terms.length > RESEARCH_LIMITS.queryTerms) throw Object.assign(new Error(`Use hasta ${RESEARCH_LIMITS.queryTerms} términos relevantes por búsqueda`), { status: 400 });
  return terms;
}

export const researchQuerySchema = z.object({
  query: z.string().trim().min(3).max(1000),
  causaId: z.string().min(1).max(100).optional(),
  documentIds: z.array(z.string().min(1).max(100)).max(RESEARCH_LIMITS.documents).optional(),
  siteId: z.string().min(1).max(100).optional(),
  siteFileIds: z.array(z.string().min(1).max(100)).max(RESEARCH_LIMITS.documents).optional(),
  sourceKinds: z.array(z.enum(RESEARCH_SOURCE_KINDS)).max(4).optional(),
  limit: z.number().int().min(1).max(RESEARCH_LIMITS.results).optional(),
}).strict().refine(input => input.siteFileIds === undefined || Boolean(input.siteId), { message: "Seleccione el espacio de los archivos", path: ["siteId"] });
export type ResearchQuery = z.infer<typeof researchQuerySchema>;

/** Exact lexical retrieval only: never a legal conclusion or semantic confidence. */
export function rankResearchText(text: string, title: string, terms: string[]) {
  const body = normalizeResearchText(text), heading = normalizeResearchText(title);
  const matchedTerms = terms.filter(term => body.includes(term) || heading.includes(term));
  const bodyMatches = terms.filter(term => body.includes(term)).length;
  const titleMatches = terms.filter(term => heading.includes(term)).length;
  return { matchedTerms, score: bodyMatches * 10 + titleMatches * 3 };
}
