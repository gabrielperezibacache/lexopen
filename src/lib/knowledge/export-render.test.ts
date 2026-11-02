import assert from "node:assert/strict";
import { renderChronologyCsv, renderKnowledgeMarkdown, type KnowledgeExportSnapshot } from "./export-render";
import type { CaseFactView } from "./cases";
import type { ResolvedCitation } from "./citations";

const citation: ResolvedCitation = {
  kind: "document", fragmentId: "fragment", versionId: "version", quote: "El pago consta el 03/04/2025.\n<img src=x onerror=alert(1)>\r---\r- punto\n1. enumeración", quoteSha256: "a".repeat(64), textSha256: "b".repeat(64), sourceSha256: "c".repeat(64), sourceKey: "source", pageNumber: null,
  title: "Fuente [aportada]", href: "/documentos/fuente?fragment=fragment", sourceKind: "case_document", documentId: "doc", siteFileId: null, siteId: null, causaId: "case", resourceId: "resource", isCurrent: false, partial: true, extractionMethod: "text", acquisitionMethod: "upload", warnings: ["Original no conservado; cotejo con texto guardado"],
};
const fact: CaseFactView = { id: "fact", causaId: "case", statement: "  =HYPERLINK(\"https://example.invalid\")", dateLiteral: "03/04/2025", dateStart: null, dateEnd: null, datePrecision: "ambiguous", dateInferred: false, inferenceReason: null, comparisonKey: null, status: "proposed", highlighted: false, revision: 2, origin: "manual", createdAt: "2026-11-02", updatedAt: "2026-11-02", citations: [citation], citationCount: 2, citationsLimited: true, stale: true, partial: true, warnings: [], reviewCount: 1 };
const snapshot: KnowledgeExportSnapshot = { caseIdentity: { id: "case", titulo: "Causa ficticia", rit: "C-1-2026" }, facts: [fact], chronology: { dated: [], undated: [fact] }, conflicts: [], canWrite: true, restricted: true, coverage: { factsLimited: true, conflictsLimited: false, factsShown: 1, factsLimit: 200, nextAfter: "next", verificationLimited: true, verificationFactsLimit: 400, verificationReferencesLimit: 2000, chronologyScope: "Hechos autorizados de esta página", networkRequests: 0, modelUsed: false } };
const markdown = renderKnowledgeMarkdown(snapshot, { q: "pago", after: "cursor" }, "2026-11-02T12:00:00Z");
assert.match(markdown, /Sin fecha normalizada/);
assert.match(markdown, /Ambigua/);
assert.match(markdown, /03\/04\/2025/);
assert.match(markdown, /Propuesto/);
assert.match(markdown, /Referencias acotadas: 1 de 2/);
assert.match(markdown, /revisión posterior/);
assert.match(markdown, /Extracción parcial/);
assert.match(markdown, /Original no conservado/);
assert.match(markdown, /páginas siguientes/);
assert.match(markdown, /evidencia ya no está disponible/);
assert.match(markdown, /búsqueda pago/);
assert.ok(!markdown.includes("<img"));
assert.match(markdown, /&lt;img/);
assert.match(markdown, /\[Abrir pasaje en LexOpen\]\(\/documentos\/fuente\?fragment=fragment\)/);
const csv = renderChronologyCsv(snapshot, {}, "2026-11-02T12:00:00Z");
assert.ok(csv.startsWith("\uFEFF"));
assert.ok(csv.includes("'  =HYPERLINK"), "Leading whitespace must not enable spreadsheet formulas");
assert.match(csv, /Ambigua,03\/04\/2025/);
assert.match(csv, /Alcance/);
assert.ok(!csv.includes("2025-03-04"), "Never invent an interpretation of ambiguous dates");
const empty: KnowledgeExportSnapshot = { ...snapshot, facts: [], chronology: { dated: [], undated: [] }, conflicts: [] };
assert.match(renderChronologyCsv(empty, {}, "now"), /Se omitió conocimiento/);
assert.match(renderKnowledgeMarkdown(empty, {}, "now"), /No hay hechos activos/);
const audio: KnowledgeExportSnapshot = { ...snapshot, chronology: { dated: [], undated: [{ ...fact, citations: [{ ...citation, audioTranscript: { audioId: "audio", revision: 1, reviewStatus: "unreviewed", provider: "manual", model: null, verificationBasis: "transcript_text" } }] }] } };
assert.match(renderKnowledgeMarkdown(audio, {}, "now"), /no acredita fidelidad al audio/);
assert.match(renderChronologyCsv(audio, {}, "now"), /no acredita fidelidad al audio/);
const unsafe: KnowledgeExportSnapshot = { ...snapshot, chronology: { dated: [], undated: [{ ...fact, citations: [{ ...citation, href: "//example.invalid/steal" }] }] } };
assert.ok(!renderKnowledgeMarkdown(unsafe, {}, "now").includes("//example.invalid/steal"));
console.log("Knowledge export render PASS: uncertainty, scope, source warnings, relative links, Markdown escaping, CSV formula guards and transcript caveats");

assert.ok(markdown.includes("> \\---"));
assert.ok(markdown.includes("> \\- punto"));
assert.ok(markdown.includes("> 1\\. enumeración"));
assert.match(markdown, /Causa ficticia/);
assert.match(csv, /C-1-2026/);
