/** Synthetic, fixture-scoped PostgreSQL/HTTP regression. No mailbox provider or file writes. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request, type APIRequestContext } from "@playwright/test";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { hashPassword } from "@/lib/auth/password";
import { assertCausaMailAccess, publicMailboxMessages } from "./access";
import { applyMailboxMessage, linkMailboxMessage } from "./apply";
import { fileMailboxMessageToCausa } from "./file-to-folders";
import { listCausasForMail, persistInboundMessage } from "./ingest";

const status = (expected: number) => (error: unknown) => (error as { status?: number }).status === expected;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(new URL(process.env.DATABASE_URL!).toString(), url);
  const tag = `mail-acl-${randomUUID()}`, ids = [`${tag}-owner`, `${tag}-recipient`], causes: string[] = [];
  const password = "fictitious-mail-access-password", originalFetch = globalThis.fetch;
  const http: APIRequestContext[] = [];
  globalThis.fetch = (async () => { throw new Error("Mail ACL fixture must not contact any provider"); }) as typeof fetch;
  try {
    const hash = await hashPassword(password);
    const owner = await prisma.user.create({ data: { id: ids[0], email: `${ids[0]}@example.invalid`, name: "Synthetic mail owner", role: "abogado", password: hash } });
    const recipient = await prisma.user.create({ data: { id: ids[1], email: `${ids[1]}@example.invalid`, name: "Synthetic mail recipient", role: "abogado", password: hash } });
    const rit = `C-${10000 + Number.parseInt(randomUUID().slice(0, 4), 16) % 80000}-2099`;
    const matter = await prisma.causa.create({ data: { titulo: `RESERVED_MATTER_TITLE_${tag}`, rit, tribunal: "RESERVED_TRIBUNAL", materia: "civil", acceso: "equipo", abogadoId: owner.id, resumen: `RESERVED_MATTER_NOTE_${tag}` } }); causes.push(matter.id);
    const unassigned = await prisma.causa.create({ data: { titulo: `UNASSIGNED_PRIVATE_${tag}`, rit: `D-${rit.slice(2)}`, tribunal: "Fixture", materia: "civil", acceso: "equipo" } }); causes.push(unassigned.id);
    const account = await prisma.mailboxAccount.create({ data: { userId: recipient.id } });
    const ownerAccount = await prisma.mailboxAccount.create({ data: { userId: owner.id } });
    const original = { subject: "Asunto original recibido", bodyText: "Resolución: Contenido ficticio que pertenece al destinatario.", rit: "C-1-2098", tribunal: "Tribunal escrito en el propio email" };
    const message = await prisma.mailboxMessage.create({ data: { ...original, userId: recipient.id, accountId: account.id, receivedAt: new Date(), kind: "resolucion", causaId: matter.id } });
    const ownOwnerMessage = await prisma.mailboxMessage.create({ data: { ...original, userId: owner.id, accountId: ownerAccount.id, receivedAt: new Date(), causaId: matter.id } });
    const doc = await prisma.documento.create({ data: { nombre: "Documento derivado", causaId: matter.id, contenido: `RESERVED_DOCUMENT_BODY_${tag}` } });
    const privileged = await prisma.documento.create({ data: { nombre: "Documento privilegiado", causaId: matter.id, privilegio: true } });
    const foreignDoc = await prisma.documento.create({ data: { nombre: "Documento de otro expediente", causaId: unassigned.id } });
    for (const [index, document] of [doc, privileged, foreignDoc].entries()) await prisma.mailboxAttachment.create({ data: { messageId: message.id, filename: `original-${index}.pdf`, mimeType: "application/pdf", sha256: `fixture-${index}`, sizeBytes: 123, documentoId: document.id } });
    const read = async () => {
      const rows = await prisma.mailboxMessage.findMany({ where: { userId: recipient.id, id: message.id }, include: { causa: true, attachments: true } });
      return (await publicMailboxMessages(rows, recipient))[0];
    };
    const assertHidden = (view: Awaited<ReturnType<typeof read>>) => {
      assert.equal(view.causaId, null); assert.equal(view.causa, null);
      assert.ok(view.attachments.every(attachment => attachment.documentoId === null));
      assert.equal(view.bodyText, original.bodyText); assert.equal(view.subject, original.subject);
      assert.equal(view.rit, original.rit); assert.equal(view.tribunal, original.tribunal);
      assert.deepEqual(view.attachments.map(attachment => attachment.filename).sort(), ["original-0.pdf", "original-1.pdf", "original-2.pdf"]);
      const serialized = JSON.stringify(view);
      for (const reserved of [matter.id, matter.titulo, matter.rit!, matter.resumen!, doc.id, privileged.id, foreignDoc.id, doc.contenido!]) assert.equal(serialized.includes(reserved), false);
    };
    assertHidden(await read());
    assert.ok(!(await listCausasForMail(recipient)).some(cause => causes.includes(cause.id)), "An unassigned private matter is not public");
    await assert.rejects(linkMailboxMessage(recipient, message.id, matter.id), status(404));
    await assert.rejects(fileMailboxMessageToCausa(recipient, message.id, matter.id), status(404));
    await assert.rejects(publicMailboxMessages([ownOwnerMessage], recipient), status(404));

    const membership = await prisma.causaMiembro.create({ data: { causaId: matter.id, userId: recipient.id, rol: "lectura", desde: new Date(Date.now() + 86_400_000) } });
    assertHidden(await read());
    await prisma.causaMiembro.update({ where: { id: membership.id }, data: { desde: new Date(Date.now() - 172_800_000), hasta: new Date(Date.now() - 86_400_000) } });
    assertHidden(await read());
    await prisma.causaMiembro.update({ where: { id: membership.id }, data: { desde: new Date(Date.now() - 86_400_000), hasta: null } });
    assert.ok((await listCausasForMail(recipient)).some(cause => cause.id === matter.id), "An active member can select a cause assigned to another lawyer");
    assert.equal((await linkMailboxMessage(recipient, message.id, matter.id)).causaId, matter.id);
    await assert.rejects(applyMailboxMessage(recipient, message.id), status(403));
    assert.equal(await prisma.causaMovimiento.count({ where: { causaId: matter.id } }), 0);
    await prisma.causaMiembro.update({ where: { id: membership.id }, data: { rol: "colaborador" } });
    assert.equal((await applyMailboxMessage(recipient, message.id)).status, "aplicado");
    assert.equal(await prisma.causaMovimiento.count({ where: { causaId: matter.id } }), 1);
    await prisma.user.update({ where: { id: recipient.id }, data: { capabilityRevokes: "doc.privileged.read" } });
    const flagged = await read();
    assert.equal(flagged.causaId, matter.id); assert.equal(flagged.attachments.find(attachment => attachment.filename === "original-0.pdf")?.documentoId, doc.id);
    assert.equal(flagged.attachments.find(attachment => attachment.filename === "original-1.pdf")?.documentoId, null);
    assert.equal(flagged.attachments.find(attachment => attachment.filename === "original-2.pdf")?.documentoId, null);
    await prisma.user.update({ where: { id: recipient.id }, data: { capabilityRevokes: "causa.write" } });
    await assert.rejects(fileMailboxMessageToCausa(recipient, message.id, matter.id), status(403));
    await prisma.user.update({ where: { id: recipient.id }, data: { capabilityRevokes: "causa.read" } });
    assertHidden(await read());
    assert.equal((await listCausasForMail(recipient)).length, 0, "The cached actor must not override a live revocation");
    await prisma.causaMiembro.delete({ where: { id: membership.id } });
    await prisma.user.update({ where: { id: recipient.id }, data: { role: "admin", capabilityRevokes: "" } });
    assertHidden(await read());
    assert.ok(!(await listCausasForMail(recipient)).some(cause => causes.includes(cause.id)), "Technical admin alone does not override the wall");
    await prisma.user.update({ where: { id: recipient.id }, data: { capabilityGrants: "causa.override_walls" } });
    assert.ok((await listCausasForMail(recipient)).some(cause => cause.id === unassigned.id));
    await prisma.user.update({ where: { id: recipient.id }, data: { role: "abogado", capabilityGrants: "" } });
    const inbound = await persistInboundMessage(recipient, account.id, { externalId: tag, subject: `Notificación ${unassigned.rit}`, receivedAt: new Date(), mime: Buffer.from(`Subject: Notificación ${unassigned.rit}\n\nTexto recibido por su destinatario.`) }, { requirePjudSender: false });
    assert.equal(inbound.message?.causaId, null, "An inaccessible RIT never auto-associates or files");

    if (process.env.E2E_BASE_URL) {
      assert.equal(process.env.LEXOPEN_E2E, "1");
      const base = new URL(process.env.E2E_BASE_URL);
      assert.ok(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) && !base.username && !base.password);
      const context = await request.newContext({ baseURL: base.origin, extraHTTPHeaders: { Origin: base.origin } }); http.push(context);
      const login = await context.post("/api/auth/login", { data: { email: recipient.email, password } }); assert.equal(login.status(), 200);
      const list = await context.get("/api/mail"); assert.equal(list.status(), 200); const listData = await list.json();
      assertHidden(listData.messages.find((row: { id: string }) => row.id === message.id));
      assert.ok(!listData.causas.some((row: { id: string }) => causes.includes(row.id)));
      const detail = await context.get(`/api/mail/messages/${message.id}`); assert.equal(detail.status(), 200); assertHidden((await detail.json()).message);
      assert.equal((await context.get(`/api/mail/messages/${ownOwnerMessage.id}`)).status(), 404);
      const discard = await context.post(`/api/mail/messages/${message.id}`, { data: { action: "discard" } }); assert.equal(discard.status(), 200);
      const discarded = (await discard.json()).message; assert.equal(discarded.causaId, null); assert.equal(discarded.bodyText, original.bodyText);
      const denied = await context.post(`/api/mail/messages/${message.id}`, { data: { action: "link", causaId: matter.id } }); assert.equal(denied.status(), 404);
    }
    const retained = await prisma.mailboxMessage.findUniqueOrThrow({ where: { id: message.id }, include: { attachments: true } });
    assert.equal(retained.bodyText, original.bodyText); assert.equal(retained.causaId, matter.id);
    assert.ok(retained.attachments.some(attachment => attachment.documentoId === doc.id), "Hiding a relation never deletes an email, attachment or association");
    await prisma.user.update({ where: { id: recipient.id }, data: { capabilityGrants: "causa.override_walls" } });
    await prisma.causa.update({ where: { id: matter.id }, data: { estado: "archivada" } });
    assert.ok(!(await listCausasForMail(recipient)).some(cause => cause.id === matter.id));
    await assert.rejects(assertCausaMailAccess(recipient, matter.id), status(404));
    console.log(`mail access PostgreSQL${http.length ? "+HTTP" : ""}: owner/member/excluded/future/expired/revoked/admin, guarded filing, original retention and safe serialized metadata passed; no provider/filesystem writes`);
  } finally {
    globalThis.fetch = originalFetch;
    for (const context of http) await context.dispose();
    await prisma.mailboxMessage.deleteMany({ where: { userId: { in: ids } } });
    await prisma.mailboxAccount.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.causa.deleteMany({ where: { id: { in: causes } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
