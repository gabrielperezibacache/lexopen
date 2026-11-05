import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { getObject } from "@/lib/storage";
import {
  isArchivableAttachment,
  ingestCausaDocumentBuffer,
  fileMailboxMessageToCausa,
} from "@/lib/mail/file-to-folders";
import { parseMimeBuffer } from "@/lib/mail/mime";

const tiny = Buffer.from("hello", "utf8");
assert.equal(isArchivableAttachment({ content: tiny, mimeType: "application/pdf" }), false);

const pdf = Buffer.concat([
  Buffer.from("%PDF-1.4\n"),
  Buffer.alloc(120, 0x20),
  Buffer.from("\n%%EOF\n"),
]);
assert.equal(isArchivableAttachment({ content: pdf, mimeType: "application/pdf" }), true);

const office = Buffer.alloc(200, 7);
assert.equal(
  isArchivableAttachment({
    content: office,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }),
  true
);

async function runDb() {
  if (!process.env.E2E_DATABASE_URL) {
    console.log("mail/file-to-folders.test.ts skip DB");
    return;
  }
  const fixtureUrl = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(new URL(process.env.DATABASE_URL!).toString(), fixtureUrl);
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const email = `mail-file-${stamp}@estudio.cl`;
  const rit = "C-88001-2099";
  let userId = "";
  let causaId = "";
  const extraCauses: string[] = [];
  try {
    const user = await prisma.user.create({
      data: {
        email,
        name: "Mail file test",
        role: "admin",
        password: "x",
      },
    });
    userId = user.id;
    const causa = await prisma.causa.create({
      data: {
        titulo: "Causa correo test",
        rit,
        tribunal: "1º Juzgado Civil de Santiago",
        materia: "civil",
        abogadoId: user.id,
      },
    });
    causaId = causa.id;
    const otherCourt = await prisma.causa.create({ data: {
      titulo: "Mismo RIT, otro tribunal", rit, tribunal: "2º Juzgado Civil de Santiago", materia: "civil", abogadoId: user.id,
    } });
    extraCauses.push(otherCourt.id);
    const userFolder = await prisma.caseDocumentFolder.create({ data: { causaId, name: "Correo PJUD" } });
    await prisma.site.create({
      data: {
        name: "Espacio correo test",
        slug: `correo-test-${stamp}`,
        causaId: causa.id,
      },
    });
    const fixture = readFileSync(
      path.join(process.cwd(), "src/lib/mail/fixtures/pjud-notice.eml")
    );
    const mime = await parseMimeBuffer(fixture);
    const att = mime.attachments[0];
    assert.ok(att);
    const doc = await ingestCausaDocumentBuffer({
      causaId,
      bytes: att.content,
      filename: att.filename,
      mimeHint: att.mimeType,
    });
    assert.ok(doc);
    assert.equal(doc.ruta, "correo/pjud");
    assert.equal(doc.tipo, "notificacion");

    const { persistInboundMessage, ensureMailboxAccount } = await import(
      "@/lib/mail/ingest"
    );
    const account = await ensureMailboxAccount(user.id);
    const actor = { id: user.id, role: "admin" };
    const raw = { externalId: `test-pjud-${stamp}`, subject: mime.subject, fromAddress: mime.fromAddress, receivedAt: new Date(), mime: fixture };
    const attempts = await Promise.all([persistInboundMessage(actor, account.id, raw), persistInboundMessage(actor, account.id, raw)]);
    assert.equal(attempts.filter(result => result.created).length, 1);
    const persisted = attempts.find(result => result.created)!;
    const message = await prisma.mailboxMessage.findUnique({
      where: { id: persisted.message!.id },
      include: { attachments: true },
    });
    assert.equal(message?.status, "aplicado");
    assert.equal(message?.causaId, causaId);
    assert.equal(message?.attachments.length, 1);
    const archivedId = message?.attachments[0]?.documentoId;
    assert.ok(archivedId);
    const archived = await prisma.documento.findUniqueOrThrow({ where: { id: archivedId }, include: { archivePlacement: { include: { folder: true } } } });
    assert.equal(archived.ruta, "correo/pjud");
    assert.equal(archived.archivePlacement?.folder.name, "Correo PJUD (2)");
    assert.notEqual(archived.archivePlacement?.folderId, userFolder.id);
    assert.deepEqual(await getObject(archived.storageKey!), att.content);
    assert.equal((await persistInboundMessage(actor, account.id, raw)).created, false);
    assert.equal(await prisma.caseDocumentPlacement.count({ where: { folderId: archived.archivePlacement!.folderId } }), 1);
    assert.equal(await prisma.causaMovimiento.count({ where: { causaId, externalId: raw.externalId } }), 1);
    const mov = await prisma.causaMovimiento.findFirst({
      where: { causaId, tipo: "resolucion" },
    });
    assert.ok(mov);
    const folder = await prisma.folder.findFirst({
      where: { name: "Correo PJUD", site: { causaId } },
    });
    assert.ok(folder);
    const siteFile = await prisma.siteFile.findFirst({
      where: { folderId: folder.id },
    });
    assert.ok(siteFile);

    const missingCourt = await persistInboundMessage(actor, account.id, {
      ...raw, externalId: `${raw.externalId}-no-court`, mime: Buffer.from(fixture.toString("utf8").replace(/^Tribunal:[^\r\n]+\r?\n/m, "")),
    });
    assert.equal(missingCourt.message?.status, "nuevo");
    assert.equal(missingCourt.message?.causaId, null);
    const unfiled = await prisma.mailboxAttachment.findFirst({ where: { messageId: missingCourt.message!.id } });
    assert.equal(unfiled?.documentoId, null);
    assert.deepEqual(await getObject(unfiled!.storageKey!), att.content);

    const hearing = await persistInboundMessage(actor, account.id, {
      ...raw, externalId: `${raw.externalId}-hearing`, mime: Buffer.from(`From: avisos@pjud.cl\nSubject: Audiencia ${rit}\n\nTribunal: 1º Juzgado Civil de Santiago\nAudiencia el 2099-12-15`),
    });
    assert.equal(hearing.message?.status, "aplicado");
    assert.equal((await prisma.causaMovimiento.findUnique({ where: { causaId_externalId: { causaId, externalId: `${raw.externalId}-hearing` } } }))?.tipo, "audiencia");
    assert.equal((await prisma.causa.findUniqueOrThrow({ where: { id: causaId } })).proximaTabla, null, "automatic mail filing does not set the case hearing date");

    const manualHearing = await persistInboundMessage(actor, account.id, {
      ...raw, externalId: `${raw.externalId}-manual-hearing`, mime: Buffer.from(`From: avisos@pjud.cl\nSubject: Audiencia ${rit}\n\nAudiencia el 2099-12-16`),
    });
    assert.equal(manualHearing.message?.status, "nuevo");
    await fileMailboxMessageToCausa(actor, manualHearing.message!.id, causaId);
    assert.equal((await prisma.causa.findUniqueOrThrow({ where: { id: causaId } })).proximaTabla?.toISOString(), new Date(2099, 11, 16).toISOString(), "manual filing retains the existing hearing date operation");

    const hiddenDuplicate = await prisma.causa.create({ data: {
      titulo: "Coincidencia reservada", rit, tribunal: causa.tribunal, materia: "civil", acceso: "equipo",
    } });
    extraCauses.push(hiddenDuplicate.id);
    const ambiguous = await persistInboundMessage(actor, account.id, { ...raw, externalId: `${raw.externalId}-ambiguous` });
    assert.equal(ambiguous.message?.status, "nuevo");
    assert.equal(ambiguous.message?.causaId, null);
    assert.equal(await prisma.causaMovimiento.count({ where: { causaId, externalId: `${raw.externalId}-ambiguous` } }), 0);
  } finally {
    if (causaId) {
      await prisma.siteFile.deleteMany({
        where: { site: { causaId } },
      });
      await prisma.folder.deleteMany({ where: { site: { causaId } } });
      await prisma.site.deleteMany({ where: { causaId } });
      await prisma.documento.deleteMany({ where: { causaId } });
      await prisma.causaMovimiento.deleteMany({ where: { causaId } });
      await prisma.mailboxMessage.deleteMany({ where: { causaId } });
      await prisma.causa.delete({ where: { id: causaId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.mailboxAttachment.deleteMany({
        where: { message: { userId } },
      });
      await prisma.mailboxMessage.deleteMany({ where: { userId } });
      await prisma.mailboxAccount.deleteMany({ where: { userId } });
      await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    if (extraCauses.length) await prisma.causa.deleteMany({ where: { id: { in: extraCauses } } });
    await prisma.$disconnect();
  }
}

runDb()
  .then(() => {
    console.log("mail/file-to-folders.test.ts OK");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
