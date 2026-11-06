import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/evidence/fragments";
import { fileMailboxMessageToCausa } from "@/lib/mail/file-to-folders";
import { getObject, putObject } from "@/lib/storage";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { ingestManualCaseDocument } from "./document-intake";

const status = (expected: number) => (error: unknown) => (error as { status?: number }).status === expected;
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n${" ".repeat(180)}\n${label}\n%%EOF\n`);

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  assert.ok(![process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean));
  const storage = await mkdtemp(path.join(tmpdir(), "lexopen-document-intake-"));
  const previousStorage = process.env.STORAGE_PATH;
  process.env.STORAGE_PATH = storage;
  const tag = randomUUID(), cases: string[] = [], users: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External requests are outside this fixture"); };

  try {
    const owner = await prisma.user.create({ data: { name: "Titular ficticio", role: "abogado", email: `${tag}-owner@example.invalid`, password: "fixture" } });
    const outsider = await prisma.user.create({ data: { name: "Profesional externo a la causa", role: "abogado", email: `${tag}-outside@example.invalid`, password: "fixture" } });
    users.push(owner.id, outsider.id);
    const account = await prisma.mailboxAccount.create({ data: { userId: owner.id } });
    async function createCase() {
      const causa = await prisma.causa.create({ data: { titulo: "Causa ficticia", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } });
      cases.push(causa.id);
      return causa.id;
    }
    const input = (causaId: string, nombre = "Manual.pdf") => ({ causaId, nombre, tipo: "resolucion", contenido: null, mimeType: "application/pdf", ruta: null, extractionStatus: "pending", clienteId: null, confidencial: false, privilegio: false });
    async function prepareMail(bytes: Buffer, filename = "Recibido.pdf") {
      const externalId = randomUUID();
      const storageKey = `fixture-mail/${externalId}`;
      const receivedAt = new Date("2099-05-06T10:30:00Z");
      await putObject({ key: storageKey, body: bytes, contentType: "application/pdf" });
      return prisma.mailboxMessage.create({
        data: { userId: owner.id, accountId: account.id, externalId, subject: "Correo ficticio", receivedAt, bodyText: "Texto de prueba", attachments: { create: { filename, storageKey, mimeType: "application/pdf", sizeBytes: bytes.length, sha256: sha256(bytes) } } },
        include: { attachments: true },
      });
    }
    const caseId = await createCase(), manualBytes = pdf("manual-first"), upload = input(caseId);
    const manual = await ingestManualCaseDocument(upload, manualBytes, owner);
    assert.equal(manual.reused, false);
    assert.equal((await ingestManualCaseDocument(upload, manualBytes, owner)).reused, true);
    const placement = await prisma.caseDocumentFolder.create({ data: { causaId: caseId, name: "Carpeta elegida" } });
    await prisma.caseDocumentPlacement.create({ data: { documentoId: manual.doc.id, folderId: placement.id } });
    const mail = await prepareMail(manualBytes);
    await fileMailboxMessageToCausa(owner, mail.id, caseId);
    await fileMailboxMessageToCausa(owner, mail.id, caseId);
    const originals = await prisma.caseDocumentIntake.findMany({ where: { causaId: caseId }, orderBy: { source: "asc" } });
    assert.equal(await prisma.documento.count({ where: { causaId: caseId } }), 1);
    assert.deepEqual(originals.map(({ source, sourceName, documentoId }) => [source, sourceName, documentoId]), [
      ["mail", "Recibido.pdf", manual.doc.id], ["manual", "Manual.pdf", manual.doc.id],
    ]);
    assert.equal(originals[0].receivedAt.toISOString(), mail.receivedAt.toISOString());
    assert.equal(originals[0].mailboxAttachmentId, mail.attachments[0].id);
    assert.equal((await prisma.mailboxAttachment.findUniqueOrThrow({ where: { id: mail.attachments[0].id } })).documentoId, manual.doc.id);
    assert.equal((await prisma.caseDocumentPlacement.findUniqueOrThrow({ where: { documentoId: manual.doc.id } })).folderId, placement.id);
    assert.deepEqual(await getObject(originals[0].storageKey!), manualBytes);
    assert.equal(await prisma.activity.count({ where: { causaId: caseId, tipo: "documento" } }), 1);
    assert.notEqual((await ingestManualCaseDocument(upload, pdf("same name, other bytes"), owner)).doc.id, manual.doc.id);
    assert.notEqual((await ingestManualCaseDocument({ ...upload, confidencial: true }, manualBytes, owner)).doc.id, manual.doc.id);
    await assert.rejects(ingestManualCaseDocument(upload, manualBytes, outsider), status(404));
    await assert.rejects(fileMailboxMessageToCausa(outsider, mail.id, caseId), status(404));
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "causa.write" } });
    await assert.rejects(ingestManualCaseDocument(upload, manualBytes, owner), status(403));
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });

    const second = await createCase(), otherBytes = pdf("mail-first");
    const firstMail = await prepareMail(otherBytes);
    await fileMailboxMessageToCausa(owner, firstMail.id, second);
    const stored = await prisma.mailboxAttachment.findUniqueOrThrow({ where: { id: firstMail.attachments[0].id } });
    assert.ok(stored.documentoId);
    const reused = await ingestManualCaseDocument(input(second), otherBytes, owner);
    assert.equal(reused.doc.id, stored.documentoId);
    assert.equal(reused.reused, true);
    assert.equal(await prisma.documento.count({ where: { causaId: second } }), 1);
    assert.equal(await prisma.caseDocumentIntake.count({ where: { causaId: second } }), 2);
    await prisma.documento.update({ where: { id: reused.doc.id }, data: { version: 2 } });
    await assert.rejects(ingestManualCaseDocument(input(second), otherBytes, owner), status(409));
    const newMail = await prepareMail(otherBytes);
    await fileMailboxMessageToCausa(owner, newMail.id, second);
    assert.equal(await prisma.documento.count({ where: { causaId: second } }), 2, "An explicit later version is not coalesced");

    const third = await createCase(), concurrentBytes = pdf("concurrent");
    const concurrentMail = await prepareMail(concurrentBytes);
    const attempts = await Promise.all([
      ingestManualCaseDocument(input(third), concurrentBytes, owner),
      ingestManualCaseDocument(input(third), concurrentBytes, owner),
      fileMailboxMessageToCausa(owner, concurrentMail.id, third),
    ]);
    assert.equal(attempts[0].doc.id, attempts[1].doc.id);
    assert.equal(await prisma.documento.count({ where: { causaId: third } }), 1);
    assert.equal(await prisma.caseDocumentIntake.count({ where: { causaId: third } }), 2);
    const manualStorage = await readdir(path.join(storage, "documentos/case-intake-attempt"));
    assert.equal(manualStorage.length, await prisma.documento.count({ where: { causaId: { in: cases }, storageKey: { startsWith: "documentos/case-intake-attempt/" } } }), "Losing writes clean up their isolated staging blob");

    const legacy = await createCase(), legacyBytes = pdf("legacy"), digest = sha256(legacyBytes);
    const legacyStorage = "documentos/legacy.pdf";
    await putObject({ key: legacyStorage, body: legacyBytes });
    const legacyDoc = await prisma.documento.create({ data: {
      ...input(legacy, "Antiguo.pdf"), autorId: owner.id, storageKey: legacyStorage,
    } });
    const snapshotKey = `evidence/${legacyDoc.id}/${digest}`;
    await putObject({ key: snapshotKey, body: legacyBytes });
    await prisma.documentResource.create({ data: { documentoId: legacyDoc.id, versions: { create: {
      sourceSha256: digest, textSha256: sha256("Texto"), sourceRevision: `1:${legacyDoc.updatedAt.toISOString()}`,
      extractorVersion: "fixture", sourceName: legacyDoc.nombre, sourceStorageKey: snapshotKey, extractedText: "Texto", extractionStatus: "completed",
    } } } });
    const legacyMessage = await prepareMail(legacyBytes);
    await fileMailboxMessageToCausa(owner, legacyMessage.id, legacy);
    const legacyReceipt = await prisma.caseDocumentIntake.findFirstOrThrow({ where: { causaId: legacy, source: "manual" } });
    assert.equal(legacyReceipt.documentoId, legacyDoc.id);
    assert.equal(legacyReceipt.receivedAt.toISOString(), legacyDoc.createdAt.toISOString());
    assert.equal(await prisma.documento.count({ where: { causaId: legacy } }), 1);
    assert.equal(await prisma.caseDocumentIntake.count({ where: { causaId: legacy } }), 2);

    const damaged = await createCase(), original = pdf("original");
    const damagedDoc = await ingestManualCaseDocument(input(damaged), original, owner);
    const damagedReceipt = await prisma.caseDocumentIntake.findFirstOrThrow({ where: { causaId: damaged } });
    const changedBytes = pdf("tampered");
    await putObject({ key: damagedReceipt.storageKey!, body: changedBytes });
    await assert.rejects(ingestManualCaseDocument(input(damaged), original, owner), status(409));
    const verifiedMail = await prepareMail(original);
    await fileMailboxMessageToCausa(owner, verifiedMail.id, damaged);
    const verifiedAttachment = await prisma.mailboxAttachment.findUniqueOrThrow({ where: { id: verifiedMail.attachments[0].id } });
    assert.notEqual(verifiedAttachment.documentoId, damagedDoc.doc.id);
    assert.deepEqual(await getObject(damagedReceipt.storageKey!), changedBytes, "The new original does not overwrite the suspect one");

    await prisma.documento.delete({ where: { id: manual.doc.id } });
    await assert.rejects(ingestManualCaseDocument(upload, manualBytes, owner), status(409));
    assert.equal(await prisma.caseDocumentIntake.count({ where: { causaId: caseId, documentoId: null } }), 2);
    console.log("Case document intake passed both orders, concurrent deduplication, scope and versions, legacy source, and repeat protection.");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.mailboxMessage.deleteMany({ where: { userId: { in: users } } });
    await prisma.documento.deleteMany({ where: { causaId: { in: cases } } });
    await prisma.activity.deleteMany({ where: { causaId: { in: cases } } });
    await prisma.causa.deleteMany({ where: { id: { in: cases } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (previousStorage === undefined) delete process.env.STORAGE_PATH;
    else process.env.STORAGE_PATH = previousStorage;
    await rm(storage, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
