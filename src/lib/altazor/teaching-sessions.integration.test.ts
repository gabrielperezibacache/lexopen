import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { createTeachingSession, deleteTeachingSession, listTeachingSessions, teachingCalendarSessions } from "./teaching-sessions";

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
    console.log("Teaching sessions passed: owner-only read and mutation, active teaching kinds, Santiago time, transactional idempotency, local calendar and archive handling.");
  } finally {
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.altazorAcademicWorkspace.deleteMany({ where: { ownerId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
