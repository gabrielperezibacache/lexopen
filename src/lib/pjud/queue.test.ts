import assert from "node:assert/strict";
import { dueSyncWhere, pjudSyncConcurrency, processPendingSyncJobs, requeueFailedJobs, enqueueDueSyncJobs } from "@/lib/pjud/queue";
import { clearFallidosMonitoreoAvisos } from "@/lib/pjud/sync";
import {
  isBackupableDocumentoRef,
  looksLikePdf,
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
assert.equal("OR" in explicit, false);
assert.deepEqual(dueSyncWhere({ causaIds: [] }).id, { in: [] });

async function emptySelectionDoesNotTouchDatabase() {
  assert.deepEqual(await enqueueDueSyncJobs({ causaIds: [] }), []);
  assert.deepEqual(await processPendingSyncJobs({ jobIds: [] }), []);
  assert.deepEqual(await requeueFailedJobs({ causaIds: [] }), []);
  assert.deepEqual(await clearFallidosMonitoreoAvisos({ causaIds: [] }), { clearedCausas: 0, dismissedJobs: 0 });
}
emptySelectionDoesNotTouchDatabase().catch((error) => { console.error(error); process.exitCode = 1; });

assert.equal(looksLikePdf(Buffer.from("%PDF-1.4")), true);
assert.equal(looksLikePdf(Buffer.from("<html>")), false);

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

console.log("pjud/queue.test.ts OK");
