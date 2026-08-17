import assert from "node:assert/strict";
import {
  evaluateHostEnv,
  isStrongSessionSecret,
  parseArgs,
  resolveCheckEnv,
  SCHEDULER_INTERVAL_KEYS,
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

const ufNoCron = evaluateHostEnv({
  SESSION_SECRET: "production-grade-session-secret-32",
  UF_SYNC_INTERVAL_MINUTES: "60",
});
assert.equal(ufNoCron.ok, false);
assert.ok(ufNoCron.errors.some((e) => /CRON_SECRET/.test(e)));

assert.ok(SCHEDULER_INTERVAL_KEYS.includes("UF_SYNC_INTERVAL_MINUTES"));
assert.ok(SCHEDULER_INTERVAL_KEYS.includes("MAIL_SYNC_INTERVAL_MINUTES"));

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
  "--effective",
]);
assert.equal(args.envFile, "/tmp/x.env");
assert.equal(args.healthUrl, "http://127.0.0.1:3000");
assert.equal(args.effective, true);

const fileOnly = resolveCheckEnv({
  fromFile: {
    SESSION_SECRET: "production-grade-session-secret-32",
    HERMES_ALLOW_DEMO: "0",
  },
  processEnv: { HERMES_ALLOW_DEMO: "1", LEXOPEN_RELAX_CSRF: "1" },
  dataDir: "/tmp/lexopen",
  effective: false,
});
assert.equal(fileOnly.HERMES_ALLOW_DEMO, "0");
assert.equal(fileOnly.LEXOPEN_RELAX_CSRF, undefined);

const effective = resolveCheckEnv({
  fromFile: { HERMES_ALLOW_DEMO: "1" },
  processEnv: { HERMES_ALLOW_DEMO: "0" },
  dataDir: "/tmp/lexopen",
  effective: true,
});
assert.equal(effective.HERMES_ALLOW_DEMO, "0");

console.log("scripts/prod-host-check.test.mjs OK");
