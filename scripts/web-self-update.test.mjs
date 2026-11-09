import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hostCommandEnv, isUnreachableDatabaseError, migrateDuringSelfUpdate, applySelfUpdate, finalizeSelfUpdate, claimUpdateLock, releaseUpdateLock, lockPath, statusPath, canRestartPreparedUpdate, updaterUsesShell, stopHostForSelfUpdate, assertSelfUpdateStartupSafe } from "./web-self-update.mjs";
import { createLocalBackupScheduler } from "./web-backup-scheduler.mjs";

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-self-update-fixtures-")));
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TMPDIR: tmp, HOME: tmp, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" } });
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
function fixture(name, failBuild = false) {
  const base = path.join(tmp, name), origin = path.join(base, "origin"), checkout = path.join(base, "checkout"), dataDir = path.join(base, "data");
  fs.mkdirSync(origin, { recursive: true });
  git(origin, ["init", "--initial-branch=main"]);
  git(origin, ["config", "user.email", "fixture@example.invalid"]); git(origin, ["config", "user.name", "Fixture"]);
  write(path.join(origin, "package.json"), JSON.stringify({ version: "1.0.0" }));
  write(path.join(origin, "desktop", "package.json"), JSON.stringify({ version: "1.0.0" }));
  write(path.join(origin, ".gitignore"), ".next/\nnode_modules/\ndesktop/node_modules/\n");
  git(origin, ["add", "."]); git(origin, ["commit", "-m", "fixture baseline"]);
  git(base, ["clone", origin, checkout]);
  write(path.join(origin, "package.json"), JSON.stringify({ version: "1.0.1" }));
  git(origin, ["add", "."]); git(origin, ["commit", "-m", "fixture update"]);
  const target = git(origin, ["rev-parse", "HEAD"]).trim();
  write(path.join(dataDir, ".env"), `DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:55441/fixture_e2e\nSTORAGE_PATH=${path.join(dataDir, "storage")}\nSESSION_SECRET=synthetic-not-a-real-secret\n`);
  write(path.join(dataDir, "pgdata", "PG_VERSION"), "17\n");
  write(path.join(dataDir, "storage", "document.txt"), "synthetic preserved document");
  const calls = [];
  const runCommand = (cmd, args, label, options) => {
    calls.push({ cmd, args: [...args], label });
    if (cmd === "git") return { stdout: git(options.cwd, args), status: 0 };
    if (args.join(" ") === "run desktop:build") {
      if (failBuild) throw new Error("Synthetic build failure");
      write(path.join(checkout, ".next", "BUILD_ID"), "fixture-build-1");
    }
    return { stdout: "", status: 0 };
  };
  return { checkout, dataDir, calls, runCommand, target, assertStopped: async () => {} };
}

try {
  assert.equal(updaterUsesShell("C:\\Program Files\\nodejs\\node.exe", "win32"), false);
  assert.equal(updaterUsesShell("C:\\Pérez & revisión\\node.exe", "win32"), false);
  assert.equal(updaterUsesShell("git", "win32"), false);
  assert.equal(updaterUsesShell("npm.cmd", "win32"), true);
  const envDir = path.join(tmp, "env");
  write(path.join(envDir, ".env"), "DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:55441/fixture_e2e\nSESSION_SECRET=fixture\n");
  const env = hostCommandEnv(envDir, { DATABASE_URL: "wrong", PATH: "/usr/bin" });
  assert.match(env.DATABASE_URL, /fixture_e2e/); assert.equal(env.PATH, "/usr/bin"); assert.equal(env.SESSION_SECRET, "fixture");
  assert.equal(isUnreachableDatabaseError("P1001 Can't reach database server"), true);
  assert.equal(isUnreachableDatabaseError("P3005 migration failed"), false);
  assert.deepEqual(migrateDuringSelfUpdate({ dataDir: envDir, env, runCommand: () => { throw new Error("P1001"); } }), { skipped: true, reason: "unreachable" });
  assert.throws(() => migrateDuringSelfUpdate({ dataDir: envDir, env: {}, runCommand: () => {} }), /data dir/);

  // An update arriving during an automatic backup must wait for it, then use
  // its independently verified stop instead of trying to stop a missing child.
  let child = { pid: 1 }, finishBackup, markBackupStarted;
  const backupStarted = new Promise(resolve => { markBackupStarted = resolve; });
  const backupGate = new Promise(resolve => { finishBackup = resolve; });
  const stopEvents = [];
  const stopHost = async () => { assert.ok(child, "a stopped Host cannot be stopped twice"); stopEvents.push("stop"); child = null; };
  const scheduler = createLocalBackupScheduler({
    dataDir: envDir,
    env: { LEXOPEN_BACKUP_INTERVAL_MINUTES: "60" },
    getChild: () => child,
    stopHost,
    startHost: () => { stopEvents.push("start"); child = { pid: 2 }; },
    waitForHost: async () => true,
    backup: async () => { stopEvents.push("backup"); markBackupStarted(); await backupGate; stopEvents.push("backup_done"); return { destination: "fixture", removed: [] }; },
    logger: { log() {}, warn() {} },
  });
  const backupRun = scheduler.runNow();
  await backupStarted;
  const preparing = stopHostForSelfUpdate({ backupScheduler: scheduler, getChild: () => child, stopHost, assertStopped: async () => { assert.equal(child, null); stopEvents.push("assert_stopped"); } });
  await Promise.resolve();
  assert.deepEqual(stopEvents, ["stop", "backup"], "preflight waits until the ongoing backup finishes");
  finishBackup();
  await Promise.all([backupRun, preparing]);
  assert.deepEqual(stopEvents, ["stop", "backup", "backup_done", "assert_stopped"]);
  await assert.rejects(() => stopHostForSelfUpdate({ getChild: () => null, stopHost, assertStopped: async () => { throw new Error("fixture Host still listening"); } }), /still listening/, "a missing child does not establish that the Host is stopped");
  child = { pid: 3 };
  await stopHostForSelfUpdate({ getChild: () => child, stopHost, assertStopped: async () => assert.fail("the normal stop already verifies the Host") });
  assert.equal(child, null);

  const first = fixture("successful");
  const before = git(first.checkout, ["rev-parse", "HEAD"]).trim();
  write(path.join(first.checkout, "personal-notes.txt"), "must survive");
  const dirtyId = randomUUID();
  await assert.rejects(() => applySelfUpdate({ ...first, rootDir: first.checkout, requestId: dirtyId, hostStopped: true }), /cambios o archivos locales/);
  assert.equal(git(first.checkout, ["rev-parse", "HEAD"]).trim(), before);
  assert.equal(fs.readFileSync(path.join(first.checkout, "personal-notes.txt"), "utf8"), "must survive");
  assert.ok(!first.calls.some(call => call.args[0] === "fetch"), "dirty trees are rejected before fetching");
  assert.equal(releaseUpdateLock(first.dataDir, dirtyId), true);
  fs.unlinkSync(path.join(first.checkout, "personal-notes.txt"));
  first.calls.length = 0;
  const stillRunningId = randomUUID();
  await assert.rejects(() => applySelfUpdate({ ...first, rootDir: first.checkout, requestId: stillRunningId, hostStopped: true, assertStopped: async () => { throw new Error("fixture PostgreSQL socket still open"); } }), /socket still open/);
  assert.ok(!first.calls.some(call => call.args[0] === "fetch"), "a caller's stopped flag cannot bypass the independent stop proof");
  assert.equal(git(first.checkout, ["rev-parse", "HEAD"]).trim(), before);
  releaseUpdateLock(first.dataDir, stillRunningId);
  first.calls.length = 0;
  const reopenedId = randomUUID(); let stoppedChecks = 0;
  await assert.rejects(() => applySelfUpdate({ ...first, rootDir: first.checkout, requestId: reopenedId, hostStopped: true, assertStopped: async () => { if (++stoppedChecks === 2) throw new Error("fixture Host reopened during fetch"); } }), /reopened during fetch/);
  assert.equal(stoppedChecks, 2); assert.equal(git(first.checkout, ["rev-parse", "HEAD"]).trim(), before);
  releaseUpdateLock(first.dataDir, reopenedId); first.calls.length = 0;
  const id = randomUUID();
  const result = await applySelfUpdate({ ...first, rootDir: first.checkout, requestId: id, hostStopped: true });
  assert.equal(result.phase, "awaiting_restart"); assert.equal(result.ok, false);
  assert.equal(result.fromRevision, before); assert.equal(result.targetRevision, first.target);
  assert.equal(fs.readFileSync(path.join(result.backupDirectory, "storage", "document.txt"), "utf8"), "synthetic preserved document");
  assert.deepEqual(first.calls.filter(call => call.cmd !== "git").map(call => call.args.join(" ")), ["ci", "--prefix desktop ci", path.join(first.checkout, "desktop", "node_modules", "electron", "install.js"), "run desktop:build"]);
  assert.equal(result.migrationState, "deferred_to_restart", "migrations only start with the verified build on Host restart");
  assert.doesNotThrow(() => assertSelfUpdateStartupSafe({ dataDir: first.dataDir, rootDir: first.checkout }));
  write(path.join(first.checkout, "post-build-changes.txt"), "must be reviewed before migrations");
  assert.throws(() => assertSelfUpdateStartupSafe({ dataDir: first.dataDir, rootDir: first.checkout }), /no coinciden/, "uncommitted changes after the build must not enter restart migrations");
  fs.unlinkSync(path.join(first.checkout, "post-build-changes.txt"));
  write(path.join(first.checkout, ".next", "BUILD_ID"), "stale-build");
  assert.throws(() => assertSelfUpdateStartupSafe({ dataDir: first.dataDir, rootDir: first.checkout }), /no coinciden/);
  write(path.join(first.checkout, ".next", "BUILD_ID"), "fixture-build-1");
  const exactReceipt = fs.readFileSync(statusPath(first.dataDir), "utf8");
  for (const phase of ["applying", "installing", "building", "migrating", "restarting"]) {
    write(statusPath(first.dataDir), JSON.stringify({ phase, codeApplied: false }));
    assert.throws(() => assertSelfUpdateStartupSafe({ dataDir: first.dataDir, rootDir: first.checkout }), /recuperación supervisada/, `${phase} is unsafe after an interrupted coordinator`);
  }
  write(statusPath(first.dataDir), exactReceipt);
  assert.equal(finalizeSelfUpdate(first.dataDir, randomUUID(), { ok: true }), false, "foreign receipts cannot finalize");
  assert.equal(finalizeSelfUpdate(first.dataDir, id, { ok: true, version: "1.0.1", buildId: "fixture-build-1", sourceRevision: first.target }), true);
  assert.equal(JSON.parse(fs.readFileSync(statusPath(first.dataDir))).phase, "done");
  assert.equal(releaseUpdateLock(first.dataDir, randomUUID()), false);
  assert.equal(fs.existsSync(lockPath(first.dataDir)), true);
  releaseUpdateLock(first.dataDir, id);

  const second = fixture("build-failure", true), failedId = randomUUID();
  await assert.rejects(() => applySelfUpdate({ ...second, rootDir: second.checkout, requestId: failedId, hostStopped: true }), /Synthetic build failure/);
  const failed = JSON.parse(fs.readFileSync(statusPath(second.dataDir)));
  assert.equal(failed.phase, "failed"); assert.equal(failed.ok, false); assert.equal(failed.codeApplied, true); assert.equal(failed.recoveryRequired, true);
  assert.equal(failed.rollbackImplemented, false);
  assert.throws(() => assertSelfUpdateStartupSafe({ dataDir: second.dataDir, rootDir: second.checkout }), /recuperación supervisada/, "restarting the coordinator must not bypass failed-build recovery");
  assert.equal(canRestartPreparedUpdate(failed, failedId), false, "the coordinator must not restart a failed build into migrations");
  assert.equal(canRestartPreparedUpdate({ ...failed, codeApplied: false }, failedId), true);
  assert.equal(canRestartPreparedUpdate({ ...failed, phase: "awaiting_restart" }, failedId), true);
  assert.equal(canRestartPreparedUpdate({ ...failed, phase: "awaiting_restart" }, randomUUID()), false);
  assert.equal(second.calls.some(call => call.args.includes("db:migrate")), false, "a failed build never starts migrations");
  assert.equal(fs.readFileSync(path.join(second.dataDir, "storage", "document.txt"), "utf8"), "synthetic preserved document");
  releaseUpdateLock(second.dataDir, failedId);

  const mismatchDir = path.join(tmp, "health-mismatch"); fs.mkdirSync(mismatchDir);
  const mismatchId = randomUUID();
  write(statusPath(mismatchDir), JSON.stringify({ requestId: mismatchId, phase: "awaiting_restart", toVersion: "1.0.1", expectedBuildId: "new-build", targetRevision: first.target }));
  assert.equal(finalizeSelfUpdate(mismatchDir, mismatchId, { ok: true, version: "1.0.1", buildId: "old-build", sourceRevision: first.target }), false);
  assert.equal(JSON.parse(fs.readFileSync(statusPath(mismatchDir))).phase, "failed", "a healthy old build is not an update success");

  const lockDir = path.join(tmp, "foreign-lock"), lockId = randomUUID(); fs.mkdirSync(lockDir);
  claimUpdateLock(lockDir, lockId);
  assert.throws(() => claimUpdateLock(lockDir, lockId), /Otra actualización/, "a live same-process execution cannot be claimed twice");
  assert.throws(() => claimUpdateLock(lockDir, randomUUID()), /Otra actualización/);
  fs.utimesSync(lockPath(lockDir), new Date(0), new Date(0));
  assert.throws(() => claimUpdateLock(lockDir, randomUUID()), /Otra actualización/, "age does not remove a live owner's lock");
  assert.equal(releaseUpdateLock(lockDir, randomUUID()), false);
  releaseUpdateLock(lockDir, lockId);
  console.log("source updater: backup/update coordination, disposable Git repos, dirty guard, pinned installs, backup integrity, build-before-migration, exact restart and owned locks passed");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
