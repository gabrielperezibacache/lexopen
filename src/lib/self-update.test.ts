import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-self-update-"));
  const previousDirectory = process.cwd();
  const previousEnvironment = { ...process.env };
  const fakeRoot = path.join(dataDir, "checkout");
  fs.mkdirSync(path.join(fakeRoot, ".git"), { recursive: true });
  fs.writeFileSync(path.join(fakeRoot, "package.json"), JSON.stringify({ version: "1.0.0" }));
  process.chdir(fakeRoot);
  process.env.LEXOPEN_DATA_DIR = dataDir;
  delete process.env.LEXOPEN_SELF_UPDATE;
  delete process.env.LEXOPEN_PACKAGED;
  delete process.env.LEXOPEN_WEB_HOST;
  try {
    const { getSelfUpdateCapability, readSelfUpdateStatus, requestSelfUpdate, selfUpdateRequestPath, selfUpdateLockPath, selfUpdateStatusPath, releaseSelfUpdateLock } = await import("./self-update");
    assert.equal(getSelfUpdateCapability().available, false, "unmanaged processes cannot start a detached updater");
    process.env.LEXOPEN_WEB_HOST = "1";
    assert.equal(getSelfUpdateCapability().available, true);
    process.env.LEXOPEN_SELF_UPDATE = "0";
    assert.equal(getSelfUpdateCapability().available, false);
    delete process.env.LEXOPEN_SELF_UPDATE;
    process.env.LEXOPEN_PACKAGED = "1";
    assert.equal(getSelfUpdateCapability().available, false);
    delete process.env.LEXOPEN_PACKAGED;
    assert.equal(readSelfUpdateStatus().phase, "idle");
    const queued = requestSelfUpdate({ actorId: "fixture-admin" });
    assert.equal(queued.phase, "queued");
    assert.ok(queued.requestId);
    assert.equal(fs.existsSync(selfUpdateRequestPath()), true);
    assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }), /en curso/);
    releaseSelfUpdateLock("foreign-request");
    assert.equal(fs.existsSync(selfUpdateLockPath()), true);
    fs.writeFileSync(selfUpdateStatusPath(), JSON.stringify({ phase: "idle" }));
    fs.utimesSync(selfUpdateLockPath(), new Date(0), new Date(0));
    assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }), /en curso/, "an old timestamp does not authorize deleting a live lock");
    releaseSelfUpdateLock(queued.requestId!);
    assert.equal(fs.existsSync(selfUpdateLockPath()), false);
    fs.unlinkSync(selfUpdateRequestPath());
    fs.writeFileSync(selfUpdateStatusPath(), JSON.stringify({ phase: "failed", recoveryRequired: true, ok: true }));
    assert.equal(readSelfUpdateStatus().ok, false);
    assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }), /recuperación/);
    console.log("self-update capability/owned request/live-lock/recovery checks passed (temporary fixtures only)");
  } finally {
    process.chdir(previousDirectory);
    for (const key of Object.keys(process.env)) if (!(key in previousEnvironment)) delete process.env[key];
    Object.assign(process.env, previousEnvironment);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
