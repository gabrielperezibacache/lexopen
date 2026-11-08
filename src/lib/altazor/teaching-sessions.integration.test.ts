import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { enableCalendarFeed, readCalendarFeed } from "./calendar-feed";
import { emptyTeachingSessionContent, TEACHING_CONTENT_LIMITS } from "./teaching-session-content";
import { createTeachingSeries, createTeachingSession, deleteTeachingSession, editTeachingSession, exportTeachingSessions, listTeachingSessions, scheduleTeachingCallDeadline, teachingCalendarSessions, updateTeachingSessionContent } from "./teaching-sessions";

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
    const legacyWorkshop = await createTeachingSession(workshop.id, { requestId: randomUUID(), title: "Taller privado", startsAtLocal: "2026-11-30T10:00" }, owner, db);
    assert.deepEqual((await listTeachingSessions(course.id, owner, db)).sessions, [first.session]);
    await assert.rejects(listTeachingSessions(course.id, other, db), statusIs(404));
    await assert.rejects(deleteTeachingSession(course.id, id, other, db), statusIs(404));
    await assert.rejects(deleteTeachingSession(workshop.id, id, owner, db), statusIs(404));

    const empty = emptyTeachingSessionContent();
    assert.deepEqual(first.session.content, empty);
    assert.equal(first.session.contentRevision, 0);
    assert.deepEqual(await updateTeachingSessionContent(course.id, id, { expectedRevision: 0, content: empty }, owner, db),
      { contentRevision: 0, content: empty });
    const content = {
      readings: [
        { title: "Lectura: capítulo 2", href: "/biblioteca/libro-ficticio" },
        { title: "Pasaje de discusión", href: "/biblioteca/libro-ficticio?fragment=12#fragment-12" },
      ],
      materials: [{ title: "Presentación del taller", href: "https://example.invalid/material.pdf" }],
      outcomes: ["Comparar dos argumentos."],
      speakers: ["Ponente ficticia", "Segundo ponente"],
      moderators: ["Moderadora ficticia"],
      location: "Sala ficticia 204 · modalidad híbrida",
      activity: "Compara dos argumentos.\nRedacta una conclusión fundamentada.",
    };
    const update = { expectedRevision: 0, content };
    await assert.rejects(updateTeachingSessionContent(course.id, id, update, other, db), statusIs(404));
    await assert.rejects(updateTeachingSessionContent(workshop.id, id, update, owner, db), statusIs(404));
    for (const href of [
      "javascript:alert(1)", "//example.invalid/material", "http://example.invalid/",
      "https://usuario:secreto@example.invalid/", "https://example.invalid/a\nb", "/biblioteca/../clientes",
      "/biblioteca/libro?fragment=1#fragment-2", "/biblioteca/libro?fragment=0#fragment-0",
      "/biblioteca/libro?fragment=9007199254740992#fragment-9007199254740992",
    ]) {
      await assert.rejects(updateTeachingSessionContent(course.id, id, {
        expectedRevision: 0, content: { ...empty, readings: [{ title: "Lectura", href }] },
      }, owner, db), { name: "ZodError" });
    }
    await assert.rejects(updateTeachingSessionContent(course.id, id, {
      expectedRevision: 0, content: { ...empty, outcomes: ["Objetivo válido\n## encabezado"] },
    }, owner, db), { name: "ZodError" });
    await assert.rejects(updateTeachingSessionContent(course.id, id, {
      expectedRevision: 0, content: { ...empty, outcomes: Array(TEACHING_CONTENT_LIMITS.itemsPerGroup + 1).fill("Resultado") },
    }, owner, db), { name: "ZodError" });
    for (const invalid of [
      { speakers: [" "] },
      { speakers: ["Ponente\n## encabezado"] },
      { speakers: Array(TEACHING_CONTENT_LIMITS.itemsPerGroup + 1).fill("Ponente") },
      { speakers: ["x".repeat(TEACHING_CONTENT_LIMITS.nameLength + 1)] },
      { moderators: [""] },
      { moderators: ["Moderación\rprivada"] },
      { moderators: Array(TEACHING_CONTENT_LIMITS.itemsPerGroup + 1).fill("Moderación") },
      { moderators: ["x".repeat(TEACHING_CONTENT_LIMITS.nameLength + 1)] },
      { location: "" },
      { location: "Sala\nnueva línea" },
      { location: "x".repeat(TEACHING_CONTENT_LIMITS.locationLength + 1) },
      { activity: " " },
      { activity: "x".repeat(TEACHING_CONTENT_LIMITS.activityLength + 1) },
      { activity: "Consigna\u0000oculta" },
    ]) {
      await assert.rejects(updateTeachingSessionContent(course.id, id, {
        expectedRevision: 0, content: { ...empty, ...invalid },
      }, owner, db), { name: "ZodError" });
    }
    const token = (await enableCalendarFeed(course.id, owner, db)).path.split("/").at(-1)!;
    const publicBefore = await readCalendarFeed(token, db);
    const beforeContent = await db.altazorTeachingSession.findUniqueOrThrow({ where: { id } });
    const concurrent = await Promise.allSettled([
      updateTeachingSessionContent(course.id, id, update, owner, db),
      updateTeachingSessionContent(course.id, id, { ...update, content: { ...content, outcomes: ["Evaluar una objeción."] } }, owner, db),
    ]);
    const saved = concurrent.find(result => result.status === "fulfilled");
    const conflict = concurrent.find(result => result.status === "rejected");
    assert.ok(saved && conflict && statusIs(409)(conflict.reason));
    assert.equal(saved.value.contentRevision, 1);
    const [withContent] = (await listTeachingSessions(course.id, owner, db)).sessions;
    assert.deepEqual(withContent.content, saved.value.content);
    assert.equal(withContent.contentRevision, 1);
    const afterContent = await db.altazorTeachingSession.findUniqueOrThrow({ where: { id } });
    assert.equal(afterContent.updatedAt.getTime(), beforeContent.updatedAt.getTime());
    assert.equal(afterContent.calendarSequence, beforeContent.calendarSequence);
    assert.equal(await readCalendarFeed(token, db), publicBefore);
    const exportedContent = await exportTeachingSessions(course.id, owner, db);
    for (const privateValue of ["Lectura: capítulo 2", ...content.speakers, ...content.moderators, content.location, "Redacta una conclusión fundamentada."]) {
      assert.ok(!exportedContent.includes(privateValue));
    }
    const legacyContent = { readings: [{ title: "Lectura anterior" }], materials: [], outcomes: ["Resultado anterior"] };
    await db.altazorTeachingSession.update({ where: { id: legacyWorkshop.session.id }, data: { contentJson: JSON.stringify(legacyContent) } });
    assert.deepEqual((await listTeachingSessions(workshop.id, owner, db)).sessions[0].content, legacyContent);

    const range = { start: new Date("2026-11-30T03:00:00Z"), end: new Date("2026-12-01T02:59:59Z") };
    assert.deepEqual((await teachingCalendarSessions(owner, range, db)).map(item => item.workspaceId), [workshop.id, course.id]);
    assert.deepEqual(await teachingCalendarSessions(other, range, db), []);
    assert.equal(await db.evento.count({ where: { titulo: data.title } }), 0);
    const revoked = await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    await assert.rejects(listTeachingSessions(course.id, owner, db), statusIs(403));
    await assert.rejects(updateTeachingSessionContent(course.id, id, { ...update, expectedRevision: 1 }, owner, db), statusIs(403));
    assert.deepEqual(await teachingCalendarSessions(revoked, range, db), []);
    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });

    await db.altazorAcademicWorkspace.update({ where: { id: course.id }, data: { archivedAt: new Date() } });
    assert.deepEqual((await teachingCalendarSessions(owner, range, db)).map(item => item.workspaceId), [workshop.id]);
    await assert.rejects(listTeachingSessions(course.id, owner, db), statusIs(404));
    await assert.rejects(updateTeachingSessionContent(course.id, id, { ...update, expectedRevision: 1 }, owner, db), statusIs(404));
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
    await assert.rejects(updateTeachingSessionContent(call.id, scheduled.session.id, update, owner, db), statusIs(409));
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

    const seriesInput = {
      requestId: randomUUID(), title: "Seminario semanal", startsAtLocal: "2026-08-30T09:00",
      endsAtLocal: "2026-08-30T10:00", recurrence: { count: 3, intervalWeeks: 1 }, reminderLeadMinutes: 60,
    };
    await assert.rejects(createTeachingSeries(course.id, seriesInput, other, db), statusIs(404));
    await assert.rejects(createTeachingSeries(course.id, { ...seriesInput, requestId: randomUUID(),
      startsAtLocal: "2026-08-30T00:30", endsAtLocal: null }, owner, db), statusIs(400));
    assert.equal(await db.altazorTeachingSeries.count({ where: { workspaceId: course.id } }), 0);
    assert.equal(await db.altazorTeachingSession.count({ where: { workspaceId: course.id } }), 0);

    const [series, retriedSeries] = await Promise.all([
      createTeachingSeries(course.id, seriesInput, owner, db), createTeachingSeries(course.id, seriesInput, owner, db),
    ]);
    assert.notEqual(series.reused, retriedSeries.reused);
    assert.deepEqual(series.sessions, retriedSeries.sessions);
    assert.deepEqual(series.sessions.map(item => item.startsAtLocal), ["2026-08-30T09:00", "2026-09-06T09:00", "2026-09-13T09:00"]);
    assert.deepEqual(series.sessions.map(item => item.startsAt), ["2026-08-30T13:00:00.000Z", "2026-09-06T12:00:00.000Z", "2026-09-13T12:00:00.000Z"]);
    const [earliest, middle, latest] = series.sessions;
    assert.deepEqual(middle.series, { id: earliest.series!.id, occurrence: 2, count: 3, intervalWeeks: 1 });
    assert.equal(middle.reminderLeadMinutes, 60);
    await assert.rejects(createTeachingSeries(course.id, { ...seriesInput, recurrence: { intervalWeeks: 2, count: 3 } }, owner, db), statusIs(409));
    const singleInput = { requestId: seriesInput.requestId, title: seriesInput.title, startsAtLocal: seriesInput.startsAtLocal };
    await assert.rejects(createTeachingSession(course.id, singleInput, owner, db), statusIs(409));
    await assert.rejects(db.altazorTeachingSession.create({ data: {
      workspaceId: workshop.id, requestId: randomUUID(), title: "Ámbito incorrecto",
      startsAt: new Date(), seriesId: earliest.series!.id, seriesOccurrence: 4,
    } }), (error: unknown) => (error as { code?: string }).code === "P2003");

    const edit = { title: "Segunda sesión reprogramada", startsAtLocal: "2026-08-29T11:30", endsAtLocal: null, expectedSequence: 0 };
    await assert.rejects(editTeachingSession(course.id, middle.id, edit, other, db), statusIs(404));
    await assert.rejects(editTeachingSession(call.id, rescheduled.session.id, edit, owner, db), statusIs(409));
    await Promise.all([
      editTeachingSession(course.id, middle.id, edit, owner, db),
      updateTeachingSessionContent(course.id, middle.id, update, owner, db),
    ]);
    const [moved, untouchedFirst, untouchedLast] = (await listTeachingSessions(course.id, owner, db)).sessions;
    assert.equal(moved.id, middle.id);
    assert.equal(moved.calendarSequence, 1);
    assert.equal(moved.contentRevision, 1);
    assert.deepEqual(moved.content, content);
    assert.deepEqual([untouchedFirst, untouchedLast], [earliest, latest]);
    assert.deepEqual(moved.series, middle.series);
    assert.equal(moved.endsAt, null);
    assert.equal(moved.reminderLeadMinutes, 60);
    assert.equal((await db.altazorTeachingSession.findUniqueOrThrow({ where: { id: moved.id } })).reminderDueAt?.toISOString(), "2026-08-29T14:30:00.000Z");
    assert.equal((await editTeachingSession(course.id, middle.id, { ...edit, expectedSequence: 1 }, owner, db)).session.calendarSequence, 1);
    await assert.rejects(editTeachingSession(course.id, middle.id, edit, owner, db), statusIs(409));
    assert.deepEqual((await createTeachingSeries(course.id, seriesInput, owner, db)).sessions, [earliest, moved, latest]);
    await assert.rejects(deleteTeachingSession(course.id, middle.id, other, db, "following"), statusIs(404));
    await assert.rejects(deleteTeachingSession(call.id, rescheduled.session.id, owner, db, "following"), statusIs(409));
    await deleteTeachingSession(course.id, middle.id, owner, db, "following");
    assert.deepEqual((await listTeachingSessions(course.id, owner, db)).sessions, [earliest]);
    await deleteTeachingSession(course.id, earliest.id, owner, db);
    assert.deepEqual(await createTeachingSeries(course.id, seriesInput, owner, db), { session: null, sessions: [], reused: true });

    const fortnightly = await createTeachingSeries(course.id, {
      ...seriesInput, requestId: randomUUID(), startsAtLocal: "2026-12-28T12:15",
      endsAtLocal: null, recurrence: { intervalWeeks: 2, count: 2 },
    }, owner, db);
    assert.deepEqual(fortnightly.sessions.map(item => item.startsAtLocal), ["2026-12-28T12:15", "2027-01-11T12:15"]);
    assert.deepEqual(await db.altazorTeachingSession.createMany({ data: Array.from({ length: 197 }, () => ({
      workspaceId: course.id, requestId: randomUUID(), title: "Actividad de prueba", startsAt: new Date("2027-02-01T09:00:00Z"),
    })) }), { count: 197 });
    const capacityKey = randomUUID();
    await assert.rejects(createTeachingSeries(course.id, { ...seriesInput, requestId: capacityKey }, owner, db), statusIs(413));
    assert.equal(await db.altazorTeachingSeries.count({ where: { workspaceId: course.id, requestId: capacityKey } }), 0);
    assert.equal(await db.altazorTeachingSession.count({ where: { workspaceId: course.id } }), 199);
    console.log("Teaching sessions passed: ownership, content revisions and calendar privacy, Santiago time, recurring DST and limits, replay, edits, removal by series order and call deadlines.");
  } finally {
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.altazorAcademicWorkspace.deleteMany({ where: { ownerId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
