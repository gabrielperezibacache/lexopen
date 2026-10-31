import assert from "node:assert/strict";
import {
  isMisCausasSyncInFlight,
  misCausasClaimableWhere,
  MIS_CAUSAS_SYNC_STUCK_MS,
} from "@/lib/pjud/mis-causas-sync-state";

const now = new Date("2026-10-31T00:00:00.000Z");
const where = misCausasClaimableWhere({ settingsId: "firm1", now });

assert.equal(where.id, "firm1");
assert.ok(Array.isArray(where.OR));
assert.equal(where.OR.length, 3);

// Branch: not running
assert.deepEqual(where.OR[0], { claveUnicaLastSyncStatus: { not: "running" } });
assert.deepEqual(where.OR[1], { claveUnicaLastSyncStatus: null });

// Branch: stuck running
const stuckCutoff = new Date(now.getTime() - MIS_CAUSAS_SYNC_STUCK_MS);
const stuckBranch = where.OR[2] as {
  AND: Array<Record<string, unknown>>;
};
assert.deepEqual(stuckBranch.AND[0], {
  claveUnicaLastSyncStatus: "running",
});
const atOr = stuckBranch.AND[1] as { OR: unknown[] };
assert.deepEqual(atOr.OR[0], { claveUnicaLastSyncAt: { lt: stuckCutoff } });
assert.deepEqual(atOr.OR[1], { claveUnicaLastSyncAt: null });

// In-flight helper still coherent with reclaim window
assert.equal(
  isMisCausasSyncInFlight({
    status: "running",
    lastSyncAt: new Date(now.getTime() - 1000),
    now,
  }),
  true
);
assert.equal(
  isMisCausasSyncInFlight({
    status: "running",
    lastSyncAt: new Date(now.getTime() - MIS_CAUSAS_SYNC_STUCK_MS - 1),
    now,
  }),
  false
);

console.log("pjud/mis-causas-claim.test.ts OK");
