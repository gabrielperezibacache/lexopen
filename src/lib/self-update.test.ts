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
    const writeFileSync = fs.writeFileSync;
    let failedDescriptor: number | undefined;
    fs.writeFileSync = (file, ...args) => {
      if (typeof file === "number") {
        failedDescriptor = file;
        throw new Error("fixture: failed initial lock write");
      }
      return writeFileSync(file, ...args);
    };
    try {
      assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }), /failed initial lock write/);
    } finally { fs.writeFileSync = writeFileSync; }
    assert.equal(fs.existsSync(selfUpdateLockPath()), false, "a failed lock write must not block future requests");
    assert.equal(fs.existsSync(selfUpdateRequestPath()), false);
    assert.notEqual(failedDescriptor, undefined);
    assert.throws(() => fs.fstatSync(failedDescriptor!), (error: unknown) => (error as NodeJS.ErrnoException).code === "EBADF", "the failed lock descriptor is closed");
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

    // A status-write failure must never publish a request for the coordinator.
    fs.unlinkSync(selfUpdateStatusPath());
    fs.mkdirSync(selfUpdateStatusPath());
    assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }));
    assert.equal(fs.existsSync(selfUpdateRequestPath()), false);
    assert.equal(fs.existsSync(selfUpdateLockPath()), false);
    fs.rmdirSync(selfUpdateStatusPath());

    // If committing the request fails, preserve the exact previous receipt and
    // remove the owned lock rather than leaving an impossible queued job.
    const previousReceipt = '{ "requestId": "previous-request", "phase": "done", "ok": true }\n';
    fs.writeFileSync(selfUpdateStatusPath(), previousReceipt);
    fs.mkdirSync(selfUpdateRequestPath());
    assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }));
    assert.equal(fs.readFileSync(selfUpdateStatusPath(), "utf8"), previousReceipt);
    assert.equal(fs.existsSync(selfUpdateLockPath()), false);
    fs.rmdirSync(selfUpdateRequestPath());

    // The same failure during a first request restores the idle state.
    fs.unlinkSync(selfUpdateStatusPath());
    fs.mkdirSync(selfUpdateRequestPath());
    assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }));
    assert.equal(fs.existsSync(selfUpdateStatusPath()), false);
    assert.equal(readSelfUpdateStatus().phase, "idle");
    assert.equal(fs.existsSync(selfUpdateLockPath()), false);
    fs.rmdirSync(selfUpdateRequestPath());
    assert.equal(fs.readdirSync(dataDir).some(file => file.endsWith(".tmp")), false);

    // A rollback may itself fail (e.g. storage errors), including the fallback
    // failed receipt. The abandoned queue still must allow another attempt.
    fs.writeFileSync(selfUpdateStatusPath(), previousReceipt);
    fs.mkdirSync(selfUpdateRequestPath());
    const renameSync = fs.renameSync;
    let queuedPersisted = false;
    fs.renameSync = (source, destination) => {
      if (destination === selfUpdateStatusPath()) {
        if (queuedPersisted) throw new Error("fixture: storage unavailable during rollback");
        queuedPersisted = true;
      }
      return renameSync(source, destination);
    };
    try {
      assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }));
    } finally {
      fs.renameSync = renameSync;
    }
    assert.equal(JSON.parse(fs.readFileSync(selfUpdateStatusPath(), "utf8")).phase, "queued");
    assert.equal(fs.existsSync(selfUpdateLockPath()), false);
    fs.rmdirSync(selfUpdateRequestPath());
    assert.equal(readSelfUpdateStatus().phase, "failed");

    // A pending request must keep polling even without a lock; never hide it
    // as an abandoned queue while the coordinator may still consume it.
    fs.writeFileSync(selfUpdateRequestPath(), JSON.stringify({ requestId: "pending-request" }));
    assert.equal(readSelfUpdateStatus().phase, "queued");
    fs.unlinkSync(selfUpdateRequestPath());

    const retried = requestSelfUpdate({ actorId: "fixture-admin" });
    assert.equal(retried.phase, "queued");
    assert.ok(retried.requestId);
    releaseSelfUpdateLock(retried.requestId!);
    fs.unlinkSync(selfUpdateRequestPath());

    // A crash after persisting queued but before committing request leaves the
    // publisher's lock behind. Only a proven dead, matching owner is retryable.
    const deadPid = 2_147_483_647;
    const crashedId = "crashed-before-request-commit";
    const kill = process.kill;
    let probeResult: "dead" | "unknown" = "dead";
    let onDeadProbe: (() => void) | undefined;
    process.kill = ((pid: number, signal?: number | NodeJS.Signals) => {
      if (pid === deadPid) {
        onDeadProbe?.();
        const error = new Error("fixture process probe") as NodeJS.ErrnoException;
        error.code = probeResult === "dead" ? "ESRCH" : "EPERM";
        throw error;
      }
      return kill(pid, signal);
    }) as typeof process.kill;
    try {
      fs.writeFileSync(selfUpdateStatusPath(), JSON.stringify({ phase: "queued", requestId: crashedId }));
      fs.writeFileSync(selfUpdateLockPath(), JSON.stringify({ pid: process.pid, requestId: crashedId }));
      assert.equal(readSelfUpdateStatus().phase, "queued", "a live publisher may still commit its request");
      assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }), /en curso/);
      fs.writeFileSync(selfUpdateLockPath(), JSON.stringify({ pid: deadPid, requestId: crashedId }));
      probeResult = "unknown";
      assert.equal(readSelfUpdateStatus().phase, "queued", "EPERM does not prove the publisher is dead");
      assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }), /en curso/);
      probeResult = "dead";
      fs.writeFileSync(selfUpdateRequestPath(), JSON.stringify({ requestId: crashedId }));
      assert.equal(readSelfUpdateStatus().phase, "queued", "a committed request must survive its publisher");
      assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }), /en curso/);
      fs.unlinkSync(selfUpdateRequestPath());
      fs.writeFileSync(selfUpdateLockPath(), JSON.stringify({ pid: deadPid, requestId: "different-owner" }));
      assert.equal(readSelfUpdateStatus().phase, "queued", "a foreign lock cannot authorize recovering this receipt");
      fs.writeFileSync(selfUpdateLockPath(), JSON.stringify({ pid: deadPid, requestId: crashedId }));
      assert.equal(readSelfUpdateStatus().phase, "failed");
      let probes = 0;
      onDeadProbe = () => {
        if (++probes === 2) fs.writeFileSync(selfUpdateLockPath(), JSON.stringify({ pid: process.pid, requestId: "replacement-owner" }));
      };
      assert.throws(() => requestSelfUpdate({ actorId: "fixture-admin" }), /en curso/);
      assert.equal(JSON.parse(fs.readFileSync(selfUpdateLockPath(), "utf8")).requestId, "replacement-owner", "reclaim must recheck the owner before removing a lock");
      onDeadProbe = undefined;
      fs.writeFileSync(selfUpdateLockPath(), JSON.stringify({ pid: deadPid, requestId: crashedId }));
      const recovered = requestSelfUpdate({ actorId: "fixture-admin" });
      assert.equal(recovered.phase, "queued");
      assert.notEqual(recovered.requestId, crashedId);
      assert.equal(JSON.parse(fs.readFileSync(selfUpdateLockPath(), "utf8")).pid, process.pid);
      assert.equal(JSON.parse(fs.readFileSync(selfUpdateLockPath(), "utf8")).requestId, recovered.requestId);
      releaseSelfUpdateLock(recovered.requestId!);
      fs.unlinkSync(selfUpdateRequestPath());
    } finally { process.kill = kill; }
    console.log("self-update capability/owned request/live-lock/recovery/atomic publication checks passed (temporary fixtures only)");
  } finally {
    process.chdir(previousDirectory);
    for (const key of Object.keys(process.env)) if (!(key in previousEnvironment)) delete process.env[key];
    Object.assign(process.env, previousEnvironment);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
