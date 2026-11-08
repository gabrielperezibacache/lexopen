import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { createClienteCommand } from "./commands";
import { clienteListInclude } from "./list";

const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), userIds: string[] = [], caseIds: string[] = [];
  try {
    async function user(role: string) {
      const row = await prisma.user.create({ data: { name: "CRM fixture", role, email: `${randomUUID()}@crm-fixture.invalid`, password: "no-login" } });
      userIds.push(row.id); return row;
    }
    const owner = await user("abogado"), outsider = await user("abogado"), assistant = await user("asistente"), portal = await user("cliente");
    const client = await createClienteCommand(owner, { razonSocial: `${tag}-directory` }, randomUUID());
    const hidden = await prisma.causa.create({ data: { titulo: tag, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id, clienteId: client.id } });
    const visible = await prisma.causa.create({ data: { titulo: tag, tribunal: "Fixture", materia: "civil", acceso: "estudio", abogadoId: owner.id, clienteId: client.id } });
    caseIds.push(hidden.id, visible.id);
    await prisma.documento.createMany({ data: [
      { nombre: tag, clienteId: client.id, causaId: hidden.id, autorId: owner.id },
      { nombre: tag, clienteId: client.id, causaId: visible.id, autorId: owner.id },
      { nombre: tag, clienteId: client.id, causaId: visible.id, autorId: owner.id, privilegio: true },
      { nombre: tag, clienteId: client.id, causaId: visible.id, autorId: owner.id, confidencial: true },
    ] });
    await prisma.tramite.createMany({ data: [
      { titulo: tag, causaId: hidden.id, estado: "pendiente" },
      { titulo: tag, causaId: visible.id, estado: "pendiente" },
      { titulo: tag, causaId: visible.id, estado: "hecho" },
    ] });
    async function counts(actor: typeof owner) {
      const row = await prisma.cliente.findUniqueOrThrow({ where: { id: client.id }, include: clienteListInclude(actor) });
      return { causas: row._count.causas, documentos: row._count.documentos, pendientes: row.causas.reduce((sum, cause) => sum + cause._count.tramites, 0) };
    }
    assert.equal(await prisma.causa.count({ where: { id: hidden.id, ...causaAccessWhere(outsider) } }), 0);
    assert.deepEqual(await counts(owner), { causas: 2, documentos: 4, pendientes: 2 });
    assert.deepEqual(await counts(outsider), { causas: 1, documentos: 2, pendientes: 1 });
    assert.deepEqual(await counts(assistant), { causas: 1, documentos: 1, pendientes: 1 });
    const membership = await prisma.causaMiembro.create({ data: { causaId: hidden.id, userId: outsider.id, rol: "lectura" } });
    assert.deepEqual(await counts(outsider), { causas: 2, documentos: 3, pendientes: 2 });
    await prisma.causaMiembro.delete({ where: { id: membership.id } });
    assert.deepEqual(await counts(outsider), { causas: 1, documentos: 2, pendientes: 1 });

    const input = { razonSocial: `${tag}-concurrent`, email: "fictitious@example.invalid" }, key = randomUUID();
    const concurrent = await Promise.all(Array.from({ length: 3 }, () => createClienteCommand(owner, input, key)));
    assert.equal(new Set(concurrent.map(row => row.id)).size, 1);
    assert.equal(await prisma.cliente.count({ where: { razonSocial: input.razonSocial } }), 1);
    assert.equal(await prisma.auditEvent.count({ where: { actorId: owner.id, action: "cliente.create", entityId: concurrent[0].id } }), 1);
    assert.equal((await createClienteCommand(owner, input, key)).id, concurrent[0].id);
    await assert.rejects(createClienteCommand(owner, { ...input, razonSocial: `${tag}-changed` }, key), status(409));
    await assert.rejects(createClienteCommand(portal, input, randomUUID()), status(403));

    const rollbackInput = { razonSocial: `${tag}-rollback` }, rollbackKey = randomUUID();
    const receiptCount = await prisma.commandExecution.count({ where: { ownerId: owner.id } });
    await withRejectedAudit(owner.id, "cliente.create", async () => {
      for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(createClienteCommand(owner, rollbackInput, rollbackKey), status(500));
      assert.equal(await prisma.cliente.count({ where: { razonSocial: rollbackInput.razonSocial } }), 0);
      assert.equal(await prisma.commandExecution.count({ where: { ownerId: owner.id } }), receiptCount);
    });
    const recovered = await createClienteCommand(owner, rollbackInput, rollbackKey);
    assert.equal((await createClienteCommand(owner, rollbackInput, rollbackKey)).id, recovered.id);
    assert.equal(await prisma.cliente.count({ where: { razonSocial: rollbackInput.razonSocial } }), 1);

    await prisma.user.update({ where: { id: owner.id }, data: { role: "cliente" } });
    await assert.rejects(createClienteCommand(owner, input, key), status(403));
    await prisma.user.update({ where: { id: owner.id }, data: { role: "abogado", sessionVersion: { increment: 1 } } });
    await assert.rejects(createClienteCommand(owner, input, key), status(401));
    console.log("CRM passed: current ACL counts and confidential/privileged documents, membership revocation, concurrent receipt replay, changed-input rejection, actual audit failure rollback/retry, role and session revocation.");
  } finally {
    await prisma.documento.deleteMany({ where: { nombre: tag } });
    await prisma.causa.deleteMany({ where: { id: { in: caseIds } } });
    await prisma.cliente.deleteMany({ where: { razonSocial: { startsWith: tag } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
