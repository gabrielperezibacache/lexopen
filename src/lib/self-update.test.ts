import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-self-update-"));
  process.env.LEXOPEN_DATA_DIR = dataDir;
  delete process.env.LEXOPEN_SELF_UPDATE;
  delete process.env.LEXOPEN_PACKAGED;
  delete process.env.LEXOPEN_WEB_HOST;

  const {
    getSelfUpdateCapability,
    readSelfUpdateStatus,
    requestSelfUpdate,
    selfUpdateRequestPath,
    releaseSelfUpdateLock,
  } = await import("./self-update");

  const capability = getSelfUpdateCapability();
  assert.equal(typeof capability.available, "boolean");

  process.env.LEXOPEN_SELF_UPDATE = "0";
  assert.equal(getSelfUpdateCapability().available, false);
  delete process.env.LEXOPEN_SELF_UPDATE;

  process.env.LEXOPEN_PACKAGED = "1";
  assert.equal(getSelfUpdateCapability().available, false);
  delete process.env.LEXOPEN_PACKAGED;

  const status = readSelfUpdateStatus();
  assert.equal(status.phase, "idle");
  assert.equal(status.currentVersion.length > 0, true);

  if (getSelfUpdateCapability().available) {
    process.env.LEXOPEN_WEB_HOST = "1";
    const queued = requestSelfUpdate({ actorId: "test-admin" });
    assert.equal(queued.phase, "queued");
    assert.equal(fs.existsSync(selfUpdateRequestPath()), true);
    releaseSelfUpdateLock();
    fs.unlinkSync(selfUpdateRequestPath());
  }

  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log("self-update.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
