import assert from "node:assert/strict";
import {
  isMisCausasSyncInFlight,
  MIS_CAUSAS_SYNC_STUCK_MS,
} from "@/lib/pjud/mis-causas-sync-state";

const now = new Date("2026-08-13T20:00:00.000Z");

assert.equal(
  isMisCausasSyncInFlight({
    status: "ok",
    lastSyncAt: now,
    now,
  }),
  false
);

assert.equal(
  isMisCausasSyncInFlight({
    status: "running",
    lastSyncAt: new Date(now.getTime() - 60_000),
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
  false,
  "stuck running must be reclaimable"
);

assert.equal(
  isMisCausasSyncInFlight({
    status: "running",
    lastSyncAt: null,
    now,
  }),
  true
);

assert.equal(
  isMisCausasSyncInFlight({
    status: "failed",
    lastSyncAt: now,
    now,
  }),
  false
);

console.log("pjud/mis-causas-sync-state.test.ts OK");
