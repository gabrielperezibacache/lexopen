import assert from "node:assert/strict";
import { startLocalHostSchedulers } from "./local-host-schedulers.mjs";

// With intervals at 0, no timers should start.
const idle = await startLocalHostSchedulers({
  baseUrl: "http://127.0.0.1:9",
  env: {
    CRON_SECRET: "test-secret",
    PJUD_SYNC_INTERVAL_MINUTES: "0",
    PJUD_MIS_CAUSAS_INTERVAL_MINUTES: "0",
    PJUD_DIGEST_INTERVAL_MINUTES: "0",
    PLAZOS_ALERTAS_INTERVAL_MINUTES: "0",
  },
  logPrefix: "schedulers-test",
  alreadyHealthy: true,
});
assert.equal(idle.timers.filter(Boolean).length, 0);
idle.stop();

console.log("scripts/local-host-schedulers.test.mjs OK");
