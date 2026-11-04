import { z } from "zod";
export const bibliographyAuthorSchema = z.object({ family: z.string().trim().max(200).default(""), given: z.string().trim().max(200).default(""), name: z.string().trim().max(300).default("") }).strict().refine(value => Boolean(value.family || value.name), "Indique el nombre del autor");
export const bibliographyMetadataSchema = z.object({ title: z.string().trim().min(1).max(1000), authors: z.array(bibliographyAuthorSchema).max(50).default([]), year: z.number().int().min(1000).max(2200).nullable().default(null), containerTitle: z.string().trim().max(500).default(""), volume: z.string().trim().max(100).default(""), issue: z.string().trim().max(100).default(""), pages: z.string().trim().max(100).default(""), publisher: z.string().trim().max(300).default(""), doi: z.string().trim().max(300).default("").refine(value => { if (!value) return true; try { normalizeDoi(value); return true; } catch { return false; } }, "DOI inválido"), openalexId: z.string().max(30).default("").refine(value => !value || /^W[1-9]\d{0,19}$/.test(value), "Identificador OpenAlex inválido"), type: z.enum(["article", "book", "chapter", "other"]).default("article"), warnings: z.array(z.string().max(300)).max(12).default([]) }).strict();
export type BibliographyMetadata = z.infer<typeof bibliographyMetadataSchema>;
export const BIBLIOGRAPHY_STYLES = ["apa", "ieee", "vancouver", "chicago", "mla", "bibtex", "ris"] as const;
export const bibliographyStyleSchema = z.enum(BIBLIOGRAPHY_STYLES);
export type BibliographyStyle = z.infer<typeof bibliographyStyleSchema>;
export type DiscoveryProvider = "crossref" | "openalex";
export type AcademicPaper = { key: string; metadata: BibliographyMetadata; provider: DiscoveryProvider; sourceUrl: string; otherSourceUrls?: string[]; landingUrl: string; checkedAt: string; openAccess: boolean | null; citedByCount: number | null };
export function normalizeDoi(raw: string) {
  const doi = raw.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi\s*:\s*/i, "").toLowerCase();
  if (!/^10\.\d{4,9}\/[^\s\x00-\x1f<>"{}]{1,260}$/i.test(doi) || doi.length > 300 || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(doi)) throw new Error("DOI inválido");
  return doi;
}
export function doiHref(doi: string) { return `https://doi.org/${normalizeDoi(doi).split("/").map(encodeURIComponent).join("/")}`; }
export function openalexId(raw: string) { const id = raw.replace(/^https:\/\/openalex\.org\//, ""); if (!/^W[1-9]\d{0,19}$/.test(id)) throw new Error("Identificador OpenAlex inválido"); return id; }
export function normalizeOrcid(raw: string) {
  const id = raw.trim().replace(/^https:\/\/orcid\.org\//, "").toUpperCase();
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id)) throw new Error("ORCID inválido");
  const value = id.replaceAll("-", ""); let total = 0;
  for (const digit of value.slice(0, 15)) total = (total + Number(digit)) * 2;
  const check = (12 - total % 11) % 11;
  if (value[15] !== (check === 10 ? "X" : String(check))) throw new Error("El dígito de control ORCID no coincide");
  return id;
}
export function missingBibliographyFields(metadata: BibliographyMetadata) {
  const missing = []; if (!metadata.authors.length) missing.push("autores"); if (!metadata.year) missing.push("año");
  if (metadata.type === "article" && !metadata.containerTitle) missing.push("revista");
  if (metadata.type === "book" && !metadata.publisher) missing.push("editorial");
  if (!metadata.doi && !metadata.openalexId) missing.push("identificador persistente");
  return missing;
}
