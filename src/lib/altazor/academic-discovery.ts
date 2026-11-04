import { z } from "zod";
import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { canonicalJson } from "@/lib/command-execution";
import { altazorActor, altazorTransaction } from "./access";
import { academicCitationGraph, lookupOrcid, searchAcademicProvider, type AcademicTransport } from "./academic-discovery-providers";
import { altazorRequestId } from "./schemas";
import type { AcademicPaper } from "./bibliography-types";

export const academicDiscoveryQuery = z.object({ query: z.string().trim().min(3).max(250), providers: z.array(z.enum(["crossref", "openalex"])).min(1).max(2).default(["crossref", "openalex"]), allowExternal: z.boolean().default(false) }).strict().refine(input => new Set(input.providers).size === input.providers.length, "No repita las fuentes");
export const saveAcademicSearchSchema = z.object({ requestId: altazorRequestId, name: z.string().trim().min(1).max(160), query: z.string().trim().min(3).max(250), providers: z.array(z.enum(["crossref", "openalex"])).min(1).max(2) }).strict().refine(input => new Set(input.providers).size === input.providers.length, "No repita las fuentes");
export const refreshAcademicSearchSchema = z.object({ expectedRevision: z.number().int().positive(), allowExternal: z.boolean().default(false) }).strict();
export const patchAcademicSearchSchema = z.object({ expectedRevision: z.number().int().positive(), action: z.enum(["acknowledge", "pause", "resume", "delete"]) }).strict();
export const academicGraphSchema = z.object({ openalexId: z.string().max(100), allowExternal: z.boolean().default(false) }).strict();
export const academicOrcidSchema = z.object({ orcid: z.string().max(100), allowExternal: z.boolean().default(false) }).strict();
type Options = { fetch?: AcademicTransport; signal?: AbortSignal };
export function requireAcademicOutbound(allowed: boolean) { if (!allowed) throw httpError("Autorice enviar estos términos o identificadores a las fuentes públicas seleccionadas", 403); }
export async function searchAcademicDiscovery(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma, options: Options = {}) {
  const input = academicDiscoveryQuery.parse(raw); await altazorActor(user, client); requireAcademicOutbound(input.allowExternal);
  const results: AcademicPaper[] = [], warnings: string[] = [], providers: string[] = [];
  for (const provider of input.providers) {
    options.signal?.throwIfAborted();
    try {
      const found = await searchAcademicProvider(provider, input.query, options); providers.push(provider);
      for (const paper of found) {
        const existing = results.find(item => item.key === paper.key);
        if (!existing) results.push(paper);
        else { if (paper.metadata.openalexId && !existing.metadata.openalexId) existing.metadata.openalexId = paper.metadata.openalexId; existing.otherSourceUrls = [...(existing.otherSourceUrls || []), paper.sourceUrl]; if (existing.openAccess === null) existing.openAccess = paper.openAccess; }
      }
    }
    catch (error) { if (options.signal?.aborted) throw error; warnings.push(`${provider === "crossref" ? "Crossref" : "OpenAlex"} no respondió o alcanzó su límite. La consulta no cubre esa fuente.`); }
  }
  if (!providers.length) throw httpError("Las fuentes seleccionadas no pudieron consultarse. No se sustituyeron por ejemplos", 502);
  await altazorActor(user, client);
  return { query: input.query, providers, results, warnings, checkedAt: new Date().toISOString(), limited: true, coverage: "Primera ventana: hasta diez obras por fuente. Metadatos bibliográficos; no se descargan ni se verifican los textos completos." };
}
export async function readAcademicGraph(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma, options: Options = {}) { const input = academicGraphSchema.parse(raw); await altazorActor(user, client); requireAcademicOutbound(input.allowExternal); const result = await academicCitationGraph(input.openalexId, options); await altazorActor(user, client); return result; }
export async function readAcademicOrcid(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma, options: Options = {}) { const input = academicOrcidSchema.parse(raw); await altazorActor(user, client); requireAcademicOutbound(input.allowExternal); const result = await lookupOrcid(input.orcid, options); await altazorActor(user, client); return result; }
function searchView(row: { id: string; name: string; query: string; providersJson: string; status: string; revision: number; resultsJson: string; newKeysJson: string; checkedAt: Date | null; errorCode: string | null }) {
  const stored = JSON.parse(row.resultsJson); return { id: row.id, name: row.name, query: row.query, providers: JSON.parse(row.providersJson) as string[], status: row.status, revision: row.revision, results: (Array.isArray(stored) ? stored : stored.results) as AcademicPaper[], warnings: Array.isArray(stored) ? [] : stored.warnings as string[], newKeys: JSON.parse(row.newKeysJson) as string[], checkedAt: row.checkedAt?.toISOString() || null, errorCode: row.errorCode, refreshMode: "manual" as const, feedHref: `/api/altazor/academic/discovery/saved/${row.id}/feed` };
}
export async function listAcademicSearches(user: CausaAccessUser, client: PrismaClient = prisma) { const actor = await altazorActor(user, client); return { searches: (await client.altazorAcademicSearch.findMany({ where: { ownerId: actor.id }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 50 })).map(searchView), notice: "Alertas al actualizar manualmente. No hay sondeo programado ni envío de correos. El RSS usa la última consulta guardada y requiere sesión." }; }
export async function saveAcademicSearch(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = saveAcademicSearchSchema.parse(raw);
  return altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx), existing = await tx.altazorAcademicSearch.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId: input.requestId } } });
    if (existing) { if (existing.name !== input.name || existing.query !== input.query || existing.providersJson !== canonicalJson(input.providers)) throw httpError("La clave ya corresponde a otra búsqueda", 409); return { search: searchView(existing), reused: true }; }
    if (await tx.altazorAcademicSearch.count({ where: { ownerId: actor.id } }) >= 50) throw httpError("Puede guardar hasta cincuenta búsquedas temáticas", 413);
    return { search: searchView(await tx.altazorAcademicSearch.create({ data: { ownerId: actor.id, requestId: input.requestId, name: input.name, query: input.query, providersJson: canonicalJson(input.providers) } })), reused: false };
  });
}
export async function refreshAcademicSearch(id: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma, options: Options = {}) {
  const input = refreshAcademicSearchSchema.parse(raw), actor = await altazorActor(user, client), saved = await client.altazorAcademicSearch.findFirst({ where: { id, ownerId: actor.id } });
  if (!saved) throw httpError("Búsqueda no encontrada", 404);
  if (saved.status !== "active" || saved.revision !== input.expectedRevision) throw httpError("La búsqueda cambió o está pausada. Vuelva a cargarla", 409);
  requireAcademicOutbound(input.allowExternal);
  let result: Awaited<ReturnType<typeof searchAcademicDiscovery>>;
  try { result = await searchAcademicDiscovery({ query: saved.query, providers: JSON.parse(saved.providersJson), allowExternal: true }, actor, client, options); }
  catch (error) { await client.altazorAcademicSearch.updateMany({ where: { id, ownerId: actor.id, revision: input.expectedRevision }, data: { errorCode: "sources_unavailable" } }); throw error; }
  return altazorTransaction(client, async tx => {
    await altazorActor(actor, tx); const current = await tx.altazorAcademicSearch.findFirst({ where: { id, ownerId: actor.id, revision: input.expectedRevision, status: "active" } }); if (!current) throw httpError("La búsqueda cambió durante la consulta", 409);
    const keys = result.results.map(paper => paper.key), seen = JSON.parse(current.seenKeysJson) as string[], fresh = current.checkedAt ? keys.filter(key => !seen.includes(key)) : [];
    await tx.altazorAcademicSearch.update({ where: { id }, data: { resultsJson: canonicalJson({ results: result.results, warnings: result.warnings }), newKeysJson: canonicalJson(fresh), seenKeysJson: current.checkedAt ? current.seenKeysJson : canonicalJson(keys), checkedAt: new Date(result.checkedAt), errorCode: null, revision: { increment: 1 } } });
    return { search: searchView(await tx.altazorAcademicSearch.findUniqueOrThrow({ where: { id } })) };
  });
}
export async function patchAcademicSearch(id: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = patchAcademicSearchSchema.parse(raw);
  return altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx), saved = await tx.altazorAcademicSearch.findFirst({ where: { id, ownerId: actor.id, revision: input.expectedRevision } }); if (!saved) throw httpError("La búsqueda cambió o ya no está disponible", 409);
    if (input.action === "delete") { await tx.altazorAcademicSearch.delete({ where: { id } }); return { deleted: true }; }
    const keys = input.action === "acknowledge" ? [...new Set([...(JSON.parse(saved.seenKeysJson) as string[]), ...(JSON.parse(saved.newKeysJson) as string[])])].slice(-500) : null;
    const result = await tx.altazorAcademicSearch.update({ where: { id }, data: { revision: { increment: 1 }, ...(keys ? { seenKeysJson: canonicalJson(keys), newKeysJson: "[]" } : { status: input.action === "pause" ? "paused" : "active" }) } });
    return { search: searchView(result) };
  });
}
const xml = (value: string) => value.replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);
export async function academicSearchFeed(id: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const actor = await altazorActor(user, client), row = await client.altazorAcademicSearch.findFirst({ where: { id, ownerId: actor.id } }); if (!row) throw httpError("Búsqueda no encontrada", 404);
  const saved = searchView(row), items = saved.results.filter(paper => saved.newKeys.includes(paper.key));
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(saved.name)}</title><description>Resultados nuevos desde la última actualización manual de esta búsqueda privada.</description>${saved.checkedAt ? `<lastBuildDate>${new Date(saved.checkedAt).toUTCString()}</lastBuildDate>` : ""}${items.map(paper => `<item><guid isPermaLink="false">${xml(paper.key)}</guid><title>${xml(paper.metadata.title)}</title><link>${xml(paper.landingUrl)}</link><description>${xml([paper.metadata.authors.map(author => author.name || [author.given, author.family].filter(Boolean).join(" ")).join("; "), paper.metadata.year || "Año no informado", "Metadatos; texto completo no cotejado"].join(" · "))}</description></item>`).join("")}</channel></rss>`;
}
