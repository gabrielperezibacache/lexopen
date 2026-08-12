import assert from "node:assert/strict";
import {
  fingerprint,
  pjudDemoAllowed,
  pjudSyncIntervalMs,
} from "@/lib/pjud/provider";

assert.equal(
  fingerprint("Resolución", new Date(2026, 7, 11, 12), "R-1"),
  fingerprint(" resolución ", new Date(2026, 7, 11, 12), "R-1")
);
assert.notEqual(
  fingerprint("Resolución", new Date(2026, 7, 11, 12), "R-1"),
  fingerprint("Resolución", new Date(2026, 7, 12, 12), "R-1")
);

const env = process.env as Record<string, string | undefined>;
const previousNodeEnv = env.NODE_ENV;
const previousDemo = env.PJUD_ALLOW_DEMO;
const previousInterval = env.PJUD_SYNC_INTERVAL_MINUTES;
env.NODE_ENV = "production";
env.PJUD_ALLOW_DEMO = "0";
assert.equal(pjudDemoAllowed(), false);
env.PJUD_ALLOW_DEMO = "1";
assert.equal(pjudDemoAllowed(), true);
env.PJUD_SYNC_INTERVAL_MINUTES = "60";
assert.equal(pjudSyncIntervalMs(), 60 * 60 * 1000);
env.PJUD_SYNC_INTERVAL_MINUTES = "0";
assert.equal(pjudSyncIntervalMs(), 1440 * 60 * 1000);
if (previousNodeEnv === undefined) delete env.NODE_ENV;
else env.NODE_ENV = previousNodeEnv;
if (previousDemo === undefined) delete env.PJUD_ALLOW_DEMO;
else env.PJUD_ALLOW_DEMO = previousDemo;
if (previousInterval === undefined) delete env.PJUD_SYNC_INTERVAL_MINUTES;
else env.PJUD_SYNC_INTERVAL_MINUTES = previousInterval;

console.log("pjud/provider.test.ts OK");
