import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { createCausaCommand, CausaCreateConflict } from "./create-command";
import {
  clienteDocumentsWhere,
  clienteDocumentCounts,
} from "@/lib/clientes/documents";
import { ingestManualCaseDocument } from "./document-intake";
import { listCursorWhere, listWindow } from "@/lib/api/list-window";
import { assertCausaAccess, assertCausaCapability, assertCausaTeamManage } from "@/lib/auth/causa-access";
import { canonicalJson } from "@/lib/command-execution";
import { causaCreateSchema } from "@/lib/schemas";
const status = (code: number) => (e: unknown) =>
  (e as { status?: number }).status === code;
async function main() {
  assert.equal(
    assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL),
    new URL(process.env.DATABASE_URL!).toString(),
  );
  const tag = randomUUID(),
    users: string[] = [],
    clients: string[] = [];
  try {
    for (const role of ["abogado", "abogado", "asistente"])
      users.push(
        (
          await prisma.user.create({
            data: {
              name: tag,
              email: `${randomUUID()}@continuity.invalid`,
              password: "no-login",
              role,
            },
          })
        ).id,
      );
    const actor = { id: users[0], role: "abogado" },
      other = { id: users[1], role: "abogado" },
      assistant = { id: users[2], role: "asistente" };
    for (let i = 0; i < 2; i++)
      clients.push(
        (await prisma.cliente.create({ data: { razonSocial: `${tag}-${i}` } }))
          .id,
      );
    const input = {
      titulo: `Causa manual ${tag}`,
      tribunal: "Órgano ficticio",
      materia: "civil",
      clienteId: clients[0],
    };
    const key = randomUUID();
    const created = await Promise.all(
      Array.from({ length: 4 }, () => createCausaCommand(actor, input, key)),
    );
    const cause = created[0];
    assert(created.every((row) => row.id === cause.id));
    assert.equal(cause.acceso, "estudio", "omitting visibility preserves the historical default");
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const receipt = await prisma.commandExecution.findUniqueOrThrow({ where: { key: hash(`${actor.id}:${key}`) } });
    assert.equal(receipt.inputHash, hash(canonicalJson(input)), "old payloads retain their original receipt identity");
    assert.equal((await createCausaCommand(actor, { ...input, acceso: "estudio" }, key)).id, cause.id, "explicit default visibility replays a legacy receipt without a hash conflict");
    assert.equal(
      await prisma.causa.count({ where: { titulo: input.titulo } }),
      1,
    );
    assert.equal(
      await prisma.auditEvent.count({
        where: { entityId: cause.id, action: "causa.create" },
      }),
      1,
    );
    assert.equal(
      await prisma.activity.count({ where: { causaId: cause.id } }),
      1,
    );
    const restrictedInput = { ...input, titulo: `Equipo desde el alta ${tag}`, acceso: "equipo" };
    const restrictedKey = randomUUID();
    const privateResults = await Promise.all(Array.from({ length: 3 }, () => createCausaCommand(actor, restrictedInput, restrictedKey)));
    const restricted = privateResults[0];
    assert.equal(restricted.acceso, "equipo", "the requested wall must exist before the first document is uploaded");
    assert(privateResults.every(row => row.id === restricted.id));
    assert.equal(await prisma.documento.count({ where: { causaId: restricted.id } }), 0);
    assert.equal(await prisma.causaMiembro.count({ where: { causaId: restricted.id, userId: actor.id, rol: "responsable" } }), 1);
    await assertCausaAccess(restricted.id, actor);
    await assert.rejects(assertCausaAccess(restricted.id, other), status(404));
    await assert.rejects(createCausaCommand(actor, { ...restrictedInput, acceso: "estudio" }, restrictedKey), status(409));
    assert.equal((await prisma.causa.findUniqueOrThrow({ where: { id: restricted.id } })).acceso, "equipo");
    assert.equal(await prisma.auditEvent.count({ where: { entityId: restricted.id, action: "causa.create" } }), 1);
    assert.equal(causaCreateSchema.safeParse({ ...input, acceso: "publico" }).success, false);

    const delegated = await createCausaCommand(actor, { ...restrictedInput, titulo: `Asignada ${tag}`, abogadoId: other.id }, randomUUID());
    await assertCausaCapability(delegated.id, actor, "causa.write");
    await assertCausaCapability(delegated.id, other, "causa.write");
    assert.equal((await prisma.causaMiembro.findUniqueOrThrow({ where: { causaId_userId: { causaId: delegated.id, userId: actor.id } } })).rol, "colaborador");
    assert.equal((await prisma.causaMiembro.findUniqueOrThrow({ where: { causaId_userId: { causaId: delegated.id, userId: other.id } } })).rol, "responsable");
    await assert.rejects(assertCausaTeamManage(delegated.id, actor), status(403));
    await assertCausaTeamManage(delegated.id, other);
    for (const change of [{ role: "cliente" }, { role: "contabilidad" }, { capabilityRevokes: "causa.read" }, { capabilityRevokes: "causa.write" }]) {
      await prisma.user.update({ where: { id: other.id }, data: change });
      const invalidTitle = `Responsable inválido ${randomUUID()}`;
      await assert.rejects(createCausaCommand(actor, { ...restrictedInput, titulo: invalidTitle, abogadoId: other.id }, randomUUID()), status(403));
      assert.equal(await prisma.causa.count({ where: { titulo: invalidTitle } }), 0);
      await prisma.user.update({ where: { id: other.id }, data: { role: "abogado", capabilityRevokes: "" } });
    }
    await assert.rejects(createCausaCommand(actor, { ...restrictedInput, abogadoId: "missing-user" }, randomUUID()), status(403));
    const rollbackTitle = `Rollback equipo ${tag}`, rollbackKey = randomUUID();
    const membersBefore = await prisma.causaMiembro.count({ where: { userId: { in: users } } });
    await withRejectedAudit(actor.id, "causa.create", async () => {
      await assert.rejects(createCausaCommand(actor, { ...restrictedInput, titulo: rollbackTitle, abogadoId: other.id }, rollbackKey));
      assert.equal(await prisma.causa.count({ where: { titulo: rollbackTitle } }), 0);
      assert.equal(await prisma.causaMiembro.count({ where: { userId: { in: users } } }), membersBefore);
      assert.equal(await prisma.commandExecution.count({ where: { key: hash(`${actor.id}:${rollbackKey}`) } }), 0);
    });
    assert.equal((await createCausaCommand(actor, { ...restrictedInput, titulo: rollbackTitle, abogadoId: other.id }, rollbackKey)).acceso, "equipo", "an audited rollback leaves the same key retryable");
    await assert.rejects(
      createCausaCommand(actor, { ...input, titulo: "Otro" }, key),
      status(409),
    );
    await prisma.causa.update({
      where: { id: cause.id },
      data: { titulo: "Título actual" },
    });
    assert.equal(
      (await createCausaCommand(actor, input, key)).titulo,
      "Título actual",
    );
    assert.notEqual(
      (await createCausaCommand(actor, input, randomUUID())).id,
      cause.id,
      "distinct unnumbered matters are legitimate",
    );
    await assert.rejects(
      createCausaCommand(
        actor,
        { ...input, clienteId: "missing-client" },
        randomUUID(),
      ),
      status(404),
    );
    await withRejectedAudit(actor.id, "causa.create", async () => {
      await assert.rejects(
        createCausaCommand(
          actor,
          { ...input, titulo: `Rollback ${tag}` },
          randomUUID(),
        ),
      );
      assert.equal(
        await prisma.causa.count({ where: { titulo: `Rollback ${tag}` } }),
        0,
      );
    });
    const numbered = { ...input, rit: `C-${Date.now()}-2099` };
    const numberedCase = await createCausaCommand(
      actor,
      numbered,
      randomUUID(),
    );
    await assert.rejects(
      createCausaCommand(actor, numbered, randomUUID()),
      (e) =>
        e instanceof CausaCreateConflict &&
        e.payload.existingId === numberedCase.id,
    );
    await prisma.causa.update({
      where: { id: numberedCase.id },
      data: { acceso: "equipo" },
    });
    await assert.rejects(
      createCausaCommand(other, numbered, randomUUID()),
      (e) =>
        e instanceof CausaCreateConflict &&
        !e.payload.existingId &&
        !e.payload.id &&
        !e.payload.titulo,
    );
    await prisma.user.update({
      where: { id: actor.id },
      data: { capabilityRevokes: "causa.create" },
    });
    await assert.rejects(createCausaCommand(actor, input, key), status(403));
    await prisma.user.update({
      where: { id: actor.id },
      data: { capabilityRevokes: "" },
    });
    await prisma.user.update({
      where: { id: actor.id },
      data: { capabilityRevokes: "causa.read" },
    });
    const unreadableTitle = `Unreadable ${tag}`;
    await assert.rejects(
      createCausaCommand(
        actor,
        { ...input, titulo: unreadableTitle },
        randomUUID(),
      ),
      status(403),
    );
    assert.equal(
      await prisma.causa.count({ where: { titulo: unreadableTitle } }),
      0,
    );
    await prisma.user.update({
      where: { id: actor.id },
      data: { capabilityRevokes: "" },
    });
    const hidden = await prisma.causa.create({
      data: {
        titulo: tag,
        tribunal: "Ficticio",
        materia: "civil",
        acceso: "equipo",
        abogadoId: other.id,
        clienteId: clients[0],
      },
    });
    const tied = new Date("2088-02-01T12:00:00Z");
    await prisma.documento.createMany({
      data: [
        ...Array.from({ length: 105 }, (_, i) => ({
          nombre: `Documento ${i} ${tag}`,
          causaId: cause.id,
          clienteId: i === 0 ? clients[0] : null,
          autorId: actor.id,
          updatedAt: tied,
        })),
        { nombre: "Directo", clienteId: clients[0], autorId: actor.id },
        {
          nombre: "Reservado",
          causaId: hidden.id,
          clienteId: clients[0],
          autorId: other.id,
        },
        {
          nombre: "Confidencial",
          causaId: cause.id,
          autorId: actor.id,
          confidencial: true,
        },
      ],
    });
    for (const subject of [actor, other, assistant]) {
      const where = clienteDocumentsWhere(clients[0], subject);
      assert.equal(
        (await clienteDocumentCounts(clients, subject)).get(clients[0]),
        await prisma.documento.count({ where }),
      );
    }
    assert.equal(
      (await clienteDocumentCounts(clients, assistant)).get(clients[0]),
      106,
    );
    const seen = new Set<string>();
    let after: string | undefined;
    do {
      const rows = await prisma.documento.findMany({
        where: {
          AND: [
            clienteDocumentsWhere(clients[0], assistant),
            listCursorWhere(after, "updatedAt"),
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 51,
      });
      const window = listWindow(rows, 50, "updatedAt");
      for (const row of window.items) {
        assert(!seen.has(row.id));
        seen.add(row.id);
      }
      after = window.next || undefined;
    } while (after);
    assert.equal(seen.size, 106);
    await assert.rejects(
      ingestManualCaseDocument(
        {
          causaId: cause.id,
          clienteId: clients[1],
          nombre: "Cruce inválido",
          tipo: "otro",
          contenido: null,
          mimeType: "text/plain",
          ruta: null,
          extractionStatus: null,
          confidencial: false,
          privilegio: false,
        },
        null,
        actor,
      ),
      status(400),
    );
    await prisma.causaMiembro.deleteMany({
      where: { causaId: cause.id, userId: actor.id },
    });
    await prisma.causa.update({
      where: { id: cause.id },
      data: { acceso: "equipo", abogadoId: other.id },
    });
    await assert.rejects(createCausaCommand(actor, input, key), status(404));
    const freshCount = await prisma.documento.count({
      where: clienteDocumentsWhere(clients[0], actor),
    });
    assert.equal(
      (await clienteDocumentCounts(clients, actor)).get(clients[0]),
      freshCount,
    );
    assert.equal(freshCount, 1);
    console.log(
      "Workflow continuity PASS: idempotent intake, current replay, atomic audit, hidden duplicates, client document union, tied pagination and cross-case validation.",
    );
  } finally {
    await prisma.causa.deleteMany({ where: { clienteId: { in: clients } } });
    await prisma.documento.deleteMany({
      where: { clienteId: { in: clients } },
    });
    await prisma.cliente.deleteMany({ where: { id: { in: clients } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.commandExecution.deleteMany({
      where: { ownerId: { in: users } },
    });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
