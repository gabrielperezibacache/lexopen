/** Synthetic multi-scope history in explicitly disposable PostgreSQL. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { createAltazorAttachment, deleteAltazorAttachment } from "./attachments";
import { createAltazorConversation } from "./conversations";
import { readAltazorTimeline } from "./timeline";
import { ALTAZOR_LIMITS } from "./types";

const responseStatus = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tag = `timeline-${randomUUID()}`;
  const users = [`${tag}-owner`, `${tag}-foreign`], caseId = `${tag}-case`;
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls++; throw new Error("Reading history must not contact providers"); };
  try {
    const [owner, other] = await Promise.all(users.map(id => db.user.create({ data: {
      id, email: `${id}@example.invalid`, name: "Titular ficticio", role: "abogado", password: "not-a-login",
    } })));
    const cause = await db.causa.create({ data: { id: caseId, titulo: "Causa autorizada", tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: other.id } });
    const member = await db.causaMiembro.create({ data: { causaId: caseId, userId: owner.id } });
    const create = async (who: typeof owner, title: string, causaId: string | null = null) =>
      (await createAltazorConversation({ requestId: randomUUID(), title, causaId }, who, db)).conversation;
    const personal = await create(owner, "TITULO_REVOCA_FUENTE");
    const archived = await create(owner, "TITULO_ARCHIVADO");
    const scoped = await create(owner, "TITULO_CAUSA_INTERNO", caseId);
    const foreign = await create(other, "TITULO_DE_TERCERO");
    await db.altazorConversation.update({ where: { id: archived.id }, data: { status: "archived" } });
    await assert.rejects(db.altazorConversation.update({ where: { id: personal.id }, data: { scopeKey: `causa:${caseId}` } }));
    const attachment = (await createAltazorAttachment(personal.id, {
      requestId: randomUUID(), name: "ficticio.txt", bytes: Buffer.from("FUENTE_REVOCABLE"),
    }, owner, db)).attachment;
    const sameTime = new Date("2099-05-05T12:00:00.000Z");
    const newer = new Date("2099-05-05T12:00:01.000Z");
    await db.altazorConversation.createMany({ data: Array.from({ length: ALTAZOR_LIMITS.conversations + 1 }, (_, index) => ({
      ownerId: owner.id, requestId: `${tag}-historical-import-${index}`, scopeKey: "personal", title: "Historial ficticio", updatedAt: newer,
    })) });
    const contextJson = (attachmentIds: string[] = []) => JSON.stringify({ version: 1, attachmentIds, refs: [], historyTurnIds: [], memoryDependencies: [] });
    const base = { ownerId: owner.id, inputSha256: "fixture", status: "completed", assistantText: "Respuesta ficticia", contextJson: contextJson(), createdAt: sameTime };
    const labels = Array.from({ length: ALTAZOR_LIMITS.turnsPerPage + 3 }, (_, index) => `${tag}-${String(index).padStart(3, "0")}`);
    await db.altazorTurn.createMany({ data: labels.map((id, index) => ({
      ...base, id, requestId: id, ordinal: index + 1, userText: `Mensaje ${index}`, conversationId: index % 2 ? archived.id : personal.id,
    })) });
    const added = ["scoped", "foreign", "inconsistent", "attachment", "expired"].map(label => `${tag}-${label}`);
    await db.altazorTurn.createMany({ data: [
      { ...base, id: added[0], requestId: added[0], ordinal: 1, conversationId: scoped.id, userText: "MENSAJE_DE_CAUSA" },
      { ...base, id: added[1], requestId: added[1], ordinal: 1, conversationId: foreign.id, ownerId: other.id, userText: "MENSAJE_DE_TERCERO" },
      { ...base, id: added[2], requestId: added[2], ordinal: 2, conversationId: foreign.id, userText: "MENSAJE_INCONSISTENTE" },
      { ...base, id: added[3], requestId: added[3], ordinal: 101, conversationId: personal.id, userText: "MENSAJE_REVOCABLE", assistantText: "RESPUESTA_REVOCABLE", contextJson: contextJson([attachment.id]), createdAt: newer },
      { ...base, id: added[4], requestId: added[4], ordinal: 102, conversationId: personal.id, userText: "Pendiente ficticio", status: "running", leaseToken: "TOKEN_DE_ARRENDAMIENTO", leaseExpiresAt: new Date(0), createdAt: newer },
    ] });
    const read = (before?: string | null) => readAltazorTimeline(owner, before, db);
    const recent = await read();
    assert.equal(recent.turns.length, ALTAZOR_LIMITS.turnsPerPage);
    assert.equal(recent.hasMore, true);
    assert.ok(recent.before);
    const earlier = await read(recent.before);
    assert.equal(earlier.hasMore, false);
    assert.equal(earlier.before, null);
    const combined = [...earlier.turns, ...recent.turns];
    assert.deepEqual(combined.map(turn => turn.id), [...labels, added[0], added[3], added[4]]);
    assert.ok(recent.turns.some(turn => turn.conversationId === archived.id && turn.conversationStatus === "archived"));
    const scopedTurn = combined.find(turn => turn.id === added[0]);
    assert.equal(scopedTurn?.conversationTitle, cause.titulo);
    assert.equal(scopedTurn?.scopeKey, `causa:${caseId}`);
    assert.deepEqual(combined.find(turn => turn.id === added[3])?.attachmentIds, [attachment.id]);
    assert.equal(combined.find(turn => turn.id === added[4])?.status, "interrupted");
    const expired = await db.altazorTurn.findUniqueOrThrow({ where: { id: added[4] } });
    assert.equal(expired.status, "running", "Timeline does not repair or mutate the worker lease");
    assert.equal(expired.leaseToken, "TOKEN_DE_ARRENDAMIENTO");
    const serialized = JSON.stringify(combined);
    for (const hidden of ["TITULO_", "MENSAJE_DE_TERCERO", "MENSAJE_INCONSISTENTE", "TOKEN_DE_ARRENDAMIENTO", "FUENTE_REVOCABLE", "contextJson", "destinationJson"]) assert.equal(serialized.includes(hidden), false);

    await deleteAltazorAttachment(personal.id, attachment.id, owner, db);
    await db.causaMiembro.delete({ where: { id: member.id } });
    const after = await read();
    assert.equal(after.turns.some(turn => turn.conversationId === scoped.id), false);
    const redacted = after.turns.find(turn => turn.id === added[3]);
    assert.equal(redacted?.available, false);
    assert.equal(redacted?.assistantText, "");
    assert.deepEqual(redacted?.attachmentIds, []);
    assert.doesNotMatch(JSON.stringify(after), /REVOCABLE|MENSAJE_DE_CAUSA|Causa autorizada/);
    await assert.rejects(read("fecha inválida~a"), responseStatus(400));
    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    await assert.rejects(read(), responseStatus(403));
    assert.equal(providerCalls, 0);
    console.log("Altazor timeline passed: unified and stable pagination, archived history, owner/scope/source revocations, no lease mutation and zero provider traffic.");
  } finally {
    globalThis.fetch = originalFetch;
    await db.altazorConversation.deleteMany({ where: { ownerId: { in: users } } });
    await db.causa.deleteMany({ where: { id: caseId } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
