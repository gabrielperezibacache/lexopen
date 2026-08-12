import assert from "node:assert/strict";
import { dueSyncWhere } from "@/lib/pjud/queue";

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

console.log("pjud/queue.test.ts OK");
