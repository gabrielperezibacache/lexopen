import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { serializable } from "@/lib/command-execution";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { createTramiteCommand, updateTramiteCommand } from "@/lib/tramites/commands";
import { updateEventCommand } from "@/lib/calendario/commands";
import { causeReference, userReference } from "./references";
import { readOfflineEntity, syncOfflineEntity } from "./service";
const status = (n: number) => (e: unknown) => (e as {
    status?: number;
}).status === n;
async function main() {
    assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
    const tag = randomUUID(), ids: string[] = [];
    let causeId = "", siteId = "";
    try {
        const person = async (name: string) => { const u = await prisma.user.create({ data: { name, email: `${tag}-${name}@operations.invalid`, password: "no-login", role: "abogado" } }); ids.push(u.id); return u; };
        const a = await person("owner"), b = await person("other"), reader = await person("reader"), outside = await person("outside");
        const c = await prisma.causa.create({ data: { titulo: tag, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: a.id } });
        causeId = c.id;
        await prisma.causaMiembro.createMany({ data: [{ causaId: c.id, userId: b.id, rol: "colaborador" }, { causaId: c.id, userId: reader.id, rol: "lectura" }] });
        const cref = () => serializable(async (tx) => causeReference(c.id, await currentStaffActor(a, tx), tx, true));
        const ef = { titulo: `Evento reservado ${tag}`, tipo: "reunion", inicio: "2092-11-24T15:00:00.000Z", fin: "2092-11-24T17:00:00.000Z", todoElDia: false, lugar: null, modalidad: null, enlace: null, notas: "Notas reservadas", tipoAudiencia: null, tribunal: null, estado: "programado" };
        const ec = { kind: "evento", action: "create", requestId: randomUUID(), dateReviewed: true, fields: ef, relations: { cause: { id: c.id, expectedVersion: (await cref()).version } } };
        await assert.rejects(syncOfflineEntity(a, { ...ec, dateReviewed: false }), status(422));
        await assert.rejects(syncOfflineEntity(a, { ...ec, fields: { ...ef, enlace: "javascript:alert(1)" } }), { name: "ZodError" });
        await assert.rejects(syncOfflineEntity(a, { ...ec, fields: { ...ef, inicio: "2092-02-31T15:00:00.000Z" } }), { name: "ZodError" });
        await withRejectedAudit(a.id, "evento.create", async () => { await assert.rejects(syncOfflineEntity(a, ec), status(500)); assert.equal(await prisma.evento.count({ where: { causaId: c.id } }), 0); });
        const ep = await Promise.all([syncOfflineEntity(a, ec), syncOfflineEntity(a, ec)]), eid = ep[0].receipt.entityId;
        assert.equal(ep[1].receipt.entityId, eid);
        const es = await readOfflineEntity(a, "evento", eid);
        await updateEventCommand(a, eid, { titulo: "Edición en línea" }, randomUUID());
        await assert.rejects(syncOfflineEntity(a, { ...ec, action: "update", requestId: randomUUID(), entityId: eid, expectedVersion: es.version, relations: undefined }), status(409));
        const fresh = await readOfflineEntity(a, "evento", eid), allDay = { ...ef, inicio: "2092-11-25T00:00:00.000Z", fin: "2092-11-28T00:00:00.000Z", todoElDia: true };
        await syncOfflineEntity(a, { kind: "evento", action: "update", requestId: randomUUID(), entityId: eid, expectedVersion: fresh.version, fields: allDay, dateReviewed: true });
        assert.equal((await prisma.evento.findUniqueOrThrow({ where: { id: eid } })).fin!.toISOString(), allDay.fin);
        await prisma.evento.update({ where: { id: eid }, data: { googleEventId: `google-${tag}` } });
        const google = await readOfflineEntity(a, "evento", eid);
        assert.equal("readOnly" in google.relations && google.relations.readOnly, true);
        await assert.rejects(syncOfflineEntity(a, { kind: "evento", action: "update", requestId: randomUUID(), entityId: eid, expectedVersion: google.version, fields: allDay }), status(409));
        await assert.rejects(readOfflineEntity(outside, "evento", eid), status(404));
        const tf = { titulo: `Trámite reservado ${tag}`, detalle: "Detalle reservado", estado: "pendiente", fechaLimite: "2092-11-25T00:00:00.000Z", orden: 0 };
        const tc = { kind: "tramite", action: "create", requestId: randomUUID(), dateReviewed: true, fields: tf, relations: { cause: { id: c.id, expectedVersion: (await cref()).version } } };
        await assert.rejects(syncOfflineEntity(a, { ...tc, dateReviewed: false }), status(422));
        await withRejectedAudit(a.id, "tramite.create", async () => { await assert.rejects(syncOfflineEntity(a, tc), status(500)); assert.equal(await prisma.tramite.count({ where: { causaId: c.id } }), 0); assert.equal(await prisma.task.count({ where: { causaId: c.id } }), 0); });
        const tp = await Promise.all([syncOfflineEntity(a, tc), syncOfflineEntity(a, tc)]), tid = tp[0].receipt.entityId;
        assert.equal(tp[1].receipt.entityId, tid);
        const task = await prisma.task.findUniqueOrThrow({ where: { tramiteId: tid } });
        assert.equal(task.creatorId, a.id);
        assert.equal(await prisma.task.count({ where: { tramiteId: tid } }), 1);
        const stale = await readOfflineEntity(a, "tramite", tid);
        await prisma.task.update({ where: { id: task.id }, data: { instructions: "Instrucciones independientes", considerations: "Precaución", priority: "urgent", rrule: "FREQ=DAILY;INTERVAL=1" } });
        await assert.rejects(syncOfflineEntity(a, { kind: "tramite", action: "update", requestId: randomUUID(), entityId: tid, expectedVersion: stale.version, fields: { ...tf, detalle: "Edición local" } }), status(409));
        const site = await prisma.site.create({ data: { name: tag, slug: tag, causaId: c.id } });
        siteId = site.id;
        await prisma.task.update({ where: { id: task.id }, data: { siteId: site.id } });
        const w = await prisma.workflow.create({ data: { name: tag, siteId: site.id, triggerType: "task_done", active: true } });
        const ts = await readOfflineEntity(a, "tramite", tid), done = { kind: "tramite", action: "update", requestId: randomUUID(), entityId: tid, expectedVersion: ts.version, fields: { ...tf, estado: "hecho", detalle: "Texto corregido" } };
        await withRejectedAudit(a.id, "tramite.update", async () => { await assert.rejects(syncOfflineEntity(a, done), status(500)); assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status, "todo"); assert.equal(await prisma.workflowInstance.count({ where: { workflowId: w.id } }), 0); });
        await Promise.all([syncOfflineEntity(a, done), syncOfflineEntity(a, done)]);
        const final = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
        assert.equal(final.status, "done");
        assert.equal(final.instructions, "Instrucciones independientes");
        assert.equal(final.priority, "urgent");
        assert.equal(final.description, "Texto corregido");
        assert.equal(await prisma.workflowInstance.count({ where: { workflowId: w.id } }), 1);
        assert.equal(await prisma.task.count({ where: { causaId: c.id, rrule: "FREQ=DAILY;INTERVAL=1" } }), 2);
        const read = await readOfflineEntity(reader, "tramite", tid);
        assert.equal("readOnly" in read.relations && read.relations.readOnly, true);
        await assert.rejects(syncOfflineEntity(reader, { ...done, requestId: randomUUID(), expectedVersion: read.version }), status(409));
        const bref = await serializable(tx => userReference(b.id, tx));
        const assignment = { ...tc, requestId: randomUUID(), relations: { cause: { id: c.id, expectedVersion: (await cref()).version }, responsible: { id: b.id, expectedVersion: bref.version } } };
        await prisma.user.update({ where: { id: b.id }, data: { name: "Perfil cambiado" } });
        await assert.rejects(syncOfflineEntity(a, assignment), status(409));
        await prisma.user.update({ where: { id: b.id }, data: { name: b.name } });
        await assert.rejects(syncOfflineEntity(a, assignment), status(409));
        const nativeKey = randomUUID(), native = await createTramiteCommand(a, c.id, { titulo: "Nativo idempotente" }, nativeKey);
        assert.ok("id" in native);
        if (!("id" in native))
            throw Error("Expected single row");
        assert.equal((await createTramiteCommand(a, c.id, { titulo: "Nativo idempotente" }, nativeKey) as typeof native).id, native.id);
        await updateTramiteCommand(a, native.id, { titulo: "Nativo corregido", expectedUpdatedAt: native.updatedAt.toISOString() }, randomUUID());
        await assert.rejects(updateTramiteCommand(a, native.id, { titulo: "No pisar", expectedUpdatedAt: native.updatedAt.toISOString() }, randomUUID()), status(409));
        await prisma.user.update({ where: { id: a.id }, data: { capabilityRevokes: "causa.write" } });
        await assert.rejects(syncOfflineEntity(a, done), status(403));
        await prisma.user.update({ where: { id: a.id }, data: { capabilityRevokes: "" } });
        const receipts = await prisma.commandExecution.findMany({ where: { ownerId: { in: ids } }, select: { resultJson: true } });
        assert.doesNotMatch(JSON.stringify(receipts), /Notas reservadas|Detalle reservado|Texto corregido|Instrucciones independientes/);
        console.log("Offline operations passed: event civil/timed dates, atomic audit rollback, exact-once concurrent retries, Google read-only, live permissions, rejected-reference ABA, shared task conflicts and independent fields, one recurrence/workflow, native versioned mutations, minimal receipts.");
    }
    finally {
        await prisma.mensajeSaliente.deleteMany({ where: { userId: { in: ids } } });
        await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
        await prisma.task.deleteMany({ where: { creatorId: { in: ids } } });
        await prisma.evento.deleteMany({ where: { responsableId: { in: ids } } });
        if (siteId)
            await prisma.site.deleteMany({ where: { id: siteId } });
        if (causeId)
            await prisma.causa.deleteMany({ where: { id: causeId } });
        await prisma.commandExecution.deleteMany({ where: { ownerId: { in: ids } } });
        await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
        await prisma.$disconnect();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
