import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { fiscaliaFields } from "./contract";
import { fiscaliaWorkspace, saveFiscaliaRequest, exportFiscaliaRequest } from "./service";
import { readCaseStatus } from "@/lib/causas/status-service";
import { addCivilDays, santiagoDateKey } from "@/lib/chile-time";
const code = (status: number) => (e: unknown) => (e as { status?: number }).status === status;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), userIds: string[] = [];
  async function user(role: string) { const u = await prisma.user.create({ data: { name: `Fixture ${role}`, email: `${tag}-${role}@fiscalia.invalid`, role, password: "fixture" } }); userIds.push(u.id); return u; }
  const owner = await user("abogado"), reader = await user("asistente"), outside = await user("procurador");
  const cause = await prisma.causa.create({ data: { titulo: "Fiscalía ficticia", tribunal: "Ficticio", materia: "penal", acceso: "equipo", abogadoId: owner.id } });
  try {
    await prisma.causaMiembro.create({ data: { causaId: cause.id, userId: reader.id, rol: "lectura" } });
    const body = fiscaliaFields.parse({ causaId: cause.id, title: "Solicitud ficticia", kind: "copia", body: "Solicito una copia para revisión profesional." });
    const key = randomUUID(), first = await saveFiscaliaRequest(owner, body, key);
    assert.equal((await saveFiscaliaRequest(owner, body, key)).id, first.id);
    assert.equal(await prisma.fiscaliaRequest.count({ where: { causaId: cause.id } }), 1);
    assert.equal(await prisma.fiscaliaRequestEvent.count({ where: { requestId: first.id } }), 1);
    assert.equal((await fiscaliaWorkspace(reader, { causaId: cause.id })).rows[0].canEdit, false);
    await assert.rejects(fiscaliaWorkspace(outside, { causaId: cause.id }), code(404));
    await assert.rejects(exportFiscaliaRequest(first.id, outside), code(404));
    let row = await prisma.fiscaliaRequest.findUniqueOrThrow({ where: { id: first.id } });
    const ready = { ...body, id: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), status: "ready" };
    await assert.rejects(saveFiscaliaRequest(reader, ready, randomUUID(), true), code(403));
    await saveFiscaliaRequest(owner, ready, randomUUID(), true);
    await assert.rejects(saveFiscaliaRequest(owner, ready, randomUUID(), true), code(409));
    row = await prisma.fiscaliaRequest.findUniqueOrThrow({ where: { id: first.id } });
    const sent = { ...body, id: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), status: "submitted", folio: "FICTICIO-123", submittedAt: addCivilDays(santiagoDateKey(new Date()), -1) };
    await assert.rejects(saveFiscaliaRequest(owner, sent, randomUUID(), true), code(400));
    await saveFiscaliaRequest(owner, { ...sent, portalConfirmed: true }, randomUUID(), true);
    assert.equal((await readCaseStatus(cause.id, owner)).status.fiscaliaRequests[0].status, "submitted");
    assert.equal((await readCaseStatus(cause.id, owner)).status.fiscaliaRequests[0].source, "manual");
    row = await prisma.fiscaliaRequest.findUniqueOrThrow({ where: { id: first.id } });
    await assert.rejects(saveFiscaliaRequest(owner, { ...sent, portalConfirmed: true, expectedUpdatedAt: row.updatedAt.toISOString(), body: "Contenido distinto después de presentar" }, randomUUID(), true), code(409));
    const answered = { ...sent, expectedUpdatedAt: row.updatedAt.toISOString(), status: "answered", responseText: "Respuesta ficticia", answeredAt: santiagoDateKey(new Date()) };
    await saveFiscaliaRequest(owner, answered, randomUUID(), true);
    assert.match(await exportFiscaliaRequest(first.id, owner), /no es un comprobante oficial/);
    assert.equal(await prisma.fiscaliaRequestEvent.count({ where: { requestId: first.id } }), 4);
    const discarded = await saveFiscaliaRequest(owner, { ...body, title: "Borrador descartado", body: "" }, randomUUID());
    const discardRow = await prisma.fiscaliaRequest.findUniqueOrThrow({ where: { id: discarded.id } });
    await saveFiscaliaRequest(owner, { ...body, title: "Borrador descartado", body: "", id: discarded.id, expectedUpdatedAt: discardRow.updatedAt.toISOString(), status: "cancelled" }, randomUUID(), true);
    assert.equal((await fiscaliaWorkspace(owner, { causaId: cause.id })).rows.length, 1);
    assert.equal((await fiscaliaWorkspace(owner, { causaId: cause.id, status: "cancelled" })).rows.length, 1);
    assert.equal((await readCaseStatus(cause.id, owner)).status.fiscaliaCount, 1);
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: outside.id } });
    await assert.rejects(saveFiscaliaRequest(owner, body, key), code(404));
    await assert.rejects(exportFiscaliaRequest(first.id, owner), code(404));
    console.log("Mi Fiscalía PG: case wall, reader denial, live receipt replay authorization, idempotency, concurrent edits, manual submission, preserved contents, history and cause-summary integration passed; no portal requests.");
  } finally { await prisma.causa.delete({ where: { id: cause.id } }); await prisma.commandExecution.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } }); await prisma.user.deleteMany({ where: { id: { in: userIds } } }); }
}
main().finally(() => prisma.$disconnect()).catch(e => { console.error(e); process.exitCode = 1; });
