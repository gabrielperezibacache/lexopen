/** Fictitious public-style metadata and injected transports; zero real network/DB. */
import assert from "node:assert/strict";
import { academicCitationGraph, academicMetadataJson, lookupAcademicPaper, lookupOrcid, searchAcademicProvider } from "./academic-discovery-providers";
import { requireAcademicOutbound } from "./academic-discovery";
import { BIBLIOGRAPHY_STYLES, bibliographyMetadataSchema, normalizeDoi, normalizeOrcid } from "./bibliography-types";
import { formatBibliography, importBibliography } from "./bibliography";

const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
const crossref = { DOI: "10.5555/fictitious-metadata", title: ["Evaluación ficticia de fuentes"], author: [{ family: "Pérez", given: "Ana María" }], published: { "date-parts": [[2024, 5, 1]] }, "container-title": ["Revista ficticia"], volume: "12", issue: "2", page: "10-21", type: "journal-article" };
const work = (id: string) => ({ id: `https://openalex.org/${id}`, doi: id === "W1" ? "https://doi.org/10.5555/fictitious-metadata" : null, display_name: `Obra ficticia ${id}`, publication_year: 2024, authorships: [{ author: { display_name: "Ana Ficticia" } }], primary_location: { source: { display_name: "Revista ficticia" } }, open_access: { is_oa: true }, biblio: { volume: "1", first_page: "2", last_page: "8" }, referenced_works: id === "W1" ? ["https://openalex.org/W2"] : [], related_works: id === "W1" ? ["https://openalex.org/W3"] : [], cited_by_count: id === "W1" ? 1 : 0 });
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
async function main() {
  const originalFetch = globalThis.fetch; globalThis.fetch = (async () => { throw Error("Unexpected real network"); }) as typeof fetch;
  const calls: string[] = [];
  const fake: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url.toString()); assert.equal(init?.redirect, "error"); assert.equal(init?.credentials, "omit");
    assert.equal(init?.headers && "Authorization" in init.headers, false);
    if (url.hostname === "api.crossref.org") return json({ message: url.pathname === "/works" ? { items: [crossref] } : crossref });
    if (url.hostname === "pub.orcid.org") return json({ name: { "given-names": { value: "Autor" }, "family-name": { value: "Ficticio" } } });
    if (url.pathname === "/works/W1") return json(work("W1"));
    const filter = url.searchParams.get("filter");
    return json({ results: [work(filter === "cites:W1" ? "W4" : filter === "openalex:W2" ? "W2" : filter === "openalex:W3" ? "W3" : "W1")] });
  };
  try {
    assert.throws(() => requireAcademicOutbound(false), status(403)); assert.equal(calls.length, 0);
    const crossrefResults = await searchAcademicProvider("crossref", "tema público ficticio", { fetch: fake }); assert.equal(crossrefResults.length, 1); assert.equal(crossrefResults[0].metadata.authors[0].family, "Pérez"); assert.equal(crossrefResults[0].metadata.year, 2024); assert.equal(crossrefResults[0].metadata.doi, "10.5555/fictitious-metadata");
    const openalex = await searchAcademicProvider("openalex", "tema público ficticio", { fetch: fake }); assert.equal(openalex[0].metadata.openalexId, "W1"); assert.equal(openalex[0].openAccess, true);
    const graph = await academicCitationGraph("W1", { fetch: fake }); assert.equal(graph.nodes.length, 4); assert.deepEqual(graph.edges, [{ from: "W1", to: "W2", relation: "cites" }, { from: "W4", to: "W1", relation: "cites" }, { from: "W1", to: "W3", relation: "related" }]);
    const found = await lookupAcademicPaper({ provider: "crossref", identifier: "https://doi.org/10.5555/fictitious-metadata" }, { fetch: fake }); assert.equal(found.key, crossrefResults[0].key);
    const author = await lookupOrcid("0000-0002-1825-0097", { fetch: fake }); assert.equal(author.name, "Autor Ficticio"); assert.match(author.notice, /No autentica.*ni certifica/);
    assert.throws(() => normalizeOrcid("0000-0002-1825-0098")); assert.throws(() => normalizeDoi("http://127.0.0.1/private"));
    const before = calls.length; await assert.rejects(academicMetadataJson(new URL("https://api.crossref.org.evil.invalid/works"), { fetch: fake }), status(400)); assert.equal(calls.length, before);
    await assert.rejects(academicMetadataJson(new URL("https://api.crossref.org/works"), { fetch: async () => Response.redirect("https://evil.invalid", 302) }), status(502));
    await assert.rejects(academicMetadataJson(new URL("https://api.crossref.org/works"), { fetch: async () => new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": String(3 * 1024 * 1024) } }) }), status(413));
    const controller = new AbortController(); controller.abort(); await assert.rejects(academicMetadataJson(new URL("https://api.crossref.org/works"), { fetch: fake, signal: controller.signal })); assert.equal(calls.length, before);
    assert.deepEqual(await searchAcademicProvider("crossref", "sin resultados", { fetch: async () => json({ message: { items: [] } }) }), []);
    const metadata = crossrefResults[0].metadata;
    for (const style of BIBLIOGRAPHY_STYLES) { const output = formatBibliography(metadata, style); assert.match(output.text, /Evaluación ficticia de fuentes/); assert.match(output.text, /2024/); assert.deepEqual(output.missingFields, []); }
    const bibtex = formatBibliography(metadata, "bibtex").text, ris = formatBibliography(metadata, "ris").text;
    for (const [content, format] of [[bibtex, "bibtex"], [ris, "ris"]] as const) { const imported = importBibliography(content, format); assert.equal(imported[0].title, metadata.title); assert.equal(imported[0].doi, metadata.doi); assert.equal(imported[0].authors[0].family, "Pérez"); assert.match(imported[0].warnings[0], /no corroborados/); }
    assert.throws(() => importBibliography('@string{secret="no"}', "bibtex")); assert.throws(() => importBibliography('@article{a,title=secret}', "bibtex")); assert.throws(() => importBibliography("TY  - JOUR\nTI  - Incompleta", "ris"));
    assert.deepEqual(formatBibliography(bibliographyMetadataSchema.parse({ title: "Referencia sin datos" }), "apa").missingFields, ["autores", "año", "revista", "identificador persistente"]);
    console.log("Discovery/bibliography fixtures passed: public consent, fixed hosts/no redirects, bounded metadata, ORCID checksum, true citation graph, no-result semantics, seven deterministic styles and inert RIS/BibTeX round trips (zero network/DB).");
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
