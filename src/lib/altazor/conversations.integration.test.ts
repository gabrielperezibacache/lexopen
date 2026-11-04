/** Explicit disposable PostgreSQL + public fictitious bytes; no real provider. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { createAltazorConversation, createAltazorTurn, executeAltazorTurn, readAltazorConversation, cancelAltazorTurn, patchAltazorConversation, listAltazorConversations, confirmAltazorTurn } from "./conversations";
import { createAltazorAttachment, deleteAltazorAttachment, readAltazorAttachment } from "./attachments";
import { sha256 } from "@/lib/evidence/fragments";
import type { AltazorServiceOptions, AltazorDestination } from "./types";
import type { AssistantTurnResult } from "@/lib/assistant/pipeline";
import { canonicalJson } from "@/lib/command-execution";

const status = (value: number) => (error: unknown) => (error as { status?: number }).status === value;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), users: string[] = [], conversations: string[] = [], planIds: string[] = [];
  const originalFetch = globalThis.fetch; let network = 0; globalThis.fetch = (async () => { network++; throw Error("Unexpected external call in ALTAZOR fixture"); }) as typeof fetch;
  const destination: AltazorDestination = { provider: "fixture", model: "fixture", endpoint: "Local fictitious model", endpointHash: sha256("fixture"), remote: false, permitted: true, key: sha256("fixture-destination") };
  let executions = 0;
  const answer = (): AssistantTurnResult => ({ planId: null, previewSteps: [], autoResults: [{ toolId: "respuesta.libre", result: { ok: true, message: "Respuesta ficticia conservada" } }], streamEvents: [], classification: { source: "rule", toolIds: ["respuesta.libre"], prompt: "fixture" } });
  const options: AltazorServiceOptions = { destination: async () => destination, execute: async input => { executions++; await input.authorizeContext?.(); assert.equal(input.scope?.causaId, null); return answer(); } };
  try {
    const owner = await db.user.create({ data: { name: "Titular ficticio ALTAZOR", email: `${tag}@altazor.invalid`, role: "abogado", password: "not-a-login" } }); users.push(owner.id);
    const stranger = await db.user.create({ data: { name: "Otro profesional ficticio", email: `${tag}-other@altazor.invalid`, role: "abogado", password: "not-a-login" } }); users.push(stranger.id);
    const created = await createAltazorConversation({ requestId: `chat-${tag}`, title: "Chat ficticio", causaId: null }, owner, db); const id = created.conversation.id; conversations.push(id);
    assert.equal((await createAltazorConversation({ requestId: `chat-${tag}`, title: "Chat ficticio", causaId: null }, owner, db)).reused, true);
    await assert.rejects(readAltazorConversation(id, stranger, db, {}, options), status(404));
    assert.equal((await listAltazorConversations(stranger, db, options)).conversations.length, 0);
    await assert.rejects(patchAltazorConversation(id, { expectedRevision: 1, causaId: "different" }, owner, db));
    const bytes = Buffer.from("Antecedente completamente ficticio y público de prueba.");
    const uploaded = await createAltazorAttachment(id, { requestId: `file-${tag}`, name: "ficticio.txt", bytes }, owner, db); const attachmentId = uploaded.attachment.id;
    assert.equal(uploaded.attachment.status, "ready"); assert.equal(uploaded.attachment.sourceSha256, sha256(bytes));
    assert.equal((await createAltazorAttachment(id, { requestId: `file-${tag}`, name: "ficticio.txt", bytes }, owner, db)).reused, true);
    await assert.rejects(readAltazorAttachment(id, attachmentId, stranger, db), status(404));
    const input = { requestId: `turn-${tag}`, expectedRevision: 1, text: "Ordena el antecedente ficticio", attachmentIds: [attachmentId], destinationKey: destination.key };
    const first = await createAltazorTurn(id, input, owner, db, options);
    assert.equal((await createAltazorTurn(id, input, owner, db, options)).turnId, first.turnId);
    await assert.rejects(createAltazorTurn(id, { ...input, text: "Contenido distinto" }, owner, db, options), status(409));
    await assert.rejects(createAltazorTurn(id, { ...input, requestId: `concurrent-${tag}`, expectedRevision: 2 }, owner, db, options), status(409));
    const complete = await executeAltazorTurn(id, first.turnId, owner, db, options); assert.equal(complete.turns[0].status, "completed"); assert.equal(executions, 1);
    await executeAltazorTurn(id, first.turnId, owner, db, options); assert.equal(executions, 1);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
    const second = await createAltazorTurn(id, { ...input, requestId: `second-${tag}`, expectedRevision: 2, attachmentIds: [] }, owner, db, options);
    const running = executeAltazorTurn(id, second.turnId, owner, db, { ...options, execute: async turn => { executions++; assert.equal(turn.history?.length, 2); assert.match(turn.history?.[1].content || "", /conservada/); entered(); await hold; return answer(); } });
    await started; await executeAltazorTurn(id, second.turnId, owner, db, options); assert.equal(executions, 2); release(); await running;
    const secondRow = await db.altazorTurn.findUniqueOrThrow({ where: { id: second.turnId } }); assert.deepEqual(JSON.parse(secondRow.contextJson).historyTurnIds, [first.turnId]);
    const third = await createAltazorTurn(id, { ...input, requestId: `cancel-${tag}`, expectedRevision: 3, attachmentIds: [] }, owner, db, options);
    let enteredCancel!: () => void; const cancelStarted = new Promise<void>(resolve => { enteredCancel = resolve; }); let aborted = false;
    const cancellation = executeAltazorTurn(id, third.turnId, owner, db, { ...options, execute: async turn => { enteredCancel(); await new Promise<void>((_resolve, reject) => { turn.signal!.addEventListener("abort", () => { aborted = true; reject(Error("fictitious cancelled model")); }, { once: true }); }); return answer(); } });
    await cancelStarted; await cancelAltazorTurn(id, third.turnId, owner, db); await cancellation; assert.equal(aborted, true); assert.equal((await db.altazorTurn.findUniqueOrThrow({ where: { id: third.turnId } })).status, "cancelled");
    await deleteAltazorAttachment(id, attachmentId, owner, db);
    const redacted = await readAltazorConversation(id, owner, db, {}, options); assert.equal(redacted.turns[0].status, "blocked"); assert.equal(redacted.turns[1].status, "blocked"); assert.equal(redacted.turns[1].assistantText, "");
    const fourth = await createAltazorTurn(id, { ...input, requestId: `lease-${tag}`, expectedRevision: 4, attachmentIds: [] }, owner, db, options);
    await db.altazorTurn.update({ where: { id: fourth.turnId }, data: { status: "running", leaseToken: "fixture-old-lease", leaseExpiresAt: new Date(0) } });
    assert.equal((await readAltazorConversation(id, owner, db, {}, options)).turns.at(-1)?.status, "interrupted");
    const remote = { ...destination, remote: true }, remoteOptions = { ...options, destination: async () => remote };
    await assert.rejects(createAltazorTurn(id, { ...input, requestId: `remote-${tag}`, expectedRevision: 5, attachmentIds: [] }, owner, db, remoteOptions), status(403));
    // Real secure-tool writes/receipts, with a generated plan fixture and no LLM.
    const planInput = { ...input, requestId: `confirm-${tag}`, expectedRevision: 5, text: "Crear evento ficticio", attachmentIds: [] };
    const planned = await createAltazorTurn(id, planInput, owner, db, options);
    await executeAltazorTurn(id, planned.turnId, owner, db, { ...options, execute: async turn => {
      const plan = { id: turn.planId!, needsConfirm: true, intents: [], steps: [{ toolId: "evento.crear" as const, input: { titulo: `Evento ficticio ALTAZOR ${tag}`, inicio: "2027-03-01T15:00:00.000Z", todoElDia: false }, preview: "Crear evento ficticio" }] };
      planIds.push(plan.id); await db.assistantPlanRecord.create({ data: { id: plan.id, ownerId: owner.id, planJson: canonicalJson(plan), expiresAt: new Date(Date.now() + 60_000) } });
      return { ...answer(), planId: plan.id, previewSteps: plan.steps, autoResults: undefined };
    } });
    const confirmed = await confirmAltazorTurn(id, planned.turnId, true, owner, db, options); assert.equal(confirmed.turns.at(-1)?.status, "completed");
    await confirmAltazorTurn(id, planned.turnId, true, owner, db, options); assert.equal(await db.evento.count({ where: { titulo: `Evento ficticio ALTAZOR ${tag}` } }), 1);
    assert.equal(network, 0);
    console.log("ALTAZOR disposable integration passed: ordered durable history, ownership, immutable scope, original hashes, dedupe/concurrency, cancellation/lease, derived-source revocation, real secure-tool confirmation replay; zero provider traffic.");
  } finally {
    globalThis.fetch = originalFetch;
    await db.evento.deleteMany({ where: { titulo: `Evento ficticio ALTAZOR ${tag}` } });
    await db.altazorConversation.deleteMany({ where: { id: { in: conversations } } });
    await db.assistantPlanRecord.deleteMany({ where: { id: { in: planIds } } });
    await db.commandExecution.deleteMany({ where: { ownerId: { in: users } } }); await db.assistantUndo.deleteMany({ where: { ownerId: { in: users } } });
    await db.activity.deleteMany({ where: { userId: { in: users } } }); await db.auditEvent.deleteMany({ where: { actorId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
