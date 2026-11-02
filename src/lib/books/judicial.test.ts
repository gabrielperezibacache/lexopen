import assert from "node:assert/strict";
import { readBookUpload, bookPatchSchema } from "./ingest";
import { judicialMetadataSchema, normalizeJudicialMetadata, parseStoredJudicialSource, validDecisionDate } from "./judicial";
import { formatBookReference, judicialMetadataNotice } from "./references";
import { bookDraftMessages, composeBookDraft } from "./drafts";
import type { BookCitation } from "./types";

const manual = { court: "Tribunal ficticio de prueba", caseNumber: "123-2026", decisionDate: "2024-02-29", chamber: "Sala de prueba", caseTitle: "Parte ficticia A con B", matter: "Materia ficticia" };
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
function form(sourceType?: string, judicial?: string) {
  const value = new FormData(); value.set("file", new File(["Texto ficticio para comprobación."], "resolucion.txt")); value.set("requestId", "fixture-request-judicial");
  if (sourceType !== undefined) value.set("sourceType", sourceType);
  if (judicial !== undefined) value.set("judicialJson", judicial);
  return value;
}
const request = (value: FormData) => new Request("http://fixture.invalid", { method: "POST", body: value });
async function main() {
  const originalFetch = globalThis.fetch; let networkCalls = 0;
  globalThis.fetch = (async () => { networkCalls++; throw Error("Judicial metadata must not fetch a URL"); }) as typeof fetch;
  try {
    for (const date of ["2024-02-29", "2000-02-29", "2026-11-01", "0001-01-01"]) assert.equal(validDecisionDate(date), true, date);
    for (const date of ["2026-02-29", "1900-02-29", "2024-04-31", "2024-00-01", "0000-01-01", "2024-1-1", "2024-02-29T00:00:00Z"]) assert.equal(validDecisionDate(date), false, date);
    const judicial = judicialMetadataSchema.parse({ ...manual, officialUrl: "https://court-fixture.invalid/decision/123" });
    assert.equal(judicial.jurisdiction, "CL"); assert.equal(judicial.rit, ""); assert.equal(judicial.decisionDate, "2024-02-29");
    for (const officialUrl of ["file:///tmp/file", "javascript:alert(1)", "https://user:password@example.invalid/decision", "https://user@example.invalid/decision", "/relative", "https://court-fixture.invalid/\npath"]) assert.equal(judicialMetadataSchema.safeParse({ ...manual, officialUrl }).success, false);
    for (const invalid of [{ ...manual, court: "" }, { ...manual, caseNumber: "" }, { ...manual, decisionDate: "2023-02-29" }, { ...manual, verified: true }]) assert.equal(judicialMetadataSchema.safeParse(invalid).success, false);
    assert.deepEqual(parseStoredJudicialSource({}), { sourceType: "book", judicial: null });
    assert.throws(() => normalizeJudicialMetadata("book", manual)); assert.throws(() => normalizeJudicialMetadata("judgment", null));
    const legacy = await readBookUpload(request(form())); assert.equal(legacy.sourceType, "book"); assert.equal(legacy.judicial, null);
    for (const sourceType of ["judgment", "ruling"] as const) {
      const parsed = await readBookUpload(request(form(sourceType, JSON.stringify(judicial))));
      assert.equal(parsed.sourceType, sourceType); assert.deepEqual(parsed.judicial, judicial); assert.equal(parsed.bytes.toString(), "Texto ficticio para comprobación.");
    }
    await assert.rejects(readBookUpload(request(form("judgment"))));
    await assert.rejects(readBookUpload(request(form("judgment", "not JSON"))), status(400));
    await assert.rejects(readBookUpload(request(form("judgment", JSON.stringify({ text: "ñ".repeat(9000) })))), status(413));
    await assert.rejects(readBookUpload(request(form("unknown", "{}"))));
    await assert.rejects(readBookUpload(request(form("book", JSON.stringify(judicial)))));
    const duplicated = form("judgment", JSON.stringify(judicial)); duplicated.append("sourceType", "ruling"); await assert.rejects(readBookUpload(request(duplicated)), status(400));
    assert.deepEqual(bookPatchSchema.parse({ revision: 1, judicial: { chamber: "Otra sala" } }).judicial, { chamber: "Otra sala" });
    assert.equal(bookPatchSchema.safeParse({ revision: 1, judicial: { executed: true } }).success, false);
    const old = { bookId: "book", fragmentId: "fragment", quote: "Texto ficticio para comprobación.", title: "Tratado ficticio", author: "Autora ficticia", year: "2025", edition: "2ª", publisher: "Editorial ficticia", locatorLabel: "Fragmento 1", sourceSha256: "a".repeat(64), href: "/biblioteca/book" } as BookCitation;
    assert.equal(formatBookReference(old), "Autora ficticia. Tratado ficticio. 2ª. Editorial ficticia. 2025");
    assert.match(composeBookDraft("Prosa", [old]), /Autora ficticia\. Tratado ficticio\. 2ª\. Editorial ficticia\. 2025/);
    const citation: BookCitation = { ...old, sourceType: "judgment", judicial };
    const reference = formatBookReference(citation);
    assert.match(reference, /Tribunal ficticio de prueba\. Sala de prueba\. Sentencia\. Rol 123-2026\. 29\/02\/2024\. Parte ficticia A con B\. Materia ficticia/);
    assert.doesNotMatch(reference, /Autora ficticia|Editorial ficticia|2ª/);
    assert.match(formatBookReference({ ...citation, sourceType: "ruling" }), /Resolución/);
    assert.match(composeBookDraft("Prosa", [citation]), /Rol 123-2026/);
    const packets = bookDraftMessages({ instruction: "Fundamentar con las fuentes", query: "prueba", existingText: "" }, [citation]);
    assert.ok(packets.some(packet => packet.content.includes('"sourceType":"judgment"') && packet.content.includes('"decisionDate":"2024-02-29"') && packet.content.includes(reference) && packet.content.includes(judicialMetadataNotice)));
    assert.equal(networkCalls, 0);
    console.log("Judicial library unit PASS: explicit classification, bounded strict manual metadata, civil/leap dates without timezone conversion, safe descriptive URLs with zero fetch, legacy bibliography, judicial references and grounded AI context.");
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
