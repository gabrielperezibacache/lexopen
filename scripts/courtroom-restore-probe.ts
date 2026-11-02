import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { readCaseAudio } from "../src/lib/audio/service";
import { readHearing } from "../src/lib/hearings/service";
import { readHearingSource } from "../src/lib/hearings/sources";
import { resolveBookCitation } from "../src/lib/books/service";

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, process.env.DATABASE_URL);
  assert.ok(process.env.COURTROOM_FIXTURE_MANIFEST); assert.ok(process.env.STORAGE_PATH);
  const fixture = JSON.parse(await readFile(process.env.COURTROOM_FIXTURE_MANIFEST!, "utf8")) as { userIds: string[]; caseIds: string[]; audioId: string; bookId: string; workspaceId: string; sourceId: string; noteId: string; turnId: string; transcriptDocumentId: string };
  const db = new PrismaClient({ datasources: { db: { url } } }), originalFetch = globalThis.fetch; let networkCalls = 0;
  globalThis.fetch = (async () => { networkCalls++; throw new Error("No network is permitted in a read-only restoration probe"); }) as typeof fetch;
  try {
    const user = await db.user.findUniqueOrThrow({ where: { id: fixture.userIds[1] } }), other = await db.user.findUniqueOrThrow({ where: { id: fixture.userIds[0] } });
    const audio = await readCaseAudio(fixture.caseIds[0], fixture.audioId, user, db); assert.equal(audio.audio.reviewStatus, "reviewed"); assert.ok(audio.history.length >= 2); assert.match(audio.audio.transcriptText || "", /ficticio/);
    const workspace = await readHearing(fixture.caseIds[0], fixture.workspaceId, user, db); assert.ok(workspace.notes.some(note => note.id === fixture.noteId && note.available)); assert.ok(workspace.turns.some(turn => turn.id === fixture.turnId && turn.available && turn.modelUsed));
    const reading = await readHearingSource(fixture.caseIds[0], fixture.workspaceId, fixture.sourceId, user, {}, db); assert.ok(reading.fragments.length);
    const fragment = await db.libraryBookFragment.findFirstOrThrow({ where: { bookId: fixture.bookId }, orderBy: { ordinal: "asc" } });
    const citation = await resolveBookCitation({ bookId: fixture.bookId, fragmentId: fragment.id, quote: fragment.text }, user, { client: db }); assert.equal(citation.sourceType, "judgment"); assert.equal(citation.judicial?.caseNumber, "FICTICIO-2026");
    const publication = await db.documento.findUniqueOrThrow({ where: { id: fixture.transcriptDocumentId }, include: { audioPublication: true } }); assert.equal(publication.audioPublication?.audioId, fixture.audioId); assert.equal(publication.ruta, "Audiencias/Transcripciones"); assert.match(publication.contenido || "", /REVISADA POR UNA PERSONA/);
    await assert.rejects(readHearing(fixture.caseIds[0], fixture.workspaceId, other, db));
    assert.equal(networkCalls, 0);
    console.log(JSON.stringify({ restoredDomainRead: "PASS", audioOriginalHashChecked: true, revisions: audio.history.length, humanReviewAndPublishedSnapshot: true, judicialSourceAndExactCitation: true, privateHearingNotesAndModelHistory: true, readingFragments: reading.fragments.length, privateEvenForAdministrator: true, networkCalls, wroteApplicationRows: false }));
  } finally { globalThis.fetch = originalFetch; await db.$disconnect(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
