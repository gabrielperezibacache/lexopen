import assert from "node:assert/strict";
import {
  evaluateHostEnv,
  isStrongSessionSecret,
  parseArgs,
} from "./prod-host-check.mjs";

assert.equal(isStrongSessionSecret("change-me-in-production"), false);
assert.equal(isStrongSessionSecret("short"), false);
assert.equal(
  isStrongSessionSecret("production-grade-session-secret-32"),
  true
);

const bad = evaluateHostEnv({
  SESSION_SECRET: "change-me-in-production",
  LEXOPEN_DEMO_SWITCHER: "1",
  HERMES_ALLOW_DEMO: "1",
  PJUD_SYNC_INTERVAL_MINUTES: "240",
});
assert.equal(bad.ok, false);
assert.ok(bad.errors.some((e) => /SESSION_SECRET/.test(e)));
assert.ok(bad.errors.some((e) => /LEXOPEN_DEMO_SWITCHER/.test(e)));
assert.ok(bad.errors.some((e) => /CRON_SECRET/.test(e)));
assert.ok(bad.warnings.some((w) => /HERMES_ALLOW_DEMO/.test(w)));

const good = evaluateHostEnv({
  SESSION_SECRET: "production-grade-session-secret-32",
  LEXOPEN_DEMO_SWITCHER: "0",
  HERMES_ALLOW_DEMO: "0",
  LLM_ALLOW_DEMO: "0",
  PJUD_ALLOW_DEMO: "0",
  CRON_SECRET: "cron-secret-value-16+",
  PJUD_SYNC_INTERVAL_MINUTES: "240",
  LEXOPEN_DESKTOP: "1",
  LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE: "1",
});
assert.equal(good.ok, true);
assert.equal(good.errors.length, 0);

const nestedBackup = evaluateHostEnv({
  SESSION_SECRET: "production-grade-session-secret-32",
  LEXOPEN_DATA_DIR: "/var/lib/lexopen",
  LEXOPEN_BACKUP_INTERVAL_MINUTES: "60",
  LEXOPEN_BACKUP_DIR: "/var/lib/lexopen/backups",
});
assert.equal(nestedBackup.ok, false);
assert.ok(nestedBackup.errors.some((e) => /BACKUP_DIR/.test(e)));

const args = parseArgs([
  "--env",
  "/tmp/x.env",
  "--health",
  "http://127.0.0.1:3000",
]);
assert.equal(args.envFile, "/tmp/x.env");
assert.equal(args.healthUrl, "http://127.0.0.1:3000");

console.log("scripts/prod-host-check.test.mjs OK");
