/** Real disposable PostgreSQL pipeline, synthetic session callbacks, no OJV/network. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { syncMisCausas, type MisCausasSessionSource } from "@/lib/pjud/claveunica";
import { getPjudQueueStatus, processPendingSyncJobs, requeueFailedJobs, reclaimStuckRunningJobs, enqueueDueSyncJobs, PJUD_MANUAL_SESSION_TRIGGER, PJUD_MANUAL_SESSION_JOB_TTL_MS } from "@/lib/pjud/queue";
import { normalizeCuadernosCoverage } from "@/lib/pjud/cuadernos-coverage";
import { scrapeMovimientoIdentity, type MisCausasItem } from "@/lib/pjud/types";

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  // Run before other integration suites or against a separate fresh test DB.
  assert.equal(await prisma.organization.count(), 0, "session pipeline fixture requires a fresh test organization scope");
  const envNames = ["PJUD_PUBLIC_SCRAPE", "PJUD_CLAVEUNICA_SCRAPE", "PJUD_PDF_BACKUP", "PJUD_ALLOW_DEMO", "PJUD_DOC_DOWNLOADS"] as const;
  const priorEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let orgId = "";
  const causaIds: string[] = [];
  const tag = randomUUID();
  const rol = Date.now() % 900_000 + 100_000;
  const items: MisCausasItem[] = [0, 1].map(index => ({
    rit: `C-${rol + index}-2026`, tribunal: "1º Juzgado Civil de Santiago",
    caratula: `Fictitious session pipeline ${tag} ${index}`, estado: "Tramitación",
  }));
  let listCalls = 0;
  let detailCalls = 0;
  let networkCalls = 0;
  let active = 0;
  let maxActive = 0;
  const source: MisCausasSessionSource = {
    listMisCausas: async () => {
      const claimed = await prisma.firmSettings.findUniqueOrThrow({ where: { organizationId: orgId } });
      assert.equal(claimed.claveUnicaLastSyncStatus, "running", "list retrieval must run after the durable claim");
      listCalls += 1;
      // The synthetic provider is internal. Disable the ordinary network path
      // after the entry guard so a lost callback cannot launch a real browser.
      process.env.PJUD_PUBLIC_SCRAPE = "0";
      return items;
    },
    fetchMovimientos: async (causa) => {
      assert.ok(items.some(item => item.rit === causa.rit && item.tribunal === causa.tribunal));
      detailCalls += 1;
      assert.ok(await prisma.pjudSyncJob.findFirst({ where: { causaId: causa.id, status: "running" } }), "detail retrieval must run from a claimed durable job");
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        await new Promise(resolve => setTimeout(resolve, 10));
        const fecha = new Date("2026-11-01T12:00:00Z");
        return {
          provider: "scrape", demo: false, note: "Synthetic authenticated session result",
          movimientos: [{
            ...scrapeMovimientoIdentity("Resolución ficticia de sesión", fecha, "1", "Principal"),
            titulo: "Resolución ficticia de sesión", fecha, fuente: "pjud", folio: "1", cuaderno: "Principal",
          }],
        };
      } finally { active -= 1; }
    },
  };
  try {
    process.env.PJUD_PUBLIC_SCRAPE = "1";
    process.env.PJUD_CLAVEUNICA_SCRAPE = "1";
    process.env.PJUD_PDF_BACKUP = "0";
    process.env.PJUD_ALLOW_DEMO = "0";
    globalThis.fetch = async () => { networkCalls += 1; throw new Error("Network is forbidden in the pipeline fixture"); };
    const org = await prisma.organization.create({ data: { name: `Synthetic session ${tag}`, settings: { create: { caseManagementMode: "pjud_cl" } } } });
    orgId = org.id;
    const unrelated = await prisma.causa.create({ data: { titulo: `Unrelated fixture ${tag}`, tribunal: "Tribunal ficticio", materia: "Fixture" } });
    causaIds.push(unrelated.id);
    // Race an ordinary worker immediately after each insert, before the inline
    // session worker gets the IDs. The reservation must already be durable.
    const originalJobCreate = prisma.pjudSyncJob.create;
    let ordinaryDrainChecks = 0;
    prisma.pjudSyncJob.create = (async (args: Parameters<typeof originalJobCreate>[0]) => {
      const job = await originalJobCreate(args);
      if (args.data.trigger === PJUD_MANUAL_SESSION_TRIGGER) {
        assert.equal(job.trigger, PJUD_MANUAL_SESSION_TRIGGER);
        assert.deepEqual(await processPendingSyncJobs({ jobIds: [job.id] }), []);
        assert.deepEqual(await processPendingSyncJobs(), []);
        const untouched = await prisma.pjudSyncJob.findUniqueOrThrow({ where: { id: job.id } });
        assert.equal(untouched.status, "pending");
        assert.equal(untouched.attempts, 0);
        ordinaryDrainChecks++;
      }
      return job;
    }) as unknown as typeof originalJobCreate;
    let first: Awaited<ReturnType<typeof syncMisCausas>>;
    try {
      first = await syncMisCausas({ sessionSource: source, processJobsInline: true });
    } finally { prisma.pjudSyncJob.create = originalJobCreate; }
    assert.equal(ordinaryDrainChecks, 2, "ordinary workers must ignore reserved jobs, with and without explicit IDs");
    const unrelatedJob = await prisma.pjudSyncJob.create({ data: { causaId: unrelated.id, status: "running", startedAt: new Date(0) } });
    causaIds.push(...first.items.map(item => item.causaId));
    assert.equal(first.created, 2);
    assert.equal(first.linked, 0);
    assert.equal(first.enqueued, 2);
    assert.equal(first.enqueuedJobIds.length, 2);
    assert.equal(first.syncOk, 2);
    assert.equal(first.syncFailed, 0);
    assert.equal(first.inserted, 2);
    assert.equal(await prisma.causaMovimiento.count({ where: { causaId: { in: first.items.map(item => item.causaId) } } }), 2);
    const firstJobs = await prisma.pjudSyncJob.findMany({ where: { id: { in: first.enqueuedJobIds } } });
    assert.ok(firstJobs.every(job => job.status === "ok" && job.attempts === 1 && job.inserted === 1 && job.trigger === PJUD_MANUAL_SESSION_TRIGGER));
    const beforeIds = (await prisma.causaMovimiento.findMany({ where: { causaId: { in: first.items.map(item => item.causaId) } }, select: { id: true }, orderBy: { id: "asc" } })).map(row => row.id);

    process.env.PJUD_PUBLIC_SCRAPE = "1";
    const second = await syncMisCausas({ sessionSource: source, processJobsInline: true });
    assert.equal(second.created, 0);
    assert.equal(second.linked, 2);
    assert.equal(second.enqueued, 2);
    assert.equal(second.syncOk, 2);
    assert.equal(second.inserted, 0);
    const secondJobs = await prisma.pjudSyncJob.findMany({ where: { id: { in: second.enqueuedJobIds } } });
    assert.ok(secondJobs.every(job => job.status === "ok" && job.inserted === 0 && job.skipped === 1));
    const afterIds = (await prisma.causaMovimiento.findMany({ where: { causaId: { in: first.items.map(item => item.causaId) } }, select: { id: true }, orderBy: { id: "asc" } })).map(row => row.id);
    assert.deepEqual(afterIds, beforeIds, "repeated session sync must preserve the same movement rows");
    assert.equal(listCalls, 2);
    assert.equal(detailCalls, 4, "each queued job must invoke the session provider in real time");
    assert.equal(maxActive, 1, "a Page-backed session must not navigate concurrently");
    assert.equal(networkCalls, 0, "session jobs must not fall back to vault, sidecar or public provider");
    assert.equal((await prisma.pjudSyncJob.findUniqueOrThrow({ where: { id: unrelatedJob.id } })).status, "running", "selected jobs must not reclaim an unrelated stuck job");
    const settings = await prisma.firmSettings.findUniqueOrThrow({ where: { organizationId: orgId } });
    assert.equal(settings.claveUnicaRut, null);
    assert.equal(settings.claveUnicaPasswordEnc, null);
    assert.equal(settings.claveUnicaEnabled, false);
    assert.equal(settings.claveUnicaLastSyncStatus, "ok");

    const pendingJob = await prisma.pjudSyncJob.create({ data: {
      causaId: first.items[0].causaId, status: "pending", attempts: 0,
      note: "Pending job belongs to another worker",
    } });
    const runningJob = await prisma.pjudSyncJob.create({ data: {
      causaId: first.items[1].causaId, status: "running", attempts: 1,
      startedAt: new Date(0), note: "Stuck job belongs to another worker",
    } });
    process.env.PJUD_PUBLIC_SCRAPE = "1";
    const busy = await syncMisCausas({ sessionSource: source, processJobsInline: true });
    assert.equal(busy.enqueued, 0);
    assert.equal(busy.syncOk, 0);
    assert.equal(busy.syncFailed, 2, "existing jobs must not count as session-backed success");
    assert.equal(detailCalls, 4, "busy jobs must not invoke this session's provider");
    assert.ok(busy.syncResults.every(result => /pendiente o en curso/.test(result.note || "")));
    assert.equal((await prisma.firmSettings.findUniqueOrThrow({ where: { organizationId: orgId } })).claveUnicaLastSyncStatus, "failed");
    assert.deepEqual(await prisma.pjudSyncJob.findUniqueOrThrow({ where: { id: pendingJob.id } }), pendingJob);
    assert.deepEqual(await prisma.pjudSyncJob.findUniqueOrThrow({ where: { id: runningJob.id } }), runningJob,
      "an ephemeral session must not reclaim even an old running job owned by another worker");

    await prisma.pjudSyncJob.delete({ where: { id: pendingJob.id } });
    process.env.PJUD_PUBLIC_SCRAPE = "1";
    const partial = await syncMisCausas({ sessionSource: source, processJobsInline: true });
    assert.equal(partial.enqueued, 1);
    assert.equal(partial.syncOk, 1);
    assert.equal(partial.syncFailed, 1);
    assert.equal(partial.inserted, 0);
    assert.equal(detailCalls, 5);
    const partialSettings = await prisma.firmSettings.findUniqueOrThrow({ where: { organizationId: orgId } });
    assert.equal(partialSettings.claveUnicaLastSyncStatus, "partial");
    assert.match(partialSettings.claveUnicaLastSyncNote || "", /pendiente o en curso/);
    assert.deepEqual(await prisma.pjudSyncJob.findUniqueOrThrow({ where: { id: runningJob.id } }), runningJob);

    await assert.rejects(processPendingSyncJobs({ fetchMovimientos: source.fetchMovimientos }), /trabajos explícitos/);
    process.env.PJUD_CLAVEUNICA_SCRAPE = "0";
    process.env.PJUD_PUBLIC_SCRAPE = "1";
    await assert.rejects(syncMisCausas({ sessionSource: source, syncMovimientos: false }), /deshabilitada/);
    assert.equal(listCalls, 4, "kill switch must run before session access");
    assert.equal((await prisma.firmSettings.findUniqueOrThrow({ where: { organizationId: orgId } })).claveUnicaLastSyncStatus, "failed");

    // A partial cuaderno read must survive persistence and cannot be counted as
    // a successful matter. Per-session document policy wins over host defaults.
    await prisma.pjudSyncJob.delete({ where: { id: runningJob.id } });
    process.env.PJUD_CLAVEUNICA_SCRAPE = "1";
    process.env.PJUD_PDF_BACKUP = "1";
    process.env.PJUD_DOC_DOWNLOADS = "1";
    const ownIds = first.items.map(item => item.causaId);
    await prisma.causaMovimiento.updateMany({ where: { causaId: { in: ownIds } }, data: {
      documentoRef: "https://oficinajudicialvirtual.pjud.cl/documentos/ficticio.pdf",
    } });
    let guardCalls = 0;
    const firstRead = prisma.causaMovimiento.findFirst;
    let documentReads = 0;
    prisma.causaMovimiento.findFirst = (async (args: Parameters<typeof firstRead>[0]) => {
      if (args?.select?.documentoRef) documentReads++;
      return firstRead(args);
    }) as typeof firstRead;
    const incompleteCoverage = {
      status: "partial" as const, total: 2, read: 1, items: [
        { key: "cuaderno:1.0", label: "1.0 - Principal", status: "ok" as const, count: 1 },
        { key: "cuaderno:2.0", label: "2.0 - Incidente", status: "failed" as const, count: 0, note: "Respuesta ficticia incompleta." },
      ],
    };
    const completeCoverage = { status: "complete" as const, total: 1, read: 1, items: [incompleteCoverage.items[0]] };
    const scopedSource: MisCausasSessionSource = {
      ...source,
      downloadDocuments: false,
      assertActive: async () => { guardCalls++; },
      fetchMovimientos: async causa => {
        const result = await source.fetchMovimientos(causa);
        return { ...result, cuadernos: incompleteCoverage, movimientos: result.movimientos.map(movement => ({
          ...movement, documentoBytes: Buffer.from("%PDF-fictitious-not-to-be-imported"),
        })) };
      },
    };
    try {
      process.env.PJUD_PUBLIC_SCRAPE = "1";
      const incomplete = await syncMisCausas({ sessionSource: scopedSource, processJobsInline: true });
      assert.equal(incomplete.syncOk, 0);
      assert.equal(incomplete.syncPartial, 2);
      assert.equal(incomplete.syncFailed, 0);
      assert.equal(incomplete.inserted, 0);
      const incompleteJobs = await prisma.pjudSyncJob.findMany({ where: { id: { in: incomplete.enqueuedJobIds } } });
      assert.ok(incompleteJobs.every(job => job.status === "partial" && normalizeCuadernosCoverage(job.pjudCuadernosCoverage).read === 1));
      const incompleteCauses = await prisma.causa.findMany({ where: { id: { in: ownIds } } });
      assert.ok(incompleteCauses.every(causa => causa.pjudLastSyncStatus === "partial" && causa.pjudFailCount === 1 && normalizeCuadernosCoverage(causa.pjudCuadernosCoverage).status === "partial"));
      assert.equal((await prisma.firmSettings.findUniqueOrThrow({ where: { organizationId: orgId } })).claveUnicaLastSyncStatus, "partial");
      assert.equal((await getPjudQueueStatus()).partial, 2);

      const recoveredSource: MisCausasSessionSource = { ...scopedSource, fetchMovimientos: async causa => ({
        ...await scopedSource.fetchMovimientos(causa), cuadernos: completeCoverage,
      }) };
      const retry = await requeueFailedJobs({ causaIds: [ownIds[0]] });
      assert.equal(retry.length, 0, "session-backed partial jobs require a new manual session, never a generic retry");
      assert.equal((await prisma.pjudSyncJob.findUniqueOrThrow({ where: { id: unrelatedJob.id } })).status, "running", "a selected retry must not reclaim another cause's stuck job");
      process.env.PJUD_PUBLIC_SCRAPE = "1";
      const recovered = await syncMisCausas({ sessionSource: recoveredSource, processJobsInline: true });
      assert.equal(recovered.syncOk, 2);
      assert.equal(recovered.syncPartial, 0);
      assert.equal(recovered.inserted, 0);
      assert.equal((await getPjudQueueStatus()).partial, 0, "a completed recovery dismisses old pending partial notices");
      assert.ok((await prisma.causa.findMany({ where: { id: { in: ownIds } } })).every(causa => causa.pjudFailCount === 0 && normalizeCuadernosCoverage(causa.pjudCuadernosCoverage).status === "complete"));
      assert.ok(guardCalls > 10, "session ownership must be rechecked throughout import and persistence");
      assert.equal(documentReads, 0, "per-session policy must skip captured PDF ingestion");
      assert.equal(networkCalls, 0, "per-session policy must skip fallback PDF downloads too");
      const detailCallsBeforeCancel = detailCalls;
      process.env.PJUD_PUBLIC_SCRAPE = "1";
      await assert.rejects(syncMisCausas({ sessionSource: { ...recoveredSource, assertActive: async () => {
        if (await prisma.pjudSyncJob.count({ where: { causaId: { in: ownIds }, status: "pending" } })) throw new Error("Synthetic cancellation after enqueue");
      } }, processJobsInline: true }), /cancellation/);
      assert.equal(detailCalls, detailCallsBeforeCancel);
      assert.equal(await prisma.pjudSyncJob.count({ where: { causaId: { in: ownIds }, status: "pending" } }), 0,
        "cancelled sessions must not leave their own jobs to an unrelated provider");
      assert.equal((await prisma.pjudSyncJob.findUniqueOrThrow({ where: { id: unrelatedJob.id } })).status, "running");
      const pendingBeforeBrokenBatch = await prisma.pjudSyncJob.findMany({ where: { causaId: { in: ownIds } }, select: { id: true } });
      const priorJobIds = new Set(pendingBeforeBrokenBatch.map(job => job.id));
      let createCount = 0;
      prisma.pjudSyncJob.create = (async (args: Parameters<typeof originalJobCreate>[0]) => {
        if (args.data.trigger === PJUD_MANUAL_SESSION_TRIGGER && ++createCount === 2) throw new Error("Synthetic second enqueue failure");
        return originalJobCreate(args);
      }) as unknown as typeof originalJobCreate;
      process.env.PJUD_PUBLIC_SCRAPE = "1";
      try {
        await assert.rejects(syncMisCausas({ sessionSource: recoveredSource, processJobsInline: true }), /second enqueue failure/);
      } finally { prisma.pjudSyncJob.create = originalJobCreate; }
      const newJobs = (await prisma.pjudSyncJob.findMany({ where: { causaId: { in: ownIds } } })).filter(job => !priorJobIds.has(job.id));
      assert.equal(newJobs.length, 1);
      assert.equal(newJobs[0].status, "failed", "the first durable insert must be tracked even when the second insert rejects");
      assert.equal(newJobs[0].trigger, PJUD_MANUAL_SESSION_TRIGGER);
      assert.equal(newJobs[0].attempts, 0);
      assert.equal(detailCalls, detailCallsBeforeCancel, "a broken enqueue batch cannot invoke either detail provider");
      assert.equal(await prisma.pjudSyncJob.count({ where: { causaId: { in: ownIds }, status: { in: ["pending", "running"] } } }), 0);

      const expiredCreatedAt = new Date(Date.now() - PJUD_MANUAL_SESSION_JOB_TTL_MS - 1000);
      const expiredPending = await originalJobCreate({ data: {
        causaId: ownIds[0], status: "pending", trigger: PJUD_MANUAL_SESSION_TRIGGER, createdAt: expiredCreatedAt,
      } });
      const expiredRunning = await originalJobCreate({ data: {
        causaId: ownIds[1], status: "running", trigger: PJUD_MANUAL_SESSION_TRIGGER, createdAt: expiredCreatedAt, startedAt: new Date(0),
      } });
      const expiredIds = [expiredPending.id, expiredRunning.id];
      assert.equal(await reclaimStuckRunningJobs({ jobIds: expiredIds }), 0, "stale reserved running jobs must never be reclaimed as ordinary pending work");
      assert.deepEqual(await processPendingSyncJobs({ jobIds: expiredIds }), []);
      const expired = await prisma.pjudSyncJob.findMany({ where: { id: { in: expiredIds } } });
      assert.ok(expired.every(job => job.status === "failed" && job.trigger === PJUD_MANUAL_SESSION_TRIGGER && job.attempts === 0));
      assert.equal((await requeueFailedJobs({ causaIds: ownIds })).length, 0, "expired session jobs must not acquire a generic provider on retry");
      assert.equal((await enqueueDueSyncJobs({ causaIds: ownIds, trigger: "cron" })).length, 0,
        "an incomplete manual reservation must also prevent a new cron job from silently switching provider");
      await prisma.causa.updateMany({ where: { id: { in: ownIds } }, data: { pjudNextSyncAt: new Date(0) } });
      const independentDue = await prisma.causa.create({ data: {
        titulo: `Independent scheduled fixture ${tag}`, tribunal: "Tribunal ficticio", materia: "Fixture",
        pjudMonitoreoActivo: true, pjudNextSyncAt: new Date(Date.now() - 1000),
      } });
      causaIds.push(independentDue.id);
      const independentScheduled = await enqueueDueSyncJobs({ trigger: "cron", limit: 1, reclaimStuckRunning: false });
      assert.deepEqual(independentScheduled.map(job => job.causaId), [independentDue.id],
        "held causes must be excluded before the candidate limit so other scheduled causes do not starve");
      await prisma.causa.delete({ where: { id: independentDue.id } });
      assert.equal(detailCalls, detailCallsBeforeCancel);
      assert.equal(networkCalls, 0, "reservation races, broken batches and expiry must not call an ordinary provider");
      process.env.PJUD_PUBLIC_SCRAPE = "1";
      const recoveredAfterExpiry = await syncMisCausas({ sessionSource: recoveredSource, processJobsInline: true });
      assert.equal(recoveredAfterExpiry.syncOk, 2, "a fresh explicit session can recover expired reservations");
      const scheduledAfterRecovery = await enqueueDueSyncJobs({ causaIds: ownIds, trigger: "cron" });
      assert.equal(scheduledAfterRecovery.length, 2, "a successful manual refresh permits subsequent scheduled monitoring");
      assert.ok(scheduledAfterRecovery.every(job => job.trigger === "cron"));
      await prisma.pjudSyncJob.deleteMany({ where: { id: { in: scheduledAfterRecovery.map(job => job.id) } } });
      const stateBeforeRevocation = await prisma.firmSettings.findUniqueOrThrow({ where: { organizationId: orgId } });
      await assert.rejects(syncMisCausas({ sessionSource: { ...recoveredSource, assertActive: async () => { throw new Error("Synthetic revoked session"); } }, processJobsInline: true }), /revoked/);
      assert.deepEqual(await prisma.firmSettings.findUniqueOrThrow({ where: { organizationId: orgId } }), stateBeforeRevocation, "revocation before entry must not acquire a global import claim");
    } finally {
      prisma.causaMovimiento.findFirst = firstRead;
    }
    console.log("Session pipeline PostgreSQL: claim, import, reserved jobs/worker race, partial-enqueue cleanup, expiry, serial jobs, coverage persistence/recovery, document policy, revocation and idempotence passed (synthetic source, zero network).");
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      if (priorEnv[name] === undefined) delete process.env[name];
      else process.env[name] = priorEnv[name];
    }
    const imported = await prisma.causa.findMany({ where: { caratula: { startsWith: `Fictitious session pipeline ${tag}` } }, select: { id: true } });
    const cleanupIds = [...new Set([...causaIds, ...imported.map(row => row.id)])];
    if (cleanupIds.length) {
      await prisma.activity.deleteMany({ where: { causaId: { in: cleanupIds } } });
      await prisma.causa.deleteMany({ where: { id: { in: cleanupIds } } });
    }
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
