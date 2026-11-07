import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { readAcademicWorkspace, saveAcademicWorkspace } from "./academic";
import { listAcademicCalls, mutateAcademicCalls, runScheduledAcademicCallRefresh } from "./academic-calls";
import { ACADEMIC_CALLS_HREF } from "./academic-templates";
import type { CallFeedItem } from "./call-sources";

const isStatus = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
const feed = "ukri-gb";
const subscribe = { action: "subscribe", sourceId: feed };
const unsubscribe = { action: "unsubscribe", sourceId: feed };
const refresh = { action: "refresh", sourceId: feed };
const first: CallFeedItem = {
  id: "fixture-first",
  title: "Primera convocatoria ficticia",
  url: "https://www.ukri.org/opportunity/fictitious-call/",
  summary: "Descripción pública ficticia.",
  publishedAt: "2026-06-01T00:00:00.000Z",
  deadline: "2027-03-31",
};
const second: CallFeedItem = { ...first, id: "fixture-second", title: "Segunda convocatoria ficticia", url: "https://www.ukri.org/opportunity/second-fictitious-call/" };
type Mutation = Awaited<ReturnType<typeof mutateAcademicCalls>>;
function updated(result: Mutation) {
  assert.ok("subscriptions" in result);
  assert.equal(result.subscriptions.length, 1);
  return result.subscriptions[0];
}
function imported(result: Mutation) {
  assert.ok("workspaceId" in result);
  return result;
}
function pausedRead() {
  let entered!: () => void;
  let resolve!: (items: CallFeedItem[]) => void;
  const started = new Promise<void>(ready => { entered = ready; });
  const response = new Promise<CallFeedItem[]>(ready => { resolve = ready; });
  return { started, resolve, read: () => { entered(); return response; } };
}

async function verifyScheduledRefresh(owner: CausaAccessUser, other: CausaAccessUser, db: PrismaClient) {
  const enable = { action: "set-automatic", sourceId: feed, enabled: true };
  const disable = { ...enable, enabled: false };
  const clock = (hours: number) => new Date(start + hours * 3_600_000);
  const start = Date.now() + 24 * 3_600_000;
  const notices = { userId: owner.id, tipo: "academico.convocatorias" };
  let reads = 0;
  let remote: CallFeedItem[] | undefined = [first];
  const read = async (sourceId: string) => {
    assert.equal(sourceId, feed);
    reads++;
    if (!remote) throw Error("fictitious outage");
    return remote;
  };
  const tick = (hours: number) => runScheduledAcademicCallRefresh(db, { now: clock(hours), read });
  const view = async (actor: CausaAccessUser) => (await listAcademicCalls(actor, db)).subscriptions[0];

  await mutateAcademicCalls(subscribe, owner, db);
  await assert.rejects(mutateAcademicCalls(enable, other, db), isStatus(404));
  await mutateAcademicCalls(subscribe, other, db);
  assert.equal((await view(owner)).automatic, false);
  assert.equal((await view(owner)).nextAttemptAt, null);
  await tick(0);
  assert.equal(reads, 0);
  const enabled = updated(await mutateAcademicCalls(enable, owner, db));
  assert.equal(enabled.automatic, true);
  assert.ok(enabled.nextAttemptAt && new Date(enabled.nextAttemptAt) <= clock(0));
  assert.equal(updated(await mutateAcademicCalls(enable, owner, db)).nextAttemptAt, enabled.nextAttemptAt);
  await mutateAcademicCalls(enable, other, db);

  // Same public feed is fetched once, even when both owners are due.
  assert.deepEqual(await tick(0), { refreshed: 2, failed: 0, skipped: 0, sources: 1 });
  assert.equal(reads, 1);
  assert.deepEqual((await view(owner)).items, [first]);
  assert.equal((await view(owner)).newCount, 0);
  assert.equal((await view(owner)).nextAttemptAt, clock(12).toISOString());
  assert.equal(await db.notification.count({ where: notices }), 0);
  await tick(11.99);
  assert.equal(reads, 1);

  await mutateAcademicCalls(disable, other, db);
  remote = undefined;
  assert.equal((await tick(12)).failed, 1);
  let current = await view(owner);
  assert.ok(current.error);
  assert.equal(current.checkedAt, clock(0).toISOString());
  assert.equal(current.lastAttemptAt, clock(12).toISOString());
  assert.equal(current.nextAttemptAt, clock(12.5).toISOString());
  assert.deepEqual(current.items, [first]);
  assert.equal((await tick(12.5)).failed, 1);
  assert.equal((await view(owner)).nextAttemptAt, clock(13.5).toISOString());

  remote = [{ ...first, deadline: "2027-04-30" }, second];
  assert.equal((await tick(13.5)).refreshed, 1);
  current = await view(owner);
  assert.equal(current.newCount, 1);
  assert.equal(current.changedCount, 1);
  assert.equal(current.error, null);
  const notification = await db.notification.findFirstOrThrow({ where: notices });
  assert.equal(notification.href, ACADEMIC_CALLS_HREF);
  assert.match(notification.body, /1 aviso nuevo y 1 aviso con cambios/);
  assert.equal(await db.mensajeSaliente.count({ where: { notificationId: notification.id } }), 0);
  assert.equal(await db.notification.count({ where: { ...notices, userId: other.id } }), 0);
  assert.deepEqual((await view(other)).items, [first]);
  assert.equal((await tick(25.5)).refreshed, 1);
  assert.equal((await view(owner)).newCount, 0);
  assert.equal(await db.notification.count({ where: notices }), 1);

  // A manual refresh cannot take an automatic lease. Off/on also invalidates the old scheduled result.
  const paused = pausedRead();
  const running = runScheduledAcademicCallRefresh(db, { now: clock(37.5), read: paused.read });
  await paused.started;
  await assert.rejects(mutateAcademicCalls(refresh, owner, db, { read }), isStatus(409));
  assert.equal((await tick(37.5)).sources, 0);
  await mutateAcademicCalls(disable, owner, db);
  await mutateAcademicCalls(enable, owner, db);
  paused.resolve([first]);
  assert.equal((await running).skipped, 1);
  assert.equal((await view(owner)).checkedAt, clock(25.5).toISOString());

  const revoked = pausedRead();
  const late = runScheduledAcademicCallRefresh(db, { now: clock(37.5), read: revoked.read });
  await revoked.started;
  await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
  revoked.resolve([first]);
  assert.equal((await late).skipped, 1);
  const row = await db.altazorCallSubscription.findUniqueOrThrow({ where: { ownerId_sourceId: { ownerId: owner.id, sourceId: feed } } });
  assert.equal(row.automatic, false);
  assert.equal(row.nextAttemptAt, null);
  assert.equal(row.refreshKey, null);
  assert.equal(row.checkedAt?.toISOString(), clock(25.5).toISOString());
  assert.equal(await db.notification.count({ where: notices }), 1);

  // A role that cannot access Docencia is stopped before any source request.
  await mutateAcademicCalls(enable, other, db);
  await db.user.update({ where: { id: other.id }, data: { role: "cliente" } });
  const previousReads = reads;
  assert.equal((await tick(48)).skipped, 1);
  assert.equal(reads, previousReads);
  assert.equal((await db.altazorCallSubscription.findUniqueOrThrow({ where: { ownerId_sourceId: { ownerId: other.id, sourceId: feed } } })).automatic, false);
}

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  const ids = [`call-owner-${randomUUID()}`, `call-other-${randomUUID()}`];
  const originalFetch = globalThis.fetch;
  let network = 0;
  globalThis.fetch = async () => { network++; throw Error("Unexpected real network in call fixture"); };
  try {
    const [owner, other] = await Promise.all(ids.map((id, i) => db.user.create({
      data: { id, name: "Profesional ficticio", role: i ? "admin" : "abogado", email: `${id}@example.invalid`, password: "not-a-login" },
    })));
    const catalogue = await listAcademicCalls(owner, db);
    assert.ok(catalogue.sources.some(source => source.id === feed && source.feed && source.country === "GB"));
    assert.deepEqual(catalogue.subscriptions, []);
    await assert.rejects(mutateAcademicCalls({ ...subscribe, sourceId: "not-in-catalogue" }, owner, db), isStatus(404));
    const linked = catalogue.sources.find(source => !source.feed);
    if (linked) await assert.rejects(mutateAcademicCalls({ ...subscribe, sourceId: linked.id }, owner, db), isStatus(422));
    await Promise.all([mutateAcademicCalls(subscribe, owner, db), mutateAcademicCalls(subscribe, owner, db)]);
    assert.equal(await db.altazorCallSubscription.count({ where: { ownerId: owner.id } }), 1);
    assert.deepEqual((await listAcademicCalls(other, db)).subscriptions, []);
    await assert.rejects(mutateAcademicCalls(refresh, other, db), isStatus(404));
    await assert.rejects(mutateAcademicCalls({ action: "save", sourceId: feed, itemId: first.id }, other, db), isStatus(404));

    const gate = pausedRead();
    const firstRefresh = mutateAcademicCalls(refresh, owner, db, { read: gate.read });
    await gate.started;
    await assert.rejects(mutateAcademicCalls(refresh, owner, db), isStatus(409));
    gate.resolve([first, { ...first, title: "Duplicado ficticio" }, second]);
    const original = updated(await firstRefresh);
    assert.deepEqual(original.items, [first, second]);
    assert.ok(original.checkedAt);
    const save = { action: "save", sourceId: feed, itemId: first.id, checkedAt: original.checkedAt };
    const [left, right] = (await Promise.all([mutateAcademicCalls(save, owner, db), mutateAcademicCalls(save, owner, db)])).map(imported);
    assert.equal(left.workspaceId, right.workspaceId);
    assert.notEqual(left.reused, right.reused);
    const work = await readAcademicWorkspace(left.workspaceId, owner, db);
    assert.deepEqual(work.brief.call, { country: "GB", organization: "UK Research and Innovation", url: first.url, deadline: first.deadline, status: "watching" });
    assert.equal(work.callOrigin?.checkedAt, original.checkedAt);
    assert.equal(work.callOrigin?.sourceId, feed);
    assert.equal(work.callOrigin?.itemId, first.id);
    assert.equal(work.callOrigin?.url, first.url);
    await assert.rejects(readAcademicWorkspace(left.workspaceId, other, db), isStatus(404));
    assert.equal(await db.auditEvent.count({ where: { actorId: owner.id, action: "altazor.academic.call.import" } }), 1);
    await saveAcademicWorkspace(work.id, {
      expectedRevision: work.revision, title: "Mi título personal",
      brief: { ...work.brief, call: { ...work.brief.call, deadline: "2027-02-15" } }, matrix: work.matrix,
    }, owner, db);

    const revised = { ...first, title: "Título oficial revisado", deadline: "2027-04-30" };
    const fresh = updated(await mutateAcademicCalls(refresh, owner, db, { read: async sourceId => {
      assert.equal(sourceId, feed);
      return [revised, second];
    } }));
    assert.equal(fresh.items[0].changed, true);
    assert.equal(fresh.items[0].workspaceId, work.id);
    await assert.rejects(mutateAcademicCalls({ ...save, itemId: second.id }, owner, db), isStatus(409));
    const unchanged = await readAcademicWorkspace(work.id, owner, db);
    assert.equal(unchanged.title, "Mi título personal");
    assert.equal(unchanged.brief.call.deadline, "2027-02-15");
    assert.deepEqual(unchanged.callOrigin, work.callOrigin);
    assert.equal(imported(await mutateAcademicCalls(save, owner, db)).workspace.title, "Mi título personal");

    const failed = updated(await mutateAcademicCalls(refresh, owner, db, { read: async () => { throw new Error("fictitious outage"); } }));
    assert.ok(failed.error);
    assert.equal(failed.checkedAt, fresh.checkedAt);
    assert.deepEqual(failed.items, fresh.items);

    const pending = pausedRead();
    const late = mutateAcademicCalls(refresh, owner, db, { read: pending.read });
    await pending.started;
    await mutateAcademicCalls(unsubscribe, owner, db);
    await mutateAcademicCalls(subscribe, owner, db);
    pending.resolve([first]);
    await assert.rejects(late, isStatus(409));
    const resubscribed = (await listAcademicCalls(owner, db)).subscriptions[0];
    assert.equal(resubscribed.checkedAt, null);
    assert.deepEqual(resubscribed.items, []);
    assert.equal((await readAcademicWorkspace(work.id, owner, db)).id, work.id);

    await db.altazorAcademicWorkspace.update({ where: { id: work.id }, data: { archivedAt: new Date() } });
    await assert.rejects(mutateAcademicCalls(save, owner, db), isStatus(409));
    const revoke = pausedRead();
    const concurrentRevoke = mutateAcademicCalls(refresh, owner, db, { read: revoke.read });
    await revoke.started;
    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    revoke.resolve([first]);
    await assert.rejects(concurrentRevoke, isStatus(403));
    await assert.rejects(listAcademicCalls(owner, db), isStatus(403));
    await assert.rejects(mutateAcademicCalls(subscribe, owner, db), isStatus(403));
    assert.equal((await db.altazorCallSubscription.findFirstOrThrow({ where: { ownerId: owner.id } })).checkedAt, null);
    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    await mutateAcademicCalls(unsubscribe, owner, db);
    await verifyScheduledRefresh(owner, other, db);
    assert.equal(network, 0);
    console.log("Convocatorias verificadas: permisos, deduplicación, conservación del origen, programación optativa, reintentos, carreras y avisos privados.");
  } finally {
    globalThis.fetch = originalFetch;
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
