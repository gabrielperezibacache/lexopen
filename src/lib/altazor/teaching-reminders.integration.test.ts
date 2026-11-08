import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { visibleNotifications } from "@/lib/notify/read";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { teachingReminderFields, teachingReminderKey } from "./teaching-reminder-policy";
import { changeTeachingReminder, runDueTeachingReminders } from "./teaching-reminders";

const statusIs = (status: number) => (error: unknown) => (error as { status?: number }).status === status;

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  const ids = ["owner", "other", "revoked"].map(role => `teaching-reminder-${role}-${randomUUID()}`);
  const now = new Date();
  const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
  try {
    const [owner, other, revoked] = await Promise.all(ids.map(id => db.user.create({
      data: { id, email: `${id}@example.invalid`, name: "Cuenta ficticia", role: "abogado", password: "not-a-login" },
    })));
    const createWork = (ownerId: string, kind: string, archivedAt: Date | null = null) =>
      db.altazorAcademicWorkspace.create({ data: { ownerId, kind, archivedAt, requestId: randomUUID(), title: "Folio ficticio" } });
    const [course, forbidden, archived, research] = await Promise.all([
      createWork(owner.id, "course"), createWork(revoked.id, "workshop"),
      createWork(owner.id, "seminar", now), createWork(owner.id, "research"),
    ]);
    const confidential = `PRIVATE_TITLE_${randomUUID()}`;
    const createSession = (workspaceId: string, startsAt: Date, leadMinutes: number | null) =>
      db.altazorTeachingSession.create({ data: {
        workspaceId, requestId: randomUUID(), title: confidential, startsAt,
        ...teachingReminderFields(startsAt, leadMinutes),
      } });
    const [session, expired, early, revokedSession, archiveSession, researchSession] = await Promise.all([
      createSession(course.id, later(15), null), createSession(course.id, now, 15),
      createSession(course.id, later(180), 60), createSession(forbidden.id, later(15), 15),
      createSession(archived.id, later(15), 15), createSession(research.id, later(15), 15),
    ]);
    await assert.rejects(changeTeachingReminder(course.id, session.id, { reminderLeadMinutes: 15 }, other, db), statusIs(404));
    await assert.rejects(changeTeachingReminder(course.id, expired.id, { reminderLeadMinutes: 60 }, owner, db), statusIs(409));
    await assert.rejects(changeTeachingReminder(course.id, session.id, { reminderLeadMinutes: 5 }, owner, db));
    assert.deepEqual(await changeTeachingReminder(course.id, session.id, { reminderLeadMinutes: 15 }, owner, db), {
      id: session.id, reminderLeadMinutes: 15,
    });
    await db.user.update({ where: { id: revoked.id }, data: { capabilityRevokes: "assistant.use" } });
    const concurrent = await Promise.all([runDueTeachingReminders({ client: db, now }), runDueTeachingReminders({ client: db, now })]);
    assert.equal(concurrent.reduce((sum, item) => sum + item.delivered, 0), 1);
    assert.equal(concurrent.reduce((sum, item) => sum + item.disabled, 0), 1);
    assert.equal((await db.altazorTeachingSession.findUniqueOrThrow({ where: { id: revokedSession.id } })).reminderLeadMinutes, null);
    const delivered = await db.altazorTeachingSession.findUniqueOrThrow({ where: { id: session.id } });
    assert.equal(delivered.reminderDueAt, null);
    assert.equal(delivered.reminderLeadMinutes, 15);
    assert.equal(delivered.updatedAt.getTime(), session.updatedAt.getTime(), "Private reminders preserve calendar metadata");
    assert.equal(delivered.calendarSequence, session.calendarSequence);
    const notices = await db.notification.findMany({ where: { userId: { in: ids } } });
    assert.equal(notices.length, 1);
    const [first] = notices;
    assert.equal(first.dedupeKey, teachingReminderKey(session.id, session.startsAt, 15));
    assert.equal(first.tipo, "academico.recordatorio");
    assert.equal(first.href, `/academico?trabajo=${course.id}#agenda-docencia`);
    assert.ok(!JSON.stringify(first).includes(confidential));
    assert.equal(await db.mensajeSaliente.count({ where: { userId: { in: ids } } }), 0);
    assert.deepEqual((await visibleNotifications(owner.id, db)).map(item => item.id), [first.id]);
    assert.deepEqual(await visibleNotifications(other.id, db), []);
    await changeTeachingReminder(course.id, session.id, { reminderLeadMinutes: 15 }, owner, db);
    assert.deepEqual(await runDueTeachingReminders({ client: db, now }), { delivered: 0, disabled: 0 });

    const startsAt = later(120);
    await db.altazorTeachingSession.update({
      where: { id: session.id },
      data: { startsAt, ...teachingReminderFields(startsAt, 15), calendarSequence: { increment: 1 } },
    });
    assert.deepEqual(await visibleNotifications(owner.id, db), [], "Moving an event hides the old reminder");
    assert.equal((await runDueTeachingReminders({ client: db, now: later(104) })).delivered, 0);
    assert.equal((await runDueTeachingReminders({ client: db, now: later(105) })).delivered, 1);
    const [second] = await visibleNotifications(owner.id, db);
    assert.equal(second.dedupeKey, teachingReminderKey(session.id, startsAt, 15));
    await changeTeachingReminder(course.id, session.id, { reminderLeadMinutes: null }, owner, db);
    assert.deepEqual(await visibleNotifications(owner.id, db), []);
    assert.equal(await db.notification.count({ where: { entityId: { in: [expired.id, early.id, revokedSession.id, archiveSession.id, researchSession.id] } } }), 0);
    console.log("Teaching reminders passed: owner and live capabilities, bounded due window, serializable deduplication, calendar privacy and stale notices.");
  } finally {
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
