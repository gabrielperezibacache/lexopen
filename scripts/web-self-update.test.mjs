import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hostCommandEnv,
  isUnreachableDatabaseError,
  migrateDuringSelfUpdate,
} from "./web-self-update.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-self-update-env-"));
const envFile = path.join(tmp, ".env");
fs.writeFileSync(
  envFile,
  "DATABASE_URL=postgresql://lexopen:host@127.0.0.1:54329/lexopen\nSESSION_SECRET=host-secret\n",
  "utf8"
);

const merged = hostCommandEnv(tmp, {
  DATABASE_URL: "postgresql://lexopen:lexopen@localhost:5432/lexopen",
  PATH: "/usr/bin",
});
assert.equal(
  merged.DATABASE_URL,
  "postgresql://lexopen:host@127.0.0.1:54329/lexopen"
);
assert.equal(merged.PATH, "/usr/bin");

const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-self-update-empty-"));
const withoutFile = hostCommandEnv(emptyDir, {
  DATABASE_URL: "postgresql://lexopen:lexopen@localhost:5432/lexopen",
});
assert.equal(
  withoutFile.DATABASE_URL,
  "postgresql://lexopen:lexopen@localhost:5432/lexopen"
);

assert.equal(
  isUnreachableDatabaseError(
    "db:migrate falló (código 1): Error: P1001: Can't reach database server at `localhost:5432`"
  ),
  true
);
assert.equal(isUnreachableDatabaseError("P3005 migration failed"), false);

let migrateCalls = 0;
const skipped = migrateDuringSelfUpdate({
  dataDir: tmp,
  env: hostCommandEnv(tmp),
  runCommand: () => {
    migrateCalls += 1;
    throw new Error(
      "db:migrate falló (código 1): Error: P1001: Can't reach database server at `127.0.0.1:54329`"
    );
  },
});
assert.equal(migrateCalls, 1);
assert.equal(skipped.skipped, true);
assert.equal(skipped.reason, "unreachable");

const applied = migrateDuringSelfUpdate({
  dataDir: tmp,
  env: hostCommandEnv(tmp),
  runCommand: () => ({ status: 0 }),
});
assert.equal(applied.skipped, false);

assert.throws(
  () =>
    migrateDuringSelfUpdate({
      dataDir: tmp,
      env: hostCommandEnv(tmp),
      runCommand: () => {
        throw new Error("db:migrate falló (código 1): Error: P3005 already applied");
      },
    }),
  /P3005/
);

assert.throws(
  () =>
    migrateDuringSelfUpdate({
      dataDir: emptyDir,
      env: {},
    }),
  /data dir/
);

fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(emptyDir, { recursive: true, force: true });
console.log("web-self-update.test.mjs OK");
