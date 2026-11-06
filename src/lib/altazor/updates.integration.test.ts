/** Private feed regression using synthetic data in explicitly disposable PostgreSQL. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { santiagoDateKey } from "@/lib/chile-time";
import { POST as tickJornada } from "@/app/api/jornada/worker/route";
import { changeDailyBrief, processDueDailyBriefs, readDailyBriefState } from "./daily-brief";
import { readAltazorUpdates } from "./updates";

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tag = `updates-${randomUUID()}`;
  const userIds = [`${tag}-owner`, `${tag}-other`];
  const caseId = `${tag}-case`;
  const now = new Date();
  const deadlineTime = new Date(now.getTime() - 60_000);
  const secret = `PRIVATE_CONTENT_${tag}`;
  const originalFetch = globalThis.fetch;
  const previousSecret = process.env.CRON_SECRET;
  const cronSecret = randomUUID();
  process.env.CRON_SECRET = cronSecret;
  globalThis.fetch = async () => { throw new Error("Reading the feed must not call any provider"); };
  try {
    const [owner, other] = await Promise.all(userIds.map(id => db.user.create({
      data: { id, email: `${id}@example.invalid`, name: "Ficticio", role: "abogado", password: "not-a-login" },
    })));
    await db.causa.create({ data: { id: caseId, titulo: secret, tribunal: secret, materia: "civil", acceso: "equipo", abogadoId: other.id } });
    const member = await db.causaMiembro.create({ data: { causaId: caseId, userId: owner.id, desde: deadlineTime } });
    const [account, otherAccount] = await Promise.all(userIds.map(userId => db.mailboxAccount.create({ data: { userId } })));
    const mail = {
      accountId: account.id, userId: owner.id, subject: secret, bodyText: secret,
      fromAddress: "Poder Judicial <avisos@notificaciones.pjud.cl>", createdAt: now, receivedAt: now,
    };
    const [visibleMail, linkedMail, foreignMail] = await Promise.all([
      db.mailboxMessage.create({ data: { ...mail, externalId: "gmail:visible" } }),
      db.mailboxMessage.create({ data: { ...mail, externalId: "gmail:linked", causaId: caseId } }),
      db.mailboxMessage.create({ data: { ...mail, externalId: "gmail:other", accountId: otherAccount.id, userId: other.id } }),
      db.mailboxMessage.createMany({ data: [
        { ...mail, externalId: "gmail:wrong-account", accountId: otherAccount.id },
        { ...mail, externalId: "paste:fake" },
        { ...mail, externalId: "gmail:similar-domain", fromAddress: "avisos@pjud.cl.example.invalid" },
        { ...mail, externalId: "gmail:discarded", status: "descartado" },
        { ...mail, externalId: "gmail:old", createdAt: new Date(now.getTime() - 31 * 86_400_000) },
      ] }),
    ]);
    const deadline = await db.plazo.create({ data: {
      causaId: caseId, titulo: secret, fechaLimite: new Date("2099-05-03T00:00:00.000Z"), esFatal: true, responsableId: owner.id,
    } });
    const restrictedDeadline = await db.plazo.create({ data: {
      causaId: caseId, titulo: secret, fechaLimite: new Date("2099-05-04T00:00:00.000Z"), responsableId: owner.id,
    } });
    await db.minuta.create({ data: {
      causaId: caseId, titulo: secret, resumenEjecutivo: secret, confidencial: true,
      acciones: { create: { descripcion: secret, plazoId: restrictedDeadline.id } },
    } });
    const notice = {
      userId: owner.id, title: secret, body: secret, href: "/unsafe-destination", tipo: "plazo.fatal",
      entityType: "plazo", entityId: deadline.id, createdAt: deadlineTime,
    };
    const [visibleNotice] = await Promise.all([
      db.notification.create({ data: notice }),
      db.notification.createMany({ data: [
        { ...notice, userId: other.id },
        { ...notice, entityId: restrictedDeadline.id },
        { ...notice, entityId: `${tag}-missing` },
        { ...notice, entityType: null, tipo: "general" },
      ] }),
    ]);
    // The current role is reloaded and cannot be elevated by the caller.
    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "doc.confidential.read" } });
    const read = () => readAltazorUpdates({ ...owner, role: "admin" }, db);
    const first = await read();
    assert.deepEqual(first, await read(), "Reload returns the same persisted source events and IDs");
    assert.deepEqual(first.updates.map(update => update.id).sort(), [
      `court-mail:${visibleMail.id}`, `court-mail:${linkedMail.id}`, `deadline:${visibleNotice.id}`,
    ].sort());
    assert.equal(first.updates.at(-1)?.dueAt, "2099-05-03");
    assert.equal(first.updates.at(-1)?.href, "/plazos?mes=2099-05");
    assert.ok(first.updates.some(update => update.href === `/correo?id=${visibleMail.id}`));
    assert.equal(JSON.stringify(first).includes(secret), false);
    assert.equal(JSON.stringify(first).includes(caseId), false);
    assert.equal(JSON.stringify(first).includes("/unsafe-destination"), false);
    assert.ok((await readAltazorUpdates(other, db)).updates.some(update => update.id === `court-mail:${foreignMail.id}`));

    const approaching = await db.plazo.create({ data: {
      causaId: caseId, titulo: secret, fechaLimite: new Date(santiagoDateKey(now)), esFatal: true, responsableId: owner.id,
    } });
    assert.ok((await read()).updates.some(update => update.id === `upcoming-deadline:${approaching.id}`), "A pending fatal deadline is visible without a scheduled notification");
    const approachingNotice = await db.notification.create({ data: { ...notice, entityId: approaching.id } });
    const announced = (await read()).updates;
    assert.ok(announced.some(update => update.id === `deadline:${approachingNotice.id}`));
    assert.ok(!announced.some(update => update.id === `upcoming-deadline:${approaching.id}`), "Persisted notice replaces the fallback");
    assert.ok(!JSON.stringify(announced).includes(secret));

    assert.equal((await readDailyBriefState(owner, db)).enabled, false);
    await changeDailyBrief("enable", owner, db, now);
    await changeDailyBrief("enable", other, db, now);
    await db.altazorCompanion.update({ where: { ownerId: other.id }, data: { backgroundEnabled: false } });
    const tick = (value: string) => tickJornada(new Request("http://localhost/api/jornada/worker", { method: "POST", headers: { "x-cron-secret": value } }));
    assert.equal((await tick("wrong")).status, 401);
    const result = await tick(cronSecret);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).jobs.dailyBrief, true);
    const day = santiagoDateKey(now);
    assert.deepEqual(await readDailyBriefState(owner, db), { enabled: true, backgroundEnabled: true, lastDay: day });
    assert.deepEqual(await readDailyBriefState(other, db), { enabled: true, backgroundEnabled: false, lastDay: null });
    assert.ok(!(await readAltazorUpdates(other, db)).updates.some(update => update.kind === "daily-brief"));
    await Promise.all([changeDailyBrief("run", owner, db, now), changeDailyBrief("run", owner, db, now)]);
    assert.equal(await db.altazorDailyBrief.count({ where: { ownerId: owner.id } }), 1);
    const todaysBrief = (await read()).updates.find(update => update.kind === "daily-brief");
    assert.ok(todaysBrief);
    assert.match(todaysBrief.message, /2 plazos pendientes para revisar/);
    assert.match(todaysBrief.message, /2 correos judiciales/);
    assert.ok(!JSON.stringify(todaysBrief).includes(secret));
    assert.equal(todaysBrief.mailHref, "/correo");

    await db.causaMiembro.delete({ where: { id: member.id } });
    const afterRevocation = (await read()).updates;
    assert.deepEqual(afterRevocation.filter(update => update.kind !== "daily-brief").map(update => update.id), [`court-mail:${visibleMail.id}`]);
    const revised = afterRevocation.find(update => update.kind === "daily-brief");
    assert.equal(revised?.id, todaysBrief.id);
    assert.equal(revised?.occurredAt, todaysBrief.occurredAt);
    assert.doesNotMatch(revised?.message || "", /plazo/);
    assert.match(revised?.message || "", /1 correo judicial/);
    await changeDailyBrief("pause", owner, db, now);
    const tomorrow = new Date(now.getTime() + 36 * 3_600_000);
    await processDueDailyBriefs({ client: db, now: tomorrow });
    assert.equal((await readDailyBriefState(owner, db)).lastDay, day);
    assert.equal((await readDailyBriefState(other, db)).lastDay, null);
    await changeDailyBrief("run", other, db, now);
    assert.equal((await readDailyBriefState(other, db)).lastDay, day, "Manual brief remains available while background work is paused");
    await db.mailboxMessage.createMany({ data: Array.from({ length: 100 }, (_, index) => ({ ...mail, externalId: `gmail:cap-${index}` })) });
    const capped = (await read()).updates;
    assert.equal(capped.filter(update => update.kind !== "daily-brief").length, 24);
    assert.match(capped.find(update => update.kind === "daily-brief")?.message || "", /al menos \d+ correos judiciales/);
    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    await assert.rejects(read(), (error: unknown) => (error as { status?: number }).status === 403);
    console.log("Altazor updates and daily brief: current ACL, minimized data, protected worker, personal opt-in and pause, concurrent idempotence and zero provider calls passed.");
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
    globalThis.fetch = originalFetch;
    await db.causa.deleteMany({ where: { id: caseId } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
