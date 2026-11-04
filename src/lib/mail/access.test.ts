import assert from "node:assert/strict";
import { assertCausaMailAccess, currentMailActor, publicMailboxMessages, type MailAccessClient } from "./access";

async function main() {
  const actor = { id: "mail-recipient", role: "abogado", capabilityGrants: "", capabilityRevokes: "" };
  let current = { ...actor };
  let caseQuery = "";
  const client = {
    user: { findUnique: async () => current },
    causa: {
      findMany: async (input: unknown) => {
        caseQuery = JSON.stringify(input);
        return current.capabilityRevokes.includes("causa.read") ? [] : [{ id: "visible-case", titulo: "Título vigente autorizado", rit: "C-10-2099" }];
      },
      findFirst: async (input: unknown) => { caseQuery = JSON.stringify(input); return null; },
    },
    documento: { findMany: async () => [{ id: "visible-document" }] },
  } as unknown as MailAccessClient;
  const original = {
    id: "own-message", userId: actor.id, subject: "Asunto original propio", bodyText: "Cuerpo original recibido",
    kind: "resolucion", status: "aplicado", rit: "C-1-2098", tribunal: "Tribunal escrito en el email",
    fromAddress: "sender@example.invalid", receivedAt: new Date("2026-11-01T10:00:00Z"),
    causaId: "hidden-case", causa: { id: "hidden-case", titulo: "RESERVED_SOURCE_TITLE", rit: "RESERVED_SOURCE_RIT" },
    attachments: [
      { filename: "original.pdf", mimeType: "application/pdf", sizeBytes: 100, documentoId: "hidden-document" },
      { filename: "other-original.pdf", mimeType: "application/pdf", sizeBytes: 200, documentoId: "visible-document" },
    ],
  };
  const [hidden, visible] = await publicMailboxMessages([original, { ...original, id: "other-own-message", causaId: "visible-case" }], actor, client);
  assert.equal(hidden.causaId, null);
  assert.equal(hidden.causa, null);
  assert.equal(hidden.subject, original.subject);
  assert.equal(hidden.bodyText, original.bodyText);
  assert.equal(hidden.rit, original.rit);
  assert.equal(hidden.tribunal, original.tribunal);
  assert.equal(hidden.attachments[0].filename, "original.pdf");
  assert.equal(hidden.attachments[0].documentoId, null);
  assert.equal(hidden.attachments[1].documentoId, "visible-document");
  assert.equal(visible.causa?.titulo, "Título vigente autorizado", "Never trust a relation object supplied by the caller");
  assert.equal(/hidden-case|hidden-document|RESERVED_SOURCE/.test(JSON.stringify([hidden, visible])), false);
  assert.equal(original.causaId, "hidden-case", "Projection never unlinks or rewrites the retained email");
  assert.equal(original.attachments[0].documentoId, "hidden-document");

  current = { ...actor, capabilityRevokes: "causa.read" };
  assert.equal((await currentMailActor(actor, client)).capabilityRevokes, "causa.read", "A stale caller does not undo current revocations");
  assert.equal((await publicMailboxMessages([{ ...original, causaId: "visible-case" }], actor, client))[0].causaId, null);
  assert.ok(caseQuery.includes("__none__"), "The live capability revocation is used in the database predicate");
  await assert.rejects(assertCausaMailAccess(actor, "visible-case", {}, client), (error: unknown) => (error as { status?: number }).status === 404);
  await assert.rejects(publicMailboxMessages([{ ...original, userId: "another-recipient" }], actor, client), (error: unknown) => (error as { status?: number }).status === 404);
  current = { ...actor, role: "cliente" };
  await assert.rejects(currentMailActor(actor, client), (error: unknown) => (error as { status?: number }).status === 403);
  console.log("mail access unit: original preserved, live actor, safe relations, document links and recipient ownership passed (no DB/network)");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
