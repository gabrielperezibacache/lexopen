/** PostgreSQL fixture for case updates, origin retention, pagination and live access. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { listCaseUpdates } from "./updates";

const httpStatus = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
const when = (day: number) => new Date(Date.UTC(2026, 9, day, 15));

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID();
  const userIds: string[] = [], caseIds: string[] = [], documentIds: string[] = [];

  try {
    async function addUser(name: string, role = "abogado") {
      const user = await prisma.user.create({ data: { name, role, email: `${tag}-${name}@novedades.invalid`, password: "fixture-no-login" } });
      userIds.push(user.id);
      return user;
    }
    const owner = await addUser("Titular");
    const colleague = await addUser("Colaborador", "asistente");
    const outsider = await addUser("Ajeno");
    async function addCase(titulo: string) {
      const cause = await prisma.causa.create({ data: { titulo, materia: "civil", tribunal: "Órgano ficticio", acceso: "equipo", abogadoId: owner.id } });
      caseIds.push(cause.id);
      return cause;
    }
    const cause = await addCase("Expediente ficticio");
    const different = await addCase("Otro expediente");
    const membership = await prisma.causaMiembro.create({ data: { causaId: cause.id, userId: colleague.id, rol: "colaborador", desde: new Date(0) } });

    async function addDoc(nombre: string, { key = `documentos/${tag}/${nombre}`, causaId = cause.id, day = 2, confidential = false, ruta }: {
      key?: string; causaId?: string; day?: number; confidential?: boolean; ruta?: string;
    } = {}) {
      const document = await prisma.documento.create({ data: {
        nombre, causaId, tipo: "resolucion", storageKey: key, autorId: owner.id,
        createdAt: when(day), extractionStatus: "pending", confidencial: confidential, ruta,
      } });
      documentIds.push(document.id);
      return document;
    }

    const secret = "Contenidos reservados de prueba";
    const combined = await addDoc("Resolución principal.pdf");
    const legacyManual = await addDoc("Carga histórica.pdf", { ruta: "correo/pjud" });
    const legacyMail = await addDoc("Correo histórico.pdf", { key: `correo/inbox/${tag}/legacy.pdf` });
    const confidential = await addDoc("Documento confidencial.pdf", { confidential: true, day: 19 });
    const other = await addDoc("Documento de otra causa.pdf", { causaId: different.id });
    const drive = await addDoc("Importado por otro medio.pdf", { key: `drive/${tag}/archivo.pdf`, ruta: "correo/pjud" });
    const legacyDrive = await addDoc("Revisión de Drive anterior.pdf", { key: `drive/${tag}/original.pdf` });
    const legacyOjv = await addDoc("Original judicial anterior.pdf", { key: `pjud/${tag}/original.pdf` });
    const [driveReceipt] = await Promise.all([
      prisma.driveDocumentImport.create({ data: {
        causaId: cause.id, documentoId: combined.id, folderId: "private-folder", driveFileId: `${tag}-connected`,
        driveVersion: "7", exportMimeType: "", sourceSha256: "a".repeat(64), importedAt: when(13),
      } }),
      prisma.driveDocumentImport.create({ data: {
        causaId: cause.id, documentoId: legacyDrive.id, folderId: "private-folder", driveFileId: `${tag}-legacy`,
        driveVersion: "6", exportMimeType: "", sourceSha256: "b".repeat(64), importedAt: when(2),
      } }),
    ]);
    const account = await prisma.mailboxAccount.create({ data: { userId: owner.id } });

    async function addMail(documentoId: string, day: number, receipt: boolean) {
      const message = await prisma.mailboxMessage.create({ data: {
        userId: owner.id, accountId: account.id, causaId: cause.id, status: "aplicado",
        receivedAt: when(day), subject: secret, bodyText: secret, fromAddress: "privado@example.invalid",
      } });
      const attachment = await prisma.mailboxAttachment.create({ data: {
        documentoId, messageId: message.id, filename: secret, sha256: "a".repeat(64),
      } });
      if (receipt) await prisma.caseDocumentIntake.create({ data: {
        causaId: cause.id, documentoId, source: "mail", sourceKey: attachment.id,
        mailboxAttachmentId: attachment.id, actorId: owner.id, sourceName: secret, receivedAt: when(day),
      } });
      return message;
    }
    const firstMail = await addMail(combined.id, 10, true);
    const secondMail = await addMail(combined.id, 12, true);
    const oldMail = await addMail(legacyMail.id, 2, false);
    const colleagueAccount = await prisma.mailboxAccount.create({ data: { userId: colleague.id } });
    const newNotice = (day: number, data: { userId?: string; accountId?: string; status?: string; causaId?: string } = {}) =>
      prisma.mailboxMessage.create({ data: {
        userId: owner.id, accountId: account.id, causaId: cause.id, status: "aplicado",
        receivedAt: when(day), subject: secret, bodyText: secret, fromAddress: "privado@example.invalid", ...data,
      } });
    const ownerNotice = await newNotice(11);
    const deletedAttachmentDocument = await addDoc("Adjunto eliminado del expediente.pdf");
    const deletedAttachmentNotice = await addMail(deletedAttachmentDocument.id, 9, true);
    await prisma.documento.delete({ where: { id: deletedAttachmentDocument.id } });
    const otherCaseAttachmentNotice = await addMail(other.id, 8, true);
    const ownColleagueNotice = await newNotice(14, { userId: colleague.id, accountId: colleagueAccount.id });
    const mismatch = await newNotice(17, { accountId: colleagueAccount.id });
    const pending = await newNotice(16, { status: "vinculado" });
    const otherCaseNotice = await newNotice(18, { causaId: different.id });
    await prisma.caseDocumentIntake.createMany({ data: [
      { causaId: cause.id, documentoId: combined.id, source: "manual", sourceKey: `${tag}-manual`, sourceName: secret, actorId: owner.id, receivedAt: when(2) },
      { causaId: cause.id, documentoId: combined.id, source: "drive", sourceKey: driveReceipt.id, sourceName: secret, actorId: owner.id, receivedAt: when(13) },
      { causaId: cause.id, documentoId: combined.id, source: "ojv", sourceKey: `${tag}-ojv`, sourceName: secret, actorId: owner.id, receivedAt: when(15) },
      { causaId: cause.id, documentoId: confidential.id, source: "manual", sourceKey: `${tag}-confidential`, sourceName: secret, receivedAt: when(19) },
      // Broken historical relation must not admit another matter's document into this one.
      { causaId: cause.id, documentoId: other.id, source: "manual", sourceKey: `${tag}-wrong-scope`, sourceName: secret, receivedAt: when(20) },
      { causaId: cause.id, documentoId: null, source: "manual", sourceKey: `${tag}-removed`, sourceName: secret, receivedAt: when(21) },
    ] });

    await prisma.documento.update({ where: { id: combined.id }, data: { version: 2 } });
    const visible = await listCaseUpdates(cause.id, owner);
    const visibleDocuments = visible.items.filter(item => item.kind === "document");
    assert.equal(visibleDocuments.filter(item => item.documentId === combined.id).length, 1);
    const update = visibleDocuments.find(item => item.documentId === combined.id);
    assert.ok(update);
    assert.equal(update.firstReceivedAt, when(2).toISOString());
    assert.equal(update.latestAt, when(15).toISOString());
    assert.equal(update.status, "pending");
    assert.equal(update.version, 2);
    assert.equal(update.hasOriginal, true);
    assert.deepEqual(update.origins, [
      { kind: "ojv", receivedAt: when(15).toISOString(), documentVersion: 1 },
      { kind: "drive", receivedAt: when(13).toISOString(), documentVersion: 1, sourceRevision: "7" },
      { kind: "mail", receivedAt: when(12).toISOString(), documentVersion: 1, mailHref: `/correo?id=${secondMail.id}` },
      { kind: "mail", receivedAt: when(10).toISOString(), documentVersion: 1, mailHref: `/correo?id=${firstMail.id}` },
      { kind: "manual", receivedAt: when(2).toISOString(), documentVersion: 1 },
    ]);
    assert.deepEqual(visibleDocuments.find(item => item.documentId === legacyManual.id)?.origins, [{ kind: "manual", receivedAt: when(2).toISOString(), documentVersion: 1 }]);
    assert.deepEqual(visibleDocuments.find(item => item.documentId === legacyMail.id)?.origins, [{ kind: "mail", receivedAt: when(2).toISOString(), documentVersion: 1, mailHref: `/correo?id=${oldMail.id}` }]);
    assert.deepEqual(visibleDocuments.find(item => item.documentId === legacyDrive.id)?.origins, [{ kind: "drive", receivedAt: when(2).toISOString(), documentVersion: 1, sourceRevision: "6" }]);
    assert.deepEqual(visibleDocuments.find(item => item.documentId === legacyOjv.id)?.origins, [{ kind: "ojv", receivedAt: when(2).toISOString(), documentVersion: 1 }]);
    assert.ok(!visibleDocuments.some(item => item.documentId === drive.id || item.documentId === other.id));
    assert.deepEqual(visible.items.filter(item => item.kind === "mail-notice"),
      [ownerNotice, deletedAttachmentNotice, otherCaseAttachmentNotice].map(message => ({
        kind: "mail-notice", messageId: message.id,
        latestAt: message.receivedAt.toISOString(), mailHref: `/correo?id=${message.id}`,
      })));
    for (const hidden of [mismatch, pending, otherCaseNotice, ownColleagueNotice]) assert.ok(!JSON.stringify(visible).includes(hidden.id));
    assert.equal(visible.nextBefore, null);
    assert.doesNotMatch(JSON.stringify(visible), /Contenidos reservados|privado@example\.invalid|correo\/inbox|sourceKey|private-folder/);

    const colleagueFeed = await listCaseUpdates(cause.id, colleague);
    const colleagueDocuments = colleagueFeed.items.filter(item => item.kind === "document");
    assert.deepEqual(colleagueDocuments.find(item => item.documentId === combined.id)?.origins, update.origins.map(origin => {
      const expected = { ...origin };
      delete expected.mailHref;
      return expected;
    }));
    assert.ok(!colleagueDocuments.some(item => item.documentId === confidential.id));
    assert.deepEqual(colleagueFeed.items.filter(item => item.kind === "mail-notice").map(item => item.messageId), [ownColleagueNotice.id]);
    for (const hidden of [firstMail, oldMail, ownerNotice]) assert.ok(!JSON.stringify(colleagueFeed).includes(hidden.id));
    await assert.rejects(listCaseUpdates(cause.id, { ...outsider, role: "admin" }), httpStatus(404));
    await assert.rejects(listCaseUpdates(cause.id, owner, { before: "bad-cursor" }), httpStatus(400));

    // Mix actual receipts and legacy rows at the exact same instant across the page boundary.
    const ties = await Promise.all(Array.from({ length: 23 }, (_, n) => addDoc(`Documento ${n}.pdf`, { day: 5 })));
    await prisma.caseDocumentIntake.createMany({ data: ties.slice(0, 12).map((doc, index) => ({
      causaId: cause.id, documentoId: doc.id, source: "manual", sourceKey: `${tag}-tie-${index}`, sourceName: doc.nombre, receivedAt: when(5),
    })) });
    const mailTies = await Promise.all(Array.from({ length: 23 }, () => newNotice(5)));
    const firstPage = await listCaseUpdates(cause.id, owner);
    assert.equal(firstPage.items.length, 20);
    assert.match(firstPage.nextBefore ?? "", /~d~/);
    const secondPage = await listCaseUpdates(cause.id, owner, { before: firstPage.nextBefore });
    assert.equal(secondPage.items.length, 20);
    assert.match(secondPage.nextBefore ?? "", /~m~/);
    const thirdPage = await listCaseUpdates(cause.id, owner, { before: secondPage.nextBefore });
    assert.equal(thirdPage.nextBefore, null);
    const combinedPages = [...firstPage.items, ...secondPage.items, ...thirdPage.items].map(item => item.kind === "document" ? item.documentId : item.messageId);
    assert.equal(new Set(combinedPages).size, combinedPages.length);
    assert.deepEqual(combinedPages, [
      confidential.id, combined.id, ownerNotice.id, deletedAttachmentNotice.id, otherCaseAttachmentNotice.id, ...ties.map(doc => doc.id).sort().reverse(),
      ...mailTies.map(mail => mail.id).sort().reverse(),
      ...[legacyManual.id, legacyMail.id, legacyDrive.id, legacyOjv.id].sort().reverse(),
    ]);

    await prisma.causaMiembro.delete({ where: { id: membership.id } });
    await assert.rejects(listCaseUpdates(cause.id, colleague), httpStatus(404));
    console.log("Novedades: four sources on one document, Drive revisions, private mail, legacy rows, revoked access and mixed pagination passed.");
  } finally {
    await prisma.documento.deleteMany({ where: { id: { in: documentIds } } });
    await prisma.causa.deleteMany({ where: { id: { in: caseIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
