import { plazoAccessWhere } from "@/lib/auth/causa-access";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { serializable } from "@/lib/command-execution";
import { updatePlazoCommand } from "@/lib/plazo-commands";
import {
  deadlineVersion,
  readDeadlineHistory,
  eventDocument,
} from "./completion";
import {
  deadlineBefore,
  deadlineMonth,
  deadlineCursorWhere,
  deadlineWindow,
} from "./pagination";
import { civilDateKey } from "@/lib/chile-time";
import { sha256 } from "@/lib/evidence/fragments";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import {
  plazoActualizarTool,
  plazoListarTool,
  resolveDeadlineToolInput,
} from "@/lib/assistant/tools/plazo";
const status = (n: number) => (e: unknown) =>
  (e as { status?: number }).status === n;
async function main() {
  assert.equal(
    assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL),
    new URL(process.env.DATABASE_URL!).toString(),
  );
  const tag = randomUUID(),
    users: string[] = [],
    causes: string[] = [];
  try {
    const owner = await prisma.user.create({
      data: {
        name: "Responsable ficticio",
        email: `${tag}@proof.invalid`,
        password: "no-login",
        role: "abogado",
      },
    });
    users.push(owner.id);
    const outsider = await prisma.user.create({
      data: {
        name: "Sin acceso",
        email: `other-${tag}@proof.invalid`,
        password: "no-login",
        role: "abogado",
      },
    });
    users.push(outsider.id);
    const cause = await prisma.causa.create({
      data: {
        titulo: tag,
        tribunal: "Ficticio",
        materia: "civil",
        acceso: "equipo",
        abogadoId: owner.id,
      },
    });
    causes.push(cause.id);
    const other = await prisma.causa.create({
      data: {
        titulo: tag + "otro",
        tribunal: "Ficticio",
        materia: "civil",
        acceso: "equipo",
        abogadoId: owner.id,
      },
    });
    causes.push(other.id);
    const p = await prisma.plazo.create({
      data: {
        titulo: "Plazo ficticio",
        causaId: cause.id,
        responsableId: owner.id,
        fechaLimite: new Date("2088-11-20T00:00:00Z"),
        alertaEnviada: true,
      },
    });
    const body = {
      id: p.id,
      estado: "cumplido" as const,
      expectedVersion: deadlineVersion(p),
    };
    await assert.rejects(
      updatePlazoCommand(owner, body, randomUUID()),
      status(422),
    );
    await assert.rejects(
      updatePlazoCommand(
        owner,
        { id: p.id, estado: "suspendido" },
        randomUUID(),
      ),
      status(422),
    );
    assert.equal(
      await prisma.plazoStateEvent.count({ where: { plazoId: p.id } }),
      0,
    );
    const manual = {
      ...body,
      completion: {
        kind: "manual" as const,
        justification: "Escrito presentado y comprobante revisado manualmente",
      },
    };
    const key = randomUUID();
    await withRejectedAudit(owner.id, "plazo.state.record", async () => {
      await assert.rejects(updatePlazoCommand(owner, manual, key));
      assert.equal(
        (await prisma.plazo.findUniqueOrThrow({ where: { id: p.id } })).estado,
        "pendiente",
      );
      assert.equal(
        await prisma.plazoStateEvent.count({ where: { plazoId: p.id } }),
        0,
      );
    });
    await Promise.all([
      updatePlazoCommand(owner, manual, key),
      updatePlazoCommand(owner, manual, key),
    ]);
    assert.equal(
      await prisma.plazoStateEvent.count({ where: { plazoId: p.id } }),
      1,
    );
    assert.equal(
      await prisma.auditEvent.count({
        where: { entityId: p.id, action: "plazo.update" },
      }),
      1,
    );
    let history = await serializable((tx) =>
      readDeadlineHistory(p.id, owner, tx),
    );
    assert.equal(
      history.events[0].justification,
      manual.completion.justification,
    );
    assert.equal(history.events[0].actor, owner.name);
    assert.equal(history.legacy, false);
    await assert.rejects(
      updatePlazoCommand(owner, { ...body, estado: "pendiente" }, randomUUID()),
      status(409),
    );
    let current = await prisma.plazo.findUniqueOrThrow({ where: { id: p.id } });
    await updatePlazoCommand(
      owner,
      {
        id: p.id,
        estado: "pendiente",
        expectedVersion: deadlineVersion(current),
      },
      randomUUID(),
    );
    current = await prisma.plazo.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(current.alertaEnviada, false);
    const doc = await prisma.documento.create({
      data: {
        nombre: "Comprobante ficticio.txt",
        tipo: "otro",
        contenido: "Versión original",
        mimeType: "text/plain",
        causaId: cause.id,
        autorId: owner.id,
      },
    });
    const wrong = await prisma.documento.create({
      data: {
        nombre: "Otro expediente",
        tipo: "otro",
        contenido: "Reservado",
        causaId: other.id,
        autorId: owner.id,
      },
    });
    await assert.rejects(
      updatePlazoCommand(
        owner,
        {
          ...body,
          expectedVersion: deadlineVersion(current),
          completion: {
            kind: "document",
            documentoId: wrong.id,
            version: wrong.version,
          },
        },
        randomUUID(),
      ),
      status(404),
    );
    const documentary = {
        ...body,
        expectedVersion: deadlineVersion(current),
        completion: {
          kind: "document" as const,
          documentoId: doc.id,
          version: doc.version,
        },
      },
      docKey = randomUUID();
    await updatePlazoCommand(owner, documentary, docKey);
    const event = await prisma.plazoStateEvent.findFirstOrThrow({
      where: { plazoId: p.id, supportKind: "document" },
    });
    assert.equal(event.documentSha256, sha256(Buffer.from("Versión original")));
    assert.equal(event.documentVersion, 1);
    await prisma.documento.update({
      where: { id: doc.id },
      data: { version: { increment: 1 }, contenido: "Versión posterior" },
    });
    await updatePlazoCommand(owner, documentary, docKey); // Lost response keeps the original receipt/version.
    const retained = await serializable(async (tx) =>
      eventDocument(
        await tx.plazo.findUniqueOrThrow({ where: { id: p.id } }),
        event,
        owner,
        tx,
      ),
    );
    assert.equal(retained.revision.contenido, "Versión original");
    await prisma.documento.update({
      where: { id: doc.id },
      data: { confidencial: true },
    });
    await prisma.user.update({
      where: { id: owner.id },
      data: { capabilityRevokes: "doc.confidential.read" },
    });
    history = await serializable((tx) => readDeadlineHistory(p.id, owner, tx));
    assert.equal(history.events[0].documentUnavailable, true);
    assert.equal(history.events[0].document, null);
    await assert.rejects(
      updatePlazoCommand(owner, documentary, docKey),
      status(404),
    );
    await prisma.user.update({
      where: { id: owner.id },
      data: { capabilityRevokes: "" },
    });
    await assert.rejects(
      serializable((tx) => readDeadlineHistory(p.id, outsider, tx)),
      status(404),
    );
    await prisma.documento.update({
      where: { id: doc.id },
      data: { causaId: other.id },
    });
    history = await serializable((tx) => readDeadlineHistory(p.id, owner, tx));
    assert.equal(history.events[0].documentUnavailable, true);
    const legacy = await prisma.plazo.create({
      data: {
        titulo: "Histórico",
        estado: "cumplido",
        causaId: cause.id,
        fechaLimite: p.fechaLimite,
      },
    });
    assert.equal(
      (await serializable((tx) => readDeadlineHistory(legacy.id, owner, tx)))
        .legacy,
      true,
    );
    assert.equal(
      await prisma.plazoStateEvent.count({ where: { plazoId: legacy.id } }),
      0,
    );
    // All tied records remain traversable; count and filtering happen before slicing.
    await prisma.plazo.createMany({
      data: Array.from({ length: 207 }, (_, i) => ({
        titulo: `Paginado ${i}`,
        causaId: cause.id,
        fechaLimite: new Date("2088-03-05T00:00:00Z"),
      })),
    });
    const ids: string[] = [];
    let after: string | undefined;
    do {
      const rows = await prisma.plazo.findMany({
        where: {
          AND: [
            { causaId: cause.id },
            deadlineMonth("2088-03"),
            deadlineCursorWhere(after),
          ],
        },
        orderBy: [{ fechaLimite: "asc" }, { id: "asc" }],
        take: 101,
      });
      const w = deadlineWindow(rows, 100);
      ids.push(...w.items.map((x) => x.id));
      after = w.next || undefined;
    } while (after);
    assert.equal(ids.length, 207);
    assert.equal(new Set(ids).size, 207);
    // Mixed date-only UTC and legacy instants agree with the app's civil dates, including DST boundaries.
    const samples = [
      "2088-03-01T00:00:00Z",
      "2088-03-01T01:00:00Z",
      "2088-03-01T04:00:00Z",
      "2088-03-31T23:59:59Z",
      "2088-04-01T00:00:00Z",
      "2088-04-01T01:00:00Z",
      "2088-04-01T05:00:00Z",
    ];
    const dated = await Promise.all(
      samples.map((fechaLimite) =>
        prisma.plazo.create({
          data: {
            titulo: fechaLimite,
            causaId: other.id,
            fechaLimite: new Date(fechaLimite),
          },
        }),
      ),
    );
    const monthRows = await prisma.plazo.findMany({
      where: { AND: [{ causaId: other.id }, deadlineMonth("2088-03")] },
    });
    assert.deepEqual(
      monthRows.map((x) => x.id).sort(),
      dated
        .filter((x) => civilDateKey(x.fechaLimite).startsWith("2088-03"))
        .map((x) => x.id)
        .sort(),
    );
    const beforeRows = await prisma.plazo.findMany({
      where: { AND: [{ causaId: other.id }, deadlineBefore("2088-04-01")] },
    });
    assert.deepEqual(
      beforeRows.map((x) => x.id).sort(),
      dated
        .filter((x) => civilDateKey(x.fechaLimite) < "2088-04-01")
        .map((x) => x.id)
        .sort(),
    );
    const hiddenCause = await prisma.causa.create({
      data: {
        titulo: "Fuente ajena",
        tribunal: "Ficticio",
        materia: "civil",
        acceso: "equipo",
        abogadoId: outsider.id,
      },
    });
    causes.push(hiddenCause.id);
    const cross = await prisma.plazo.create({
      data: {
        titulo: "Origen con muro distinto",
        causaId: cause.id,
        fechaLimite: p.fechaLimite,
      },
    });
    await prisma.minuta.create({
      data: {
        titulo: "Minuta ajena",
        resumenEjecutivo: "Reservado",
        causaId: hiddenCause.id,
        autorId: outsider.id,
        acciones: {
          create: { descripcion: "Referencia antigua", plazoId: cross.id },
        },
      },
    });
    assert.equal(
      await prisma.plazo.count({
        where: { AND: [plazoAccessWhere(owner), { id: cross.id }] },
      }),
      0,
      "A legacy cross-matter source must not leak through list counts",
    );
    await assert.rejects(
      serializable((tx) => readDeadlineHistory(cross.id, owner, tx)),
      status(404),
    );
    const longHistory = await prisma.plazo.create({
      data: {
        titulo: "Historia extensa",
        causaId: cause.id,
        fechaLimite: p.fechaLimite,
      },
    });
    await prisma.plazoStateEvent.createMany({
      data: Array.from({ length: 103 }, (_, i) => ({
        plazoId: longHistory.id,
        revision: i + 1,
        fromEstado: "cumplido",
        toEstado: "pendiente",
        actorId: owner.id,
        actorName: owner.name,
        origin: "fixture",
        scopeCausaId: cause.id,
      })),
    });
    const revisions: number[] = [];
    let historyCursor: string | undefined;
    do {
      const h = await serializable((tx) =>
        readDeadlineHistory(longHistory.id, owner, tx, historyCursor),
      );
      revisions.push(...h.events.map((e) => e.revision));
      historyCursor = h.next || undefined;
    } while (historyCursor);
    assert.equal(revisions.length, 103);
    assert.equal(new Set(revisions).size, 103);
    const ctx = {
      userId: owner.id,
      role: "abogado" as const,
      scope: { causaId: cause.id },
      commandKey: randomUUID(),
    };
    const list = await plazoListarTool.execute(
      { causaId: cause.id, q: "Histórico" },
      ctx,
    );
    assert.equal((list.card!.items as unknown[]).length, 1);
    current = await prisma.plazo.findUniqueOrThrow({ where: { id: p.id } });
    const toolInput = {
      plazoId: p.id,
      estado: "pendiente" as const,
      expectedVersion: deadlineVersion(current),
    };
    assert.equal((await plazoActualizarTool.execute(toolInput, ctx)).ok, true);
    current = await prisma.plazo.findUniqueOrThrow({ where: { id: p.id } });
    await assert.rejects(
      async () =>
        plazoActualizarTool.preview(
          {
            plazoId: p.id,
            estado: "cumplido",
            expectedVersion: deadlineVersion(current),
          },
          ctx,
        ),
      status(422),
    );
    const resolved = await resolveDeadlineToolInput(
      {
        plazo: p.titulo,
        estado: "cumplido",
        completion: { kind: "manual", justification: "Gestión realizada" },
      },
      ctx,
      "Cierra el plazo: Gestión realizada",
    );
    assert.equal(resolved.plazoId, p.id);
    assert.equal(resolved.expectedVersion, deadlineVersion(current));
    await assert.rejects(
      resolveDeadlineToolInput(
        {
          plazo: p.titulo,
          estado: "cumplido",
          completion: { kind: "manual", justification: "Razón inventada" },
        },
        ctx,
        "Cierra el plazo",
      ),
      status(409),
    );
    await prisma.documento.update({
      where: { id: doc.id },
      data: { causaId: cause.id, confidencial: false },
    });
    const docPlan = await resolveDeadlineToolInput(
      {
        plazo: p.titulo,
        estado: "cumplido",
        completion: { kind: "document", nombre: doc.nombre },
      },
      ctx,
      `Cierra con ${doc.nombre}`,
    );
    assert.deepEqual(docPlan.completion, {
      kind: "document",
      documentoId: doc.id,
      version: 2,
    });
    const closeTool = {
        plazoId: p.id,
        estado: "cumplido" as const,
        expectedVersion: deadlineVersion(current),
        completion: {
          kind: "manual" as const,
          justification: "Confirmación explícita para Altazor",
        },
      },
      toolCtx = { ...ctx, commandKey: randomUUID() };
    await plazoActualizarTool.execute(closeTool, toolCtx);
    await plazoActualizarTool.execute(closeTool, toolCtx);
    await prisma.user.update({
      where: { id: owner.id },
      data: { capabilityRevokes: "plazo.close" },
    });
    await assert.rejects(
      plazoActualizarTool.execute(closeTool, toolCtx),
      status(403),
    );
    console.log(
      "Deadline support PASS: required evidence, rollback, CAS, concurrent retries, immutable versions, current ACL, legacy state, 207 tied dates, civil dates, Altazor and replay permissions.",
    );
  } finally {
    await prisma.causa.deleteMany({ where: { id: { in: causes } } });
    await prisma.commandExecution.deleteMany({
      where: { ownerId: { in: users } },
    });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
