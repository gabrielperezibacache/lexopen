import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { createTeachingSession, deleteTeachingSession, exportTeachingSessions, listTeachingSessions, scheduleTeachingCallDeadline, teachingCalendarSessions } from "./teaching-sessions";

const statusIs = (status: number) => (error: unknown) => (error as { status?: number }).status === status;

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tag = randomUUID();
  const ids = [`teaching-owner-${tag}`, `teaching-other-${tag}`];
  try {
    const [owner, other] = await Promise.all(ids.map((id, i) => db.user.create({ data: { id, name: "Profesional ficticio", role: i ? "admin" : "abogado", email: `${id}@example.invalid`, password: "not-a-login" } })));
    const course = await db.altazorAcademicWorkspace.create({ data: { ownerId: owner.id, kind: "course", title: "Curso ficticio", requestId: randomUUID() } });
    const workshop = await db.altazorAcademicWorkspace.create({ data: { ownerId: owner.id, kind: "workshop", title: "Taller ficticio", requestId: randomUUID() } });
    const research = await db.altazorAcademicWorkspace.create({ data: { ownerId: owner.id, kind: "research", title: "Investigación ficticia", requestId: randomUUID() } });
    const data = { requestId: randomUUID(), title: `Clase privada ${tag}`, startsAtLocal: "2026-11-30T21:00", endsAtLocal: "2026-11-30T22:00" };
    await assert.rejects(createTeachingSession(course.id, data, other, db), statusIs(404));
    await assert.rejects(createTeachingSession(research.id, data, owner, db), statusIs(404));
    await assert.rejects(createTeachingSession(course.id, { ...data, endsAtLocal: "2026-11-30T20:00" }, owner, db), statusIs(400));
    await assert.rejects(createTeachingSession(course.id, { ...data, startsAtLocal: "2026-02-30T16:30" }, owner, db), statusIs(400));
    await assert.rejects(createTeachingSession(course.id, { ...data, startsAtLocal: "2026-09-06T00:30" }, owner, db), statusIs(400));

    const [first, second] = await Promise.all([createTeachingSession(course.id, data, owner, db), createTeachingSession(course.id, data, owner, db)]);
    assert.notEqual(first.reused, second.reused);
    assert.equal(first.session.id, second.session.id);
    assert.equal(first.session.startsAt, "2026-12-01T00:00:00.000Z");
    assert.equal(first.session.endsAt, "2026-12-01T01:00:00.000Z");
    assert.equal(first.session.agendaHref, "/calendario?vista=agenda&ym=2026-11&tipo=evento");
    const { id } = first.session;
    await assert.rejects(createTeachingSession(course.id, { ...data, title: "Otro título" }, owner, db), statusIs(409));
    await createTeachingSession(workshop.id, { requestId: randomUUID(), title: "Taller privado", startsAtLocal: "2026-11-30T10:00" }, owner, db);
    assert.deepEqual((await listTeachingSessions(course.id, owner, db)).sessions, [first.session]);
    await assert.rejects(listTeachingSessions(course.id, other, db), statusIs(404));
    await assert.rejects(deleteTeachingSession(course.id, id, other, db), statusIs(404));
    await assert.rejects(deleteTeachingSession(workshop.id, id, owner, db), statusIs(404));

    const range = { start: new Date("2026-11-30T03:00:00Z"), end: new Date("2026-12-01T02:59:59Z") };
    assert.deepEqual((await teachingCalendarSessions(owner, range, db)).map(item => item.workspaceId), [workshop.id, course.id]);
    assert.deepEqual(await teachingCalendarSessions(other, range, db), []);
    assert.equal(await db.evento.count({ where: { titulo: data.title } }), 0);
    const revoked = await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    await assert.rejects(listTeachingSessions(course.id, owner, db), statusIs(403));
    assert.deepEqual(await teachingCalendarSessions(revoked, range, db), []);
    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });

    await db.altazorAcademicWorkspace.update({ where: { id: course.id }, data: { archivedAt: new Date() } });
    assert.deepEqual((await teachingCalendarSessions(owner, range, db)).map(item => item.workspaceId), [workshop.id]);
    await assert.rejects(listTeachingSessions(course.id, owner, db), statusIs(404));
    await db.altazorAcademicWorkspace.update({ where: { id: course.id }, data: { archivedAt: null } });
    assert.deepEqual(await deleteTeachingSession(course.id, id, owner, db), { deleted: true });
    assert.deepEqual((await listTeachingSessions(course.id, owner, db)).sessions, []);

    const call = await db.altazorAcademicWorkspace.create({
      data: { ownerId: owner.id, kind: "call", title: "Convocatoria ficticia", requestId: randomUUID(), briefJson: JSON.stringify({ call: { deadline: "2026-12-15" } }) },
    });
    const deadline = { action: "schedule-call-deadline", date: "2026-12-15", localDate: "2026-12-14", time: "16:30" };
    await assert.rejects(scheduleTeachingCallDeadline(call.id, deadline, other, db), statusIs(404));
    await assert.rejects(scheduleTeachingCallDeadline(course.id, deadline, owner, db), statusIs(404));
    await assert.rejects(scheduleTeachingCallDeadline(call.id, { ...deadline, date: "2026-12-14" }, owner, db), statusIs(409));
    const [scheduled, retry] = await Promise.all([scheduleTeachingCallDeadline(call.id, deadline, owner, db), scheduleTeachingCallDeadline(call.id, deadline, owner, db)]);
    assert.notEqual(scheduled.reused, retry.reused);
    assert.equal(scheduled.session.id, retry.session.id);
    assert.equal(scheduled.session.callDeadline, true);
    assert.equal(scheduled.session.startsAt, "2026-12-14T19:30:00.000Z");
    const rescheduled = await scheduleTeachingCallDeadline(call.id, { ...deadline, time: "17:45" }, owner, db);
    assert.equal(rescheduled.session.id, scheduled.session.id);
    assert.equal(rescheduled.session.startsAt, "2026-12-14T20:45:00.000Z");
    assert.equal((await listTeachingSessions(call.id, owner, db)).sessions.length, 1);
    await assert.rejects(exportTeachingSessions(call.id, other, db), statusIs(404));
    const unicode = "áó🙂".repeat(21);
    await createTeachingSession(call.id, { requestId: randomUUID(), title: `${unicode}\r\nATTENDEE: ficticio`, startsAtLocal: "2026-12-14T20:45" }, owner, db);
    const ics = await exportTeachingSessions(call.id, owner, db);
    assert.match(ics, /SUMMARY:Cierre · Convocatoria ficticia/);
    assert.match(ics, /DTSTART:20261214T204500Z/);
    assert.ok(ics.replace(/\r\n /g, "").includes(`SUMMARY:${unicode}\\nATTENDEE: ficticio`));
    assert.ok(ics.split("\r\n").every(line => Buffer.byteLength(line) <= 75));
    assert.ok(!ics.includes("\r\nATTENDEE:"));
    console.log("Teaching sessions passed: ownership, Santiago time, idempotency, call deadline updates and private calendar export.");
  } finally {
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.altazorAcademicWorkspace.deleteMany({ where: { ownerId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
