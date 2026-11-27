import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { dueSyncWhere, pjudSyncConcurrency, processPendingSyncJobs, processPjudSyncJobIdBatches, requeueFailedJobs, enqueueDueSyncJobs, reclaimStuckRunningJobs } from "@/lib/pjud/queue";
import { claimOrCreatePjudSyncJob, clearFallidosMonitoreoAvisos, syncCausaPjud } from "@/lib/pjud/sync";
import {
  isBackupableDocumentoRef,
  looksLikePdf,
  validPjudDownloadedContent,
} from "@/lib/pjud/pdf-backup";

const now = new Date("2026-08-12T15:00:00.000Z");
const due = dueSyncWhere({ now });
assert.equal(due.pjudMonitoreoActivo, true);
assert.equal(due.estado, "activa");
assert.ok(Array.isArray(due.OR));
assert.deepEqual(due.OR?.[0], { pjudNextSyncAt: null });
assert.deepEqual(due.OR?.[1], { pjudNextSyncAt: { lte: now } });

const explicit = dueSyncWhere({ causaIds: ["a", "b"], now });
assert.deepEqual(explicit.id, { in: ["a", "b"] });
assert.equal(explicit.pjudMonitoreoActivo, true);
assert.equal("estado" in explicit, false); // selección explícita incluye terminadas
assert.equal("OR" in explicit, false);
assert.deepEqual(dueSyncWhere({ causaIds: [] }).id, { in: [] });

async function emptySelectionDoesNotTouchDatabase() {
  assert.deepEqual(await enqueueDueSyncJobs({ causaIds: [] }), []);
  assert.deepEqual(await processPendingSyncJobs({ jobIds: [] }), []);
  assert.deepEqual(await requeueFailedJobs({ causaIds: [] }), []);
  assert.deepEqual(await clearFallidosMonitoreoAvisos({ causaIds: [] }), { clearedCausas: 0, dismissedJobs: 0 });
  assert.equal(await reclaimStuckRunningJobs({ jobIds: [] }), 0);
  assert.equal(await reclaimStuckRunningJobs({ causaIds: [] }), 0);
  await assert.rejects(processPendingSyncJobs({ fetchMovimientos: async () => { throw new Error("must not run"); } }), /trabajos explícitos/);
  await assert.rejects(processPendingSyncJobs({ jobIds: ["fixture"], fetchMovimientos: JSON.parse('"not-a-function"') }), /función interna/);
  await assert.rejects(syncCausaPjud("fixture", { fetchMovimientos: JSON.parse('"not-a-function"') }), /función interna/);
}
async function selectedJobIdsAreDrainedInBoundedBatches() {
  const selectedIds = Array.from({ length: 87 }, (_, index) => `selected-${index + 1}`);
  const touchedIds: string[] = [];
  const batchSizes: number[] = [];
  const result = await processPjudSyncJobIdBatches(selectedIds, async (batchIds) => {
    batchSizes.push(batchIds.length);
    touchedIds.push(...batchIds);
    return batchIds;
  });
  assert.deepEqual(batchSizes, [40, 40, 7]);
  assert.deepEqual(result.flat(), selectedIds);
  assert.deepEqual(touchedIds, selectedIds, "the drain callback receives only the exact selected IDs");
  assert.equal(touchedIds.includes("unrelated-pending-job"), false);
  assert.equal((await processPjudSyncJobIdBatches([], async () => { throw new Error("empty selection must not drain"); })).length, 0);
}
async function ordinarySyncClaimsPendingJob() {
  let updateArgs: unknown;
  let createCalls = 0;
  const fixtureJob = { id: "pending-job", attempts: 3 };
  const client = {
    pjudSyncJob: {
      updateMany: async (args: unknown) => { updateArgs = args; return { count: 1 }; },
      findFirst: async () => fixtureJob,
      create: async () => { createCalls++; throw new Error("create must not run after claim"); },
    },
  } as unknown as Pick<Prisma.TransactionClient, "pjudSyncJob">;
  const job = await claimOrCreatePjudSyncJob(client, { causaId: "fixture-causa", trigger: "manual" });
  assert.equal(job?.id, fixtureJob.id);
  assert.equal(job?.attempts, fixtureJob.attempts);
  assert.equal(createCalls, 0);
  const claim = updateArgs as { where: { causaId: string; status: string; trigger: { not: string } }; data: { status: string; attempts: { increment: number }; trigger: string; lastError: null; note: null } };
  assert.deepEqual(claim.where, { causaId: "fixture-causa", status: "pending", trigger: { not: "manual-session" } });
  assert.equal(claim.data.status, "running");
  assert.equal(claim.data.attempts.increment, 1);
  assert.equal(claim.data.trigger, "manual");
  assert.equal(claim.data.lastError, null);
  assert.equal(claim.data.note, null);
}

async function activeJobP2002BecomesHttp409() {
  const uniqueError = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
    code: "P2002", clientVersion: "test", meta: { target: ["causaId"] },
  });
  for (const trigger of ["manual", "manual-session"] as const) {
    let claimCalls = 0;
    const client = {
      pjudSyncJob: {
        updateMany: async () => { claimCalls++; return { count: 0 }; },
        findFirst: async () => null,
        create: async () => { throw uniqueError; },
      },
    } as unknown as Pick<Prisma.TransactionClient, "pjudSyncJob">;
    await assert.rejects(
      claimOrCreatePjudSyncJob(client, { causaId: "fixture-causa", trigger }),
      (error: unknown) => error instanceof Error && "status" in error && error.status === 409 &&
        /Ya hay una actualización en curso o reservada para esta causa/.test(error.message) && !error.message.includes("P2002"),
      `${trigger} active-job collisions return a safe 409`
    );
    assert.equal(claimCalls, trigger === "manual-session" ? 0 : 1);
  }
}

assert.equal(looksLikePdf(Buffer.from("%PDF-1.4")), true);
assert.equal(looksLikePdf(Buffer.from("<html>")), false);

const fixturePdf = Buffer.from("%PDF-1.4\n" + "x".repeat(140));
const fixtureError = Buffer.from("La sesión caducó. " + "x".repeat(140));
assert.equal(validPjudDownloadedContent(fixturePdf, "application/pdf", "https://civil.pjud.cl/doc.pdf", 1000), true);
assert.equal(validPjudDownloadedContent(fixtureError, "application/pdf", "https://civil.pjud.cl/doc.pdf", 1000), false);
assert.equal(validPjudDownloadedContent(fixtureError, "application/octet-stream", "https://civil.pjud.cl/doc.pdf", 1000), false);
assert.equal(validPjudDownloadedContent(fixtureError, "application/msword", "https://civil.pjud.cl/doc.doc", 1000), false);
assert.equal(validPjudDownloadedContent(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, ...Buffer.alloc(140)]), "application/msword", "https://civil.pjud.cl/doc.doc", 1000), true);
assert.equal(validPjudDownloadedContent(Buffer.from("<html>" + "x".repeat(140)), "application/octet-stream", "https://civil.pjud.cl/doc", 1000), false);
assert.equal(validPjudDownloadedContent(fixturePdf, "application/pdf", "https://civil.pjud.cl/doc.pdf", 100), false);


assert.equal(
  isBackupableDocumentoRef(
    "https://oficinajudicialvirtual.pjud.cl/files/a.pdf"
  ),
  true
);
assert.equal(isBackupableDocumentoRef("doc:abc"), false);
assert.equal(isBackupableDocumentoRef("http://127.0.0.1/secret.pdf"), false);
assert.equal(isBackupableDocumentoRef("http://169.254.169.254/latest"), false);
assert.equal(
  isBackupableDocumentoRef("https://[::ffff:169.254.169.254]/x.pdf"),
  false
);
assert.equal(
  isBackupableDocumentoRef("https://evil.example.com/files/a.pdf"),
  false
);
assert.equal(
  isBackupableDocumentoRef("https://www.pjud.cl/files/a.pdf"),
  true
);

const prevConc = process.env.PJUD_SYNC_CONCURRENCY;
delete process.env.PJUD_SYNC_CONCURRENCY;
assert.equal(pjudSyncConcurrency(), 5);
process.env.PJUD_SYNC_CONCURRENCY = "3";
assert.equal(pjudSyncConcurrency(), 3);
process.env.PJUD_SYNC_CONCURRENCY = "99";
assert.equal(pjudSyncConcurrency(), 10);
if (prevConc === undefined) delete process.env.PJUD_SYNC_CONCURRENCY;
else process.env.PJUD_SYNC_CONCURRENCY = prevConc;

async function runQueueTests() {
  await emptySelectionDoesNotTouchDatabase();
  await selectedJobIdsAreDrainedInBoundedBatches();
  await ordinarySyncClaimsPendingJob();
  await activeJobP2002BecomesHttp409();
  console.log("pjud/queue.test.ts OK");
}

runQueueTests().catch((error) => { console.error(error); process.exitCode = 1; });
