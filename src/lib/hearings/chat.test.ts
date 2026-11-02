import assert from "node:assert/strict";
import { hearingBriefSchema, hearingChatSchema, hearingLocationSchema, hearingNoteSchema, hearingSourcePatchSchema } from "./schemas";
import { hearingMessages, parseHearingModelOutput } from "./chat";
import { renderHearingBrief } from "./brief";
import type { HearingCitation } from "./types";
const citation = { sourceId: "source-fixture", origin: "knowledge", snapshot: { kind: "document", fragmentId: "fragment-fixture", versionId: "version-fixture", quote: "La buena fe objetiva gobierna el contrato.", quoteSha256: "a".repeat(64), textSha256: "b".repeat(64), sourceSha256: "c".repeat(64), sourceKey: "d".repeat(64), pageNumber: 2 }, title: "Fuente ficticia", reference: "Fuente ficticia", locator: "Página 2", href: "/documentos/fixture/fuentes", quote: "La buena fe objetiva gobierna el contrato.", sourceKey: "d".repeat(64), warning: null } satisfies HearingCitation;
assert.equal(parseHearingModelOutput('{"paragraphs":[{"text":"La fuente indica “buena fe objetiva”.","citationIds":["S1"]}]}', [citation]).responseText, "La fuente indica “buena fe objetiva”. [1]");
for (const output of ["texto sin estructura", '{"paragraphs":[{"text":"Sin respaldo","citationIds":[]}]}', '{"paragraphs":[{"text":"Con respaldo ajeno","citationIds":["S2"]}]}', '{"paragraphs":[{"text":"La fuente dice “texto inventado”.","citationIds":["S1"]}]}', '{"paragraphs":[{"text":"Fuente en https://inventada.invalid","citationIds":["S1"]}]}', '{"paragraphs":[{"text":"Fuente [9]","citationIds":["S1"]}]}']) assert.throws(() => parseHearingModelOutput(output, [citation]), (error: unknown) => (error as { status: number }).status === 409);
const longNote = { title: "Nota manual", body: `Primera ${"dato ".repeat(2500)} final no truncado` }, messages = hearingMessages("Comparar sin inventar", [citation], [longNote]);
assert.ok(messages.every(m => m.content.length <= 12_000)); assert.ok(messages.some(m => m.content.includes("final no truncado"))); assert.ok(messages[0].content.includes("nunca prueba"));
assert.throws(() => hearingMessages("Pregunta", Array.from({length:8},()=>citation), Array.from({length:8},()=>({ title: "Nota", body: "x".repeat(20_000) }))), (error: unknown) => (error as {status:number}).status === 413);
assert.equal(hearingChatSchema.safeParse({ requestId: "fixture-request", question: "Pregunta", mode: "ai", passages: [], noteIds: [] }).success, true);
assert.equal(hearingLocationSchema.safeParse({ page: 0 }).success, false); assert.equal(hearingLocationSchema.safeParse({ page: 501 }).success, false); assert.equal(hearingLocationSchema.safeParse({ invented: true }).success, false);
assert.equal(hearingNoteSchema.safeParse({title:"Nota",body:"Texto",citation:{sourceId:"s",fragmentId:"f",quote:"x".repeat(2201)}}).success,false);
assert.equal(hearingSourcePatchSchema.safeParse({revision:0,state:"reviewed",position:0,location:{}}).success,false);
const noteBase = { available: true as const, sourceId: null, revision: 1, updatedAt: "2026-11-02T12:00:00.000Z" };
const brief = renderHearingBrief("Audiencia ficticia", [
  { ...noteBase, id: "personal", title: "Pregunta inicial", body: "Observación propia", citation: null },
  { ...noteBase, id: "cited", title: "Argumento contractual", body: "Revisar el alcance del pasaje", citation },
  { ...noteBase, id: "again", title: "Pregunta final", body: "Contrastar el original", citation },
], { opening: "Apertura propia", closing: "Petición propia" });
assert.ok(brief.text.indexOf("1. Pregunta inicial") < brief.text.indexOf("2. Argumento contractual"));
assert.ok(brief.text.includes("Observación del profesional · Sin respaldo de fuente"));
assert.ok(brief.text.includes("Observación del profesional · [1]"));
assert.ok(brief.text.includes("[1] Fuente ficticia. Página 2."));
assert.ok(brief.text.includes("[2] Fuente ficticia. Página 2."));
assert.ok(brief.text.includes("> La buena fe objetiva gobierna el contrato."));
assert.ok(brief.text.includes(citation.snapshot.sourceSha256) && brief.text.includes(citation.href));
assert.ok(brief.text.includes("Texto propio del profesional\nApertura propia") && brief.text.includes("Texto propio del profesional\nPetición propia"));
assert.equal(brief.noteCount, 3); assert.equal(brief.citationCount, 2);
assert.equal(renderHearingBrief("Mesa", [{ ...noteBase, id: "n", title: "Personal", body: "Sin cita", citation: null }], { opening: "", closing: "" }).citationCount, 0);
for (const notes of [[], [{id:"n",revision:1},{id:"n",revision:1}], Array.from({length:21},(_,i)=>({id:`n${i}`,revision:1})), [{id:"n",revision:0}]]) assert.equal(hearingBriefSchema.safeParse({ notes }).success, false);
assert.equal(hearingBriefSchema.safeParse({ notes:[{id:"n",revision:1}], opening:"x".repeat(8001) }).success, false);
assert.equal(hearingBriefSchema.safeParse({ notes:[{id:"n",revision:1,body:"Injected citation"}] }).success, false);
assert.equal(hearingBriefSchema.safeParse({ notes:[{id:"n",revision:1}] }).success, true);
console.log("hearing chat unit OK: structured IDs, literal quotes, no injected links, bounded nontruncated messages and locators");
console.log("hearing brief unit OK: selected order, numbered literal references, personal observation separation, bounded unique note IDs and revisions");
