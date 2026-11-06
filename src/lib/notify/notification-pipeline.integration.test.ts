/** PostgreSQL-only fixture: no real addresses, no external sends, no global reset. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { emitNotification } from "./emit";
import { processPlazoHitos, ackPlazo, ackNotification, processPlazoEscalamiento } from "./plazos";
import { processDigests } from "./digest";
import { claimMensajes, processOutboxBatch, recoverOutboxLeases, OUTBOX_LEASE_MS } from "./worker";
import { reconcileOutbox } from "./reconcile";
import { encryptSecret, hashDestino } from "./secrets";
import { visibleNotifications } from "./read";
import { claimJobs, completeJob, enqueueJob, JOB_LEASE_MS } from "@/lib/jobs/queue";
import type { ChannelProvider } from "./providers/types";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tag = `notify_it_${randomUUID().replace(/-/g, "")}`;
  const ids = { a: `${tag}_a`, b: `${tag}_b`, outsider: `${tag}_outsider`, socio: `${tag}_socio`, admin: `${tag}_admin` };
  const userIds = Object.values(ids), causeId = `${tag}_case`, plazoId = `${tag}_deadline`;
  const now = new Date("2026-11-05T16:00:00Z");
  // The supervisor must already be active at the simulated escalation time.
  const supervisorMembership = { causaId: causeId, userId: ids.b, rol: "supervisor", desde: new Date(0) };
  const functionName = `${tag}_fail_outbox`, triggerName = `${tag}_trigger`;
  let triggerInstalled = false;
  let deliveryCalls = 0;
  const provider: ChannelProvider = { id: "smtp", limits: { globalPerSec: 5 }, health: async () => ({ ok: true }),
    send: async (_message, _dest, meta) => { assert.ok(meta?.dedupeKey); deliveryCalls += 1; return { ok: true, providerMessageId: `fixture-${deliveryCalls}` }; } };
  const providerFor = async () => provider;
  async function outboxIds(notificationId: string) {
    return (await db.mensajeSaliente.findMany({ where: { notificationId }, select: { id: true } })).map(row => row.id);
  }
  try {
    await db.user.createMany({ data: userIds.map(id => ({ id, email: `${id}@example.invalid`, name: id,
      role: id === ids.socio ? "socio" : id === ids.admin ? "admin" : "abogado", capabilityGrants: id === ids.admin ? "causa.override_walls" : "", password: "fixture-no-login" })) });
    await db.causa.create({ data: { id: causeId, titulo: "Fixture privada", tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: ids.a } });
    await db.causaMiembro.create({ data: supervisorMembership });
    await db.plazo.create({ data: { id: plazoId, titulo: "Fixture fatal", fechaLimite: new Date("2026-11-05T00:00:00Z"), esFatal: true, responsableId: ids.a, causaId: causeId } });
    for (let n = 0; n < 2; n += 1) {
      const endpoint = `https://fcm.googleapis.com/fcm/send/${tag}-${n}`;
      await db.canalUsuario.create({ data: { id: `${tag}_push${n}`, userId: ids.a, canal: "push", estado: "activo", nivelDetalle: "minimo",
        destinoHash: hashDestino("push", endpoint), destinoEnc: encryptSecret(JSON.stringify({ endpoint, keys: { p256dh: "fixture", auth: "fixture" } })) } });
    }
    // Real DB trigger simulates failing after hito and in-app insertion, before committing outbox.
    await db.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${ids.a}' THEN RAISE EXCEPTION 'fixture outbox unavailable'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "MensajeSaliente" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
    triggerInstalled = true;
    await assert.rejects(processPlazoHitos({ now, client: db, plazoIds: [plazoId] }), /fixture outbox unavailable/);
    assert.equal(await db.plazoAlerta.count({ where: { plazoId } }), 0);
    assert.equal(await db.notification.count({ where: { userId: ids.a } }), 0);
    assert.equal((await db.plazo.findUniqueOrThrow({ where: { id: plazoId } })).alertaEnviada, false);
    await db.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "MensajeSaliente"`); triggerInstalled = false;
    await db.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);

    // Reproduce and repair an orphan milestone left by older non-atomic hosts.
    await db.plazoAlerta.create({ data: { plazoId, hito: "T-7" } });
    await Promise.all([processPlazoHitos({ now, client: db, plazoIds: [plazoId] }), processPlazoHitos({ now, client: db, plazoIds: [plazoId] })]);
    assert.equal(await db.plazoAlerta.count({ where: { plazoId } }), 4);
    assert.equal(await db.notification.count({ where: { userId: ids.a } }), 4);
    assert.equal(await db.mensajeSaliente.count({ where: { userId: ids.a } }), 12, "email + two independent push destinations for every milestone");
    assert.equal(await db.mensajeSaliente.count({ where: { userId: ids.a, payloadJson: { contains: "Fixture fatal" }, nivelDetalle: "minimo" } }), 0);
    const notices = await db.notification.findMany({ where: { userId: ids.a }, orderBy: { dedupeKey: "asc" } });
    assert.equal((await ackPlazo({ plazoId, userId: ids.outsider, via: "inapp" }, db)).ok, false);
    assert.equal((await ackPlazo({ plazoId, userId: ids.b, notificationId: notices[0].id, via: "inapp" }, db)).ok, false);
    assert.equal(await db.plazoAlerta.count({ where: { plazoId, ackAt: { not: null } } }), 0);
    const owned = notices.find(n => n.dedupeKey?.includes(":T-7:"))!;
    assert.equal((await ackNotification({ notificationId: owned.id, userId: ids.a, via: "inapp" }, db)).ok, true);
    assert.equal(await db.plazoAlerta.count({ where: { plazoId, ackAt: { not: null } } }), 1, "ack only the represented milestone");

    const revoked = await emitNotification({ tipo: "plazo.fatal", userId: ids.b, title: "Private", body: "Private", entityType: "plazo", entityId: plazoId, dedupeKey: `${tag}:revoked` }, db);
    await db.causaMiembro.deleteMany({ where: { causaId: causeId, userId: ids.b } });
    assert.equal((await ackNotification({ notificationId: revoked.notificationId!, userId: ids.b, via: "telegram" }, db)).ok, false);
    assert.equal((await visibleNotifications(ids.b, db)).length, 0);
    const suppressed = await processOutboxBatch({ client: db, messageIds: await outboxIds(revoked.notificationId!), providerFor });
    assert.equal(suppressed.suppressed, 1, JSON.stringify({ suppressed, rows: await db.mensajeSaliente.findMany({ where: { notificationId: revoked.notificationId! } }) }));
    await db.causaMiembro.create({ data: supervisorMembership });
    await processPlazoEscalamiento({ now, client: db, plazoIds: [plazoId] });
    const escalations = await db.notification.findMany({ where: { entityId: plazoId, tipo: "plazo.fatal.escalamiento" } });
    assert.deepEqual(escalations.map(n => n.userId).sort(), [ids.b, ids.socio].sort());

    // More than a page of earlier deadlines must not hide later ones on every tick.
    const pageIds = Array.from({ length: 201 }, (_, n) => `${tag}_page_${String(n).padStart(3, "0")}`);
    await db.plazo.createMany({ data: pageIds.map(id => ({ id, titulo: "Fixture paginación", responsableId: ids.a,
      causaId: causeId, fechaLimite: new Date("2026-11-07T00:00:00Z") })) });
    const pageResult = await processPlazoHitos({ now, client: db, plazoIds: pageIds });
    assert.equal(pageResult.plazos, 201); assert.equal(pageResult.generated, 201);
    assert.equal((await processPlazoHitos({ now, client: db, plazoIds: pageIds })).generated, 0);

    const make = async (suffix: string) => {
      const emitted = await emitNotification({ tipo: "plazo.fatal", userId: ids.b, title: "Fixture", body: "Fixture", entityType: "plazo", entityId: plazoId, dedupeKey: `${tag}:${suffix}` }, db);
      return (await outboxIds(emitted.notificationId!))[0];
    };
    const beforeId = await make("before-send");
    const staleAt = new Date(Date.now() - OUTBOX_LEASE_MS - 1000);
    await db.mensajeSaliente.update({ where: { id: beforeId }, data: { estado: "enviando", lockedAt: staleAt, lockedBy: "old", envioIniciadoAt: null } });
    assert.equal((await processOutboxBatch({ client: db, messageIds: [beforeId], providerFor })).sent, 1);
    const afterId = await make("after-send");
    await db.mensajeSaliente.update({ where: { id: afterId }, data: { estado: "enviando", lockedAt: staleAt, lockedBy: "old", envioIniciadoAt: staleAt } });
    await recoverOutboxLeases(new Date(), db, [afterId]);
    assert.equal((await db.mensajeSaliente.findUniqueOrThrow({ where: { id: afterId } })).estado, "incierto");
    const callsBefore = deliveryCalls;
    assert.equal((await processOutboxBatch({ client: db, messageIds: [afterId], providerFor })).claimed, 0);
    assert.equal(deliveryCalls, callsBefore);
    assert.equal((await reconcileOutbox({ id: afterId, actorId: ids.a, action: "reenviar", reason: "Fixture: acceso rechazado" }, db)).ok, false);
    await reconcileOutbox({ id: afterId, actorId: ids.admin, action: "reenviar", reason: "Fixture: entrega revisada" }, db);
    assert.equal((await processOutboxBatch({ client: db, messageIds: [afterId], providerFor })).sent, 1);
    const lostLeaseId = await make("lost-lease");
    const oldClaim = (await claimMensajes(1, new Date(), db, [lostLeaseId]))[0];
    await db.mensajeSaliente.update({ where: { id: lostLeaseId }, data: { lockedAt: staleAt } });
    const newClaim = (await claimMensajes(1, new Date(), db, [lostLeaseId]))[0];
    assert.notEqual(oldClaim.lockedBy, newClaim.lockedBy);
    const obsolete = await db.mensajeSaliente.updateMany({ where: { id: lostLeaseId, estado: "enviando", lockedBy: oldClaim.lockedBy }, data: { estado: "enviado" } });
    assert.equal(obsolete.count, 0);
    const ambiguousId = await make("ambiguous-provider");
    await processOutboxBatch({ client: db, messageIds: [ambiguousId], providerFor: async () => ({ ...provider, send: async () => ({ ok: false, retryable: true, uncertain: true, error: "fixture connection lost after remote acceptance" }) }) });
    assert.equal((await db.mensajeSaliente.findUniqueOrThrow({ where: { id: ambiguousId } })).estado, "incierto");

    // A failed digest remains one durable envelope on retry, never separate messages.
    await db.preferenciaNotificacion.create({ data: { userId: ids.b, tipo: "general", canal: "email", modo: "digest_diario" } });
    const digestNotices = [];
    for (let n = 0; n < 2; n += 1) digestNotices.push(await emitNotification({ tipo: "general", userId: ids.b, title: `Digest ${n}`, body: `Fixture ${n}`, dedupeKey: `${tag}:digest:${n}` }, db));
    await db.mensajeSaliente.updateMany({ where: { notificationId: { in: digestNotices.map(n => n.notificationId!) } }, data: { proximoIntentoAt: new Date(0) } });
    await Promise.all([processDigests({ client: db, userIds: [ids.b] }), processDigests({ client: db, userIds: [ids.b] })]);
    const envelopes = await db.mensajeSaliente.findMany({ where: { userId: ids.b, plantilla: "digest" } });
    assert.equal(envelopes.length, 1);
    const envelope = envelopes[0]; assert.equal(JSON.parse(envelope.payloadJson).sourceIds.length, 2);
    await processOutboxBatch({ client: db, messageIds: [envelope.id], providerFor: async () => ({ ...provider, send: async () => ({ ok: false, retryable: true, error: "fixture temporary rejection" }) }) });
    assert.equal((await db.mensajeSaliente.findUniqueOrThrow({ where: { id: envelope.id } })).estado, "fallido");
    await db.mensajeSaliente.update({ where: { id: envelope.id }, data: { proximoIntentoAt: new Date(0) } });
    assert.equal((await processOutboxBatch({ client: db, messageIds: [envelope.id], providerFor })).sent, 1);
    assert.equal(await db.mensajeSaliente.count({ where: { id: { in: JSON.parse(envelope.payloadJson).sourceIds }, estado: "enviado" } }), 2);

    await db.preferenciaNotificacion.updateMany({ where: { userId: ids.b, tipo: "general", canal: "email" }, data: { modo: "digest_semanal" } });
    const weekly = await emitNotification({ tipo: "general", userId: ids.b, title: "Semanal", body: "Fixture", dedupeKey: `${tag}:weekly` }, db);
    await db.mensajeSaliente.updateMany({ where: { notificationId: weekly.notificationId }, data: { proximoIntentoAt: new Date(0) } });
    assert.equal((await processDigests({ client: db, userIds: [ids.b], mode: "diario" })).queued, 0);
    assert.equal((await processDigests({ client: db, userIds: [ids.b], mode: "semanal" })).queued, 1);

    await db.preferenciaNotificacion.createMany({ data: [
      { userId: ids.a, tipo: "general", canal: "email", modo: "off" },
      { userId: ids.a, tipo: "general", canal: "push", modo: "digest_diario" },
    ] });
    const pushDigest = await emitNotification({ tipo: "general", userId: ids.a, title: "Push grouped", body: "Fixture", dedupeKey: `${tag}:push-digest` }, db);
    await db.mensajeSaliente.updateMany({ where: { notificationId: pushDigest.notificationId }, data: { proximoIntentoAt: new Date(0) } });
    // Keep the previous deadline digests in their future slot while processing the two due push destinations.
    assert.equal((await processDigests({ client: db, now, userIds: [ids.a] })).queued, 2, "digest groups preserve separate push destinations");
    const pushEnvelopes = await db.mensajeSaliente.findMany({ where: { userId: ids.a, plantilla: "digest", canal: "push" } });
    assert.equal(new Set(pushEnvelopes.map(row => row.canalUsuarioId)).size, 2);

    await enqueueJob({ tipo: tag, dedupeKey: tag }, db);
    const oldJob = (await claimJobs({ tipos: [tag], client: db }))[0];
    await db.job.update({ where: { id: oldJob.id }, data: { lockedAt: new Date(Date.now() - JOB_LEASE_MS - 1000) } });
    const recovered = (await claimJobs({ tipos: [tag], client: db }))[0];
    assert.equal((await completeJob(oldJob.id, oldJob, db)).count, 0);
    assert.equal((await completeJob(recovered.id, recovered, db)).count, 1);
    console.log("notify PostgreSQL integration OK: atomic rollback, concurrent dedupe, recipient/wall ack, fanout, pagination, escalation, leases, ambiguous send, digest retry, job CAS");
  } finally {
    if (triggerInstalled) await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "MensajeSaliente"`).catch(() => {});
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`).catch(() => {});
    await db.eventoEntrega.deleteMany({ where: { mensaje: { userId: { in: userIds } } } });
    await db.mensajeSaliente.deleteMany({ where: { userId: { in: userIds } } });
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await db.plazo.deleteMany({ where: { causaId: causeId } });
    await db.causaMiembro.deleteMany({ where: { causaId: causeId } });
    await db.causa.deleteMany({ where: { id: causeId } });
    await db.job.deleteMany({ where: { tipo: tag } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
