/** Real disposable PostgreSQL pipeline, synthetic session callbacks, no OJV/network. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { syncMisCausas, type MisCausasSessionSource } from "@/lib/pjud/claveunica";
import { processPendingSyncJobs } from "@/lib/pjud/queue";
import { scrapeMovimientoIdentity, type MisCausasItem } from "@/lib/pjud/types";

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  // Run before other integration suites or against a separate fresh test DB.
  assert.equal(await prisma.organization.count(), 0, "session pipeline fixture requires a fresh test organization scope");
  const envNames = ["PJUD_PUBLIC_SCRAPE", "PJUD_CLAVEUNICA_SCRAPE", "PJUD_PDF_BACKUP", "PJUD_ALLOW_DEMO"] as const;
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
    const org = await prisma.organization.create({ data: { name: `Synthetic session ${tag}`, settings: { create: {} } } });
    orgId = org.id;
    const unrelated = await prisma.causa.create({ data: { titulo: `Unrelated fixture ${tag}`, tribunal: "Tribunal ficticio", materia: "Fixture" } });
    causaIds.push(unrelated.id);
    const unrelatedJob = await prisma.pjudSyncJob.create({ data: { causaId: unrelated.id, status: "running", startedAt: new Date(0) } });

    const first = await syncMisCausas({ sessionSource: source, processJobsInline: true });
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
    assert.ok(firstJobs.every(job => job.status === "ok" && job.attempts === 1 && job.inserted === 1));
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
    console.log("Session pipeline PostgreSQL: claim, import, selected serial jobs, persistence, idempotence, vault-free source, busy coverage and job ownership isolation passed (synthetic source, zero network).");
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
