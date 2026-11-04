import assert from "node:assert/strict";
import { getPjudSchedulerConfiguration } from "./scheduler-status";

assert.equal(getPjudSchedulerConfiguration({}).configured, false);
assert.equal(getPjudSchedulerConfiguration({ PJUD_SYNC_INTERVAL_MINUTES: "-1" }).intervalMinutes, 0);
assert.equal(getPjudSchedulerConfiguration({ PJUD_SYNC_INTERVAL_MINUTES: "20", CRON_SECRET: "PRIVATE_SECRET" }).configured, false);
const configured = getPjudSchedulerConfiguration({ PJUD_SYNC_INTERVAL_MINUTES: "20", CRON_SECRET: "PRIVATE_SECRET", LEXOPEN_WEB_HOST: "1" });
assert.equal(configured.configured, true);
assert.equal(configured.runtime, "unverified");
assert.equal(configured.intervalMinutes, 20);
assert.doesNotMatch(JSON.stringify(configured), /PRIVATE_SECRET|"running"/);
assert.equal(getPjudSchedulerConfiguration({ PJUD_SYNC_INTERVAL_MINUTES: "20", CRON_SECRET: "PRIVATE_SECRET", LEXOPEN_DESKTOP: "1", LEXOPEN_DESKTOP_MODE: "client" }).configured, false);
console.log("PJUD scheduler configuration never claims an unobserved running timer.");
