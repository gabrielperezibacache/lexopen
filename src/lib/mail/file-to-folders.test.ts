import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  isArchivableAttachment,
  ingestCausaDocumentBuffer,
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
  if (!process.env.DATABASE_URL) {
    console.log("mail/file-to-folders.test.ts skip DB");
    return;
  }
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const email = `mail-file-${stamp}@estudio.cl`;
  const rit = "C-88001-2099";
  let userId = "";
  let causaId = "";
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
    const persisted = await persistInboundMessage(
      { id: user.id, role: "admin" },
      account.id,
      {
        externalId: `test-pjud-${stamp}`,
        subject: mime.subject,
        fromAddress: mime.fromAddress,
        receivedAt: new Date(),
        mime: fixture,
      }
    );
    assert.equal(persisted.created, true);
    const message = await prisma.mailboxMessage.findUnique({
      where: { id: persisted.message!.id },
      include: { attachments: true },
    });
    assert.equal(message?.status, "aplicado");
    assert.equal(message?.causaId, causaId);
    assert.ok(message?.attachments.some((a) => a.documentoId));
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
