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
    NOTIFY_WORKER_INTERVAL_MINUTES: "0",
    ESCALATION_INTERVAL_MINUTES: "0",
    DIGEST_INTERVAL_MINUTES: "0",
  },
  logPrefix: "schedulers-test",
  alreadyHealthy: true,
});
assert.equal(idle.timers.filter(Boolean).length, 0);
idle.stop();

// The persistent companion heartbeat is deferred and never overlaps itself.
const oldInterval = globalThis.setInterval, oldClear = globalThis.clearInterval, oldFetch = globalThis.fetch;
const ticks = [], requests = [];
let finishFetch;
try {
  globalThis.setInterval = (callback) => { ticks.push(callback); return 123; };
  globalThis.clearInterval = () => {};
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Promise(resolve => { finishFetch = () => resolve(Response.json({ ok: true })); });
  };
  const worker = await startLocalHostSchedulers({
    baseUrl: "http://127.0.0.1:9", alreadyHealthy: true,
    env: {
      CRON_SECRET: "fixture-secret", LEXOPEN_JORNADA_INTERVAL_MINUTES: "1",
      PJUD_SYNC_INTERVAL_MINUTES: "0", PJUD_MIS_CAUSAS_INTERVAL_MINUTES: "0",
      PJUD_DIGEST_INTERVAL_MINUTES: "0", PLAZOS_ALERTAS_INTERVAL_MINUTES: "0",
      UF_SYNC_INTERVAL_MINUTES: "0", MAIL_SYNC_INTERVAL_MINUTES: "0",
      NOTIFY_WORKER_INTERVAL_MINUTES: "0", ESCALATION_INTERVAL_MINUTES: "0",
      DIGEST_INTERVAL_MINUTES: "0",
    },
    logPrefix: "companion-scheduler-test",
  });
  assert.equal(requests.length, 0, "starting the Host does not wait for a queued model reply");
  assert.equal(ticks.length, 1);
  ticks[0](); ticks[0]();
  assert.equal(requests.length, 1, "a second tick cannot overlap a running cycle");
  assert.equal(requests[0].url, "http://127.0.0.1:9/api/jornada/worker");
  assert.equal(requests[0].options.headers["x-cron-secret"], "fixture-secret");
  assert.equal(requests[0].options.redirect, "error");
  finishFetch();
  await new Promise(resolve => setTimeout(resolve, 0));
  ticks[0]();
  assert.equal(requests.length, 2, "the next cycle can run after completion");
  finishFetch(); worker.stop();
} finally {
  globalThis.setInterval = oldInterval; globalThis.clearInterval = oldClear; globalThis.fetch = oldFetch;
}

console.log("scripts/local-host-schedulers.test.mjs OK");
