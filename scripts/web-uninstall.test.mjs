import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertHostStopped,
  resolveUninstallDataDir,
  uninstallDataDirectory,
} from "./web-uninstall.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-uninstall-"));
const dataDir = path.join(tmp, "LexOpen");
fs.mkdirSync(path.join(dataDir, "pgdata"), { recursive: true });
fs.writeFileSync(path.join(dataDir, ".env"), "SESSION_SECRET=test\n");

assert.equal(
  resolveUninstallDataDir({
    env: { LEXOPEN_DATA_DIR: dataDir },
  }),
  path.resolve(dataDir)
);

assert.doesNotThrow(() => assertHostStopped(dataDir));
fs.writeFileSync(path.join(dataDir, "pgdata", "postmaster.pid"), "1\n");
assert.throws(() => assertHostStopped(dataDir), /Host parece estar activo/);
fs.unlinkSync(path.join(dataDir, "pgdata", "postmaster.pid"));

const dry = uninstallDataDirectory(dataDir, { dryRun: true });
assert.equal(dry.removed, true);
assert.ok(fs.existsSync(dataDir));

const gone = uninstallDataDirectory(dataDir);
assert.equal(gone.removed, true);
assert.equal(fs.existsSync(dataDir), false);

const missing = uninstallDataDirectory(dataDir);
assert.equal(missing.removed, false);
assert.equal(missing.reason, "missing");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("web-uninstall.test.mjs OK");
