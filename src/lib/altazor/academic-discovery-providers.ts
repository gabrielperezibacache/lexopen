/** Public metadata only. No supplied URL, credential, document or redirect is followed. */
import { z } from "zod";
import { httpError } from "@/lib/auth/access";
import { bibliographyMetadataSchema, doiHref, normalizeDoi, normalizeOrcid, openalexId, type AcademicPaper, type BibliographyMetadata, type DiscoveryProvider } from "./bibliography-types";

const HOSTS = new Set(["api.crossref.org", "api.openalex.org", "pub.orcid.org"]), MAX_BYTES = 2 * 1024 * 1024;
const active = new Map<string, number>();
export type AcademicTransport = typeof fetch;
type FetchOptions = { fetch?: AcademicTransport; signal?: AbortSignal };
function clean(value: unknown, max = 1000): string { return typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/[\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""; }
const object = z.record(z.string(), z.unknown());
function row(value: unknown) { return object.parse(value); }
function first(value: unknown) { return Array.isArray(value) ? clean(value[0]) : clean(value); }
function doi(value: unknown) { try { return normalizeDoi(clean(value, 300)); } catch { return ""; } }
function year(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 2200 ? parsed : null; }
function counter(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
export async function academicMetadataJson(url: URL, options: FetchOptions = {}): Promise<unknown> {
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password || url.hash) throw httpError("Destino académico no permitido", 400);
  if ((active.get(url.hostname) || 0) >= 1) throw httpError("Ya hay una consulta a esta fuente. Espere su término antes de reintentar", 429);
  active.set(url.hostname, 1);
  try { return await fetchAcademicMetadataJson(url, options); } finally { active.delete(url.hostname); }
}
async function fetchAcademicMetadataJson(url: URL, options: FetchOptions = {}): Promise<unknown> {
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password || url.hash) throw httpError("Destino académico no permitido", 400);
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000); signal.throwIfAborted();
  let response: Response;
  try { response = await (options.fetch || fetch)(url, { method: "GET", redirect: "error", credentials: "omit", headers: { Accept: "application/json", "User-Agent": "LexOpen/1.1 (public scholarly metadata; manual user request)" }, signal, cache: "no-store" }); }
  catch { signal.throwIfAborted(); throw httpError("La fuente académica no respondió. Vuelva a intentarlo", 502); }
  if (!response.ok) throw httpError(response.status === 404 ? "Registro no encontrado en la fuente consultada" : response.status === 429 ? "La fuente alcanzó su límite de consultas. Inténtelo más tarde" : "La fuente académica no está disponible", response.status === 404 ? 404 : response.status === 429 ? 429 : 502);
  if (response.status >= 300 && response.status < 400 || response.redirected) throw httpError("La fuente intentó redirigir la consulta", 502);
  if (!response.headers.get("content-type")?.includes("json")) throw httpError("La fuente no devolvió metadatos JSON", 502);
  if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) { await response.body?.cancel(); throw httpError("La respuesta académica supera sus límites", 413); }
  const reader = response.body?.getReader(); if (!reader) throw httpError("La fuente devolvió una respuesta vacía", 502);
  const parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { signal.throwIfAborted(); const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > MAX_BYTES) { await reader.cancel(); throw httpError("La respuesta académica supera sus límites", 413); } parts.push(part.value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts, size))); } catch { throw httpError("Los metadatos de la fuente no son válidos", 502); }
}
function crossrefPaper(value: unknown): AcademicPaper | null {
  const input = row(value), identifier = doi(input.DOI), title = first(input.title); if (!identifier || !title) return null;
  const published = input.published || input["published-print"] || input["published-online"] || input.issued, dates = published && typeof published === "object" ? (published as Record<string, unknown>)["date-parts"] : undefined;
  const authors = Array.isArray(input.author) ? input.author.slice(0, 50).map(value => { const item = row(value); return { family: clean(item.family, 200), given: clean(item.given, 200), name: clean(item.name, 300) }; }).filter(author => author.family || author.name) : [];
  const metadata = bibliographyMetadataSchema.parse({ title, authors, year: year(Array.isArray(dates) && Array.isArray(dates[0]) ? dates[0][0] : null), containerTitle: first(input["container-title"]).slice(0, 500), volume: clean(input.volume, 100), issue: clean(input.issue, 100), pages: clean(input.page, 100), publisher: clean(input.publisher, 300), doi: identifier, type: input.type === "book" || input.type === "monograph" ? "book" : input.type === "book-chapter" ? "chapter" : "article", warnings: Array.isArray(input.author) && input.author.length > 50 ? ["La fuente enumera más de cincuenta autores; revise el registro completo."] : [] });
  return { key: `doi:${identifier}`, metadata, provider: "crossref", sourceUrl: `https://api.crossref.org/works/${encodeURIComponent(identifier)}`, landingUrl: doiHref(identifier), checkedAt: new Date().toISOString(), openAccess: null, citedByCount: counter(input["is-referenced-by-count"]) };
}
export function openalexPaper(value: unknown): AcademicPaper | null {
  const input = row(value); let id: string; try { id = openalexId(clean(input.id, 100)); } catch { return null; }
  const identifier = doi(input.doi), title = clean(input.display_name || input.title); if (!title) return null;
  const location = input.primary_location && typeof input.primary_location === "object" ? row(input.primary_location) : {}, source = location.source && typeof location.source === "object" ? row(location.source) : {}, biblio = input.biblio && typeof input.biblio === "object" ? row(input.biblio) : {}, oa = input.open_access && typeof input.open_access === "object" ? row(input.open_access) : {};
  const authors = Array.isArray(input.authorships) ? input.authorships.slice(0, 50).flatMap(value => { const item = row(value), author = item.author && typeof item.author === "object" ? row(item.author) : {}; const name = clean(author.display_name, 300); return name ? [{ name, family: "", given: "" }] : []; }) : [];
  const start = clean(biblio.first_page, 50), end = clean(biblio.last_page, 50);
  const metadata: BibliographyMetadata = bibliographyMetadataSchema.parse({ title, authors, year: year(input.publication_year), containerTitle: clean(source.display_name, 500), volume: clean(biblio.volume, 100), issue: clean(biblio.issue, 100), pages: start + (end && end !== start ? `-${end}` : ""), publisher: "", doi: identifier, openalexId: id, type: input.type === "book" ? "book" : input.type === "book-chapter" ? "chapter" : "article", warnings: ["OpenAlex entrega nombres completos; revise apellidos e iniciales antes de usar una cita formal.", ...(Array.isArray(input.authorships) && input.authorships.length > 50 ? ["Listado limitado a cincuenta autores."] : [])] });
  return { key: identifier ? `doi:${identifier}` : `openalex:${id}`, metadata, provider: "openalex", sourceUrl: `https://api.openalex.org/works/${id}`, landingUrl: identifier ? doiHref(identifier) : `https://openalex.org/${id}`, checkedAt: new Date().toISOString(), openAccess: typeof oa.is_oa === "boolean" ? oa.is_oa : null, citedByCount: counter(input.cited_by_count) };
}
const OA_SELECT = "id,doi,display_name,publication_year,authorships,primary_location,open_access,biblio,type,cited_by_count,referenced_works,related_works";
export async function searchAcademicProvider(provider: DiscoveryProvider, query: string, options: FetchOptions = {}) {
  const url = new URL(provider === "crossref" ? "https://api.crossref.org/works" : "https://api.openalex.org/works");
  url.searchParams.set(provider === "crossref" ? "query.bibliographic" : "search", query);
  url.searchParams.set(provider === "crossref" ? "rows" : "per_page", "10");
  if (provider === "openalex") url.searchParams.set("select", OA_SELECT);
  const data = row(await academicMetadataJson(url, options)), message = provider === "crossref" ? row(data.message) : data, raw = provider === "crossref" ? message.items : data.results;
  if (!Array.isArray(raw)) throw httpError("La fuente devolvió un formato desconocido", 502);
  const results = raw.slice(0, 10).flatMap(value => { const parsed = provider === "crossref" ? crossrefPaper(value) : openalexPaper(value); return parsed ? [parsed] : []; });
  return results;
}
export async function lookupAcademicPaper(input: { provider: DiscoveryProvider; identifier: string }, options: FetchOptions = {}) {
  let url: URL; try { url = new URL(input.provider === "crossref" ? `https://api.crossref.org/works/${encodeURIComponent(normalizeDoi(input.identifier))}` : `https://api.openalex.org/works/${openalexId(input.identifier)}`); } catch { throw httpError("Identificador académico inválido", 400); }
  const data = row(await academicMetadataJson(url, options)), parsed = input.provider === "crossref" ? crossrefPaper(data.message) : openalexPaper(data);
  if (!parsed) throw httpError("El registro no tiene título o identificador verificable", 422); return parsed;
}
export async function lookupOrcid(raw: string, options: FetchOptions = {}) {
  let id: string; try { id = normalizeOrcid(raw); } catch { throw httpError("ORCID inválido. Revise su dígito de control", 400); }
  const data = row(await academicMetadataJson(new URL(`https://pub.orcid.org/v3.0/${id}/person`), options)), name = data.name && typeof data.name === "object" ? row(data.name) : {}, given = name["given-names"] && typeof name["given-names"] === "object" ? row(name["given-names"]).value : "", family = name["family-name"] && typeof name["family-name"] === "object" ? row(name["family-name"]).value : "";
  return { id, name: [clean(given, 200), clean(family, 200)].filter(Boolean).join(" ") || "Nombre no público", href: `https://orcid.org/${id}`, checkedAt: new Date().toISOString(), notice: "Registro público consultado. No autentica al titular ni certifica títulos, afiliaciones o experiencia." };
}
export async function academicCitationGraph(raw: string, options: FetchOptions = {}) {
  let id: string; try { id = openalexId(raw); } catch { throw httpError("Identificador OpenAlex inválido", 400); }
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000), opts = { ...options, signal };
  const centerRaw = row(await academicMetadataJson(new URL(`https://api.openalex.org/works/${id}`), opts)), center = openalexPaper(centerRaw); if (!center) throw httpError("No se pudo leer la obra central", 422);
  const nodes: AcademicPaper[] = [center], edges: Array<{ from: string; to: string; relation: "cites" | "related" }> = [];
  let limited = false;
  for (const kind of ["references", "cited_by", "related"] as const) {
    const list = kind === "references" ? centerRaw.referenced_works : centerRaw.related_works;
    const ids = Array.isArray(list) ? list.flatMap(value => { try { return [openalexId(String(value))]; } catch { return []; } }) : [];
    if (kind !== "cited_by" && !ids.length) continue;
    const url = new URL("https://api.openalex.org/works"); url.searchParams.set("filter", kind === "cited_by" ? `cites:${id}` : `openalex:${ids.slice(0, 8).join("|")}`); url.searchParams.set("per_page", "8"); url.searchParams.set("select", OA_SELECT);
    const data = row(await academicMetadataJson(url, opts)); if (!Array.isArray(data.results)) throw httpError("El vecindario de citas no tiene un formato válido", 502);
    const found = data.results.slice(0, 8).flatMap(value => { const paper = openalexPaper(value); return paper ? [paper] : []; });
    for (const paper of found) { if (paper.metadata.openalexId === id) continue; if (!nodes.some(node => node.metadata.openalexId === paper.metadata.openalexId)) nodes.push(paper); edges.push({ from: kind === "cited_by" ? paper.metadata.openalexId : id, to: kind === "cited_by" ? id : paper.metadata.openalexId, relation: kind === "related" ? "related" : "cites" }); }
    if (ids.length > 8 || kind === "cited_by" && (center.citedByCount || 0) > 8) limited = true;
  }
  return { centerId: id, nodes, edges, limited, checkedAt: new Date().toISOString(), notice: "Vecindario de metadatos OpenAlex: hasta ocho referencias, ocho obras citantes y ocho relacionadas. Una cita no prueba acuerdo ni lectura del texto completo." };
}
