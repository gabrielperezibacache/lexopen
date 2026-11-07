import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { calendarFeedStatus, enableCalendarFeed, readCalendarFeed, revokeCalendarFeed } from "./calendar-feed";
import { calendarSubscriptionTokenPattern, canEnableCalendarFeed, canReadCalendarFeed, isCalendarSubscriptionPath } from "./calendar-feed-policy";
import { createTeachingSession, deleteTeachingSession, scheduleTeachingCallDeadline } from "./teaching-sessions";

const statusIs = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
const tokenFrom = (path: string) => {
  assert.equal(isCalendarSubscriptionPath(path), true);
  const token = path.split("/").at(-1)!;
  assert.match(token, calendarSubscriptionTokenPattern);
  assert.equal(Buffer.from(token, "base64url").length, 32);
  return token;
};

async function main() {
  const database = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(database, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url: database } } });
  const ids = [`calendar-owner-${randomUUID()}`, `calendar-other-${randomUUID()}`];
  try {
    const [owner, other] = await Promise.all(ids.map((id, index) => db.user.create({
      data: { id, email: `${id}@example.invalid`, name: "Profesional de prueba", role: index ? "admin" : "abogado", password: "not-a-login" },
    })));
    const work = await db.altazorAcademicWorkspace.create({ data: {
      ownerId: owner.id, requestId: randomUUID(), title: "Nombre privado de trabajo", kind: "call",
      briefJson: JSON.stringify({ objective: "Una nota privada", call: { deadline: "2026-12-15" } }),
    } });
    const research = await db.altazorAcademicWorkspace.create({
      data: { ownerId: owner.id, requestId: randomUUID(), title: "Investigación ficticia", kind: "research" },
    });
    const activity = await createTeachingSession(work.id, {
      requestId: randomUUID(), title: "Sesión · academia\r\nATTENDEE:ficticio", startsAtLocal: "2026-12-14T20:15", endsAtLocal: "2026-12-14T21:15",
    }, owner, db);
    assert.deepEqual(await calendarFeedStatus(work.id, owner, db), { enabled: false, enabledAt: null });
    await assert.rejects(enableCalendarFeed(work.id, other, db), statusIs(404));
    await assert.rejects(enableCalendarFeed(research.id, owner, db), statusIs(404));
    const issued = await enableCalendarFeed(work.id, owner, db);
    const token = tokenFrom(issued.path);
    const digest = createHash("sha256").update(token).digest("hex");
    const stored = await db.altazorAcademicWorkspace.findUniqueOrThrow({ where: { id: work.id } });
    assert.equal(stored.calendarFeedTokenHash, digest);
    assert.equal(JSON.stringify(stored).includes(token), false);
    assert.deepEqual(await calendarFeedStatus(work.id, owner, db), { enabled: true, enabledAt: issued.enabledAt });
    await assert.rejects(calendarFeedStatus(work.id, other, db), statusIs(404));
    await assert.rejects(revokeCalendarFeed(work.id, other, db), statusIs(404));
    await assert.rejects(readCalendarFeed("unauthorized", db), statusIs(404));
    await assert.rejects(readCalendarFeed("a".repeat(43), db), statusIs(404));

    const firstFeed = await readCalendarFeed(token, db);
    assert.equal(await readCalendarFeed(token, db), firstFeed);
    assert.ok(firstFeed.includes(`UID:${activity.session.id}@lexopen`));
    assert.match(firstFeed, /DTSTART:20261214T231500Z\r\nDTEND:20261215T001500Z/);
    assert.ok(firstFeed.includes("SUMMARY:Sesión · academia\\nATTENDEE:ficticio"));
    for (const forbidden of ["ATTENDEE:ficticio\r\nEND:VEVENT", "Nombre privado de trabajo", "Una nota privada", token, "METHOD:PUBLISH"]) {
      if (forbidden.startsWith("ATTENDEE:")) {
        assert.equal(firstFeed.includes(`\r\n${forbidden}`), false);
      } else assert.equal(firstFeed.includes(forbidden), false);
    }
    const deadline = { action: "schedule-call-deadline", date: "2026-12-15", localDate: "2026-12-14", time: "15:30" };
    const first = await scheduleTeachingCallDeadline(work.id, deadline, owner, db);
    const second = await scheduleTeachingCallDeadline(work.id, { ...deadline, time: "18:30" }, owner, db);
    assert.equal(first.session.id, second.session.id);
    const updatedFeed = await readCalendarFeed(token, db);
    const event = updatedFeed.split("BEGIN:VEVENT").find(item => item.includes(`UID:${first.session.id}@lexopen`))!;
    assert.match(event, /LAST-MODIFIED:\d{8}T\d{6}Z\r\nSEQUENCE:1\r\nDTSTART:20261214T213000Z/);
    assert.equal(event.includes("DTSTART:20261214T183000Z"), false);
    await deleteTeachingSession(work.id, activity.session.id, owner, db);
    assert.equal((await readCalendarFeed(token, db)).includes(`UID:${activity.session.id}@lexopen`), false);

    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    await assert.rejects(readCalendarFeed(token, db), statusIs(404));
    await assert.rejects(calendarFeedStatus(work.id, owner, db), statusIs(403));
    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    await db.altazorAcademicWorkspace.update({ where: { id: work.id }, data: { archivedAt: new Date() } });
    await assert.rejects(readCalendarFeed(token, db), statusIs(404));
    await db.altazorAcademicWorkspace.update({ where: { id: work.id }, data: { archivedAt: null } });
    const rotated = tokenFrom((await enableCalendarFeed(work.id, owner, db)).path);
    assert.notEqual(rotated, token);
    await assert.rejects(readCalendarFeed(token, db), statusIs(404));
    assert.match(await readCalendarFeed(rotated, db), /BEGIN:VCALENDAR/);
    assert.deepEqual(await revokeCalendarFeed(work.id, owner, db), { enabled: false, enabledAt: null });
    assert.deepEqual(await revokeCalendarFeed(work.id, owner, db), { enabled: false, enabledAt: null });
    await assert.rejects(readCalendarFeed(rotated, db), statusIs(404));
    const audit = await db.auditEvent.findMany({ where: { actorId: owner.id, entityId: work.id } });
    const auditJson = JSON.stringify(audit);
    assert.equal([token, digest, rotated].some(secret => auditJson.includes(secret)), false);
    assert.equal(audit.filter(item => item.action === "altazor.teaching.feed-revoke").length, 1);

    assert.equal(canEnableCalendarFeed(new Request("http://host.lan", { headers: { origin: "http://host.lan" } })), false);
    assert.equal(canEnableCalendarFeed(new Request("http://127.0.0.1", { headers: { origin: "http://127.0.0.1" } })), true);
    assert.equal(canEnableCalendarFeed(new Request("http://internal", { headers: { origin: "https://secure.example.invalid" } })), true);
    assert.equal(canReadCalendarFeed(new Request("http://localhost/feed", { headers: { host: "external.example.invalid" } })), false);
    assert.equal(canReadCalendarFeed(new Request("http://127.0.0.1:3499/feed", { headers: { host: "127.0.0.1:3499" } })), true);
    assert.equal(canReadCalendarFeed(new Request("https://secure.example.invalid/feed")), true);
    assert.equal(isCalendarSubscriptionPath(`${issued.path}/calendar-feed`), false);
    assert.equal(isCalendarSubscriptionPath("/api/altazor/academic/work-id/calendar-feed"), false);
    console.log("Teaching calendar subscriptions passed: owner scope, token hashing, live permission and archive checks, ICS updates/removal, rotation/revocation, and transport.");
  } finally {
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.altazorAcademicWorkspace.deleteMany({ where: { ownerId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
