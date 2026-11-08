const assert = require("node:assert/strict");
const { applyUpdaterPolicy, updatePreferences, assertUpdateVersion, compareVersions, friendlyUpdateError, withNetworkRetry, quitAndInstallUpdate, installPreparedUpdate, verifyBackupContents, diagnoseOptionalTools } = require("./update-policy.cjs");
const { NsisUpdater } = require("electron-updater/out/NsisUpdater");
const { EventEmitter } = require("node:events");

async function main() {
  assert.deepEqual(updatePreferences(), { enabled: true, channel: "stable" });
  const updater = { set channel(value) { this.channelValue = value; this.allowDowngrade = true; } };
  applyUpdaterPolicy(updater, { updateChannel: "preview" });
  assert.equal(updater.channelValue, "preview");
  assert.equal(updater.allowPrerelease, true);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  // Exercise the installed updater's real API. A boolean here replaces its
  // verifier and only fails when a signed Windows update is downloaded.
  const windowsUpdater = new NsisUpdater(null, { version: "1.0.0" });
  const defaultVerifier = windowsUpdater.verifyUpdateCodeSignature;
  applyUpdaterPolicy(windowsUpdater, {});
  assert.equal(typeof defaultVerifier, "function");
  assert.equal(windowsUpdater.verifyUpdateCodeSignature, defaultVerifier);
  const verificationCalls = [];
  windowsUpdater.verifyUpdateCodeSignature = async (publishers, file) => {
    verificationCalls.push({ publishers, file });
    return "fixture invalid signature";
  };
  windowsUpdater.configOnDisk = { value: Promise.resolve({ publisherName: "Fixture Publisher" }) };
  applyUpdaterPolicy(windowsUpdater, {});
  assert.equal(await windowsUpdater.verifySignature("/fixture/installer.exe"), "fixture invalid signature");
  assert.deepEqual(verificationCalls, [{ publishers: ["Fixture Publisher"], file: "/fixture/installer.exe" }]);
  windowsUpdater.logger = null;
  windowsUpdater.downloadedUpdateHelper = { file: "/fixture/installer.exe", downloadedFileInfo: {} };
  windowsUpdater.doInstall = () => { throw new Error("fixture installer launch failure"); };
  const installApp = new EventEmitter();
  await assert.rejects(quitAndInstallUpdate(windowsUpdater, installApp), /installer launch failure/);
  assert.equal(installApp.listenerCount("before-quit"), 0);
  const fixtureUpdater = new EventEmitter();
  fixtureUpdater.quitAndInstall = () => setImmediate(() => fixtureUpdater.emit("error", new Error("fixture asynchronous failure")));
  await assert.rejects(quitAndInstallUpdate(fixtureUpdater, installApp), /asynchronous failure/);
  assert.equal(fixtureUpdater.listenerCount("error"), 0);
  fixtureUpdater.quitAndInstall = () => setImmediate(() => installApp.emit("before-quit"));
  await quitAndInstallUpdate(fixtureUpdater, installApp);
  assert.equal(fixtureUpdater.listenerCount("error"), 0);
  assert.equal(installApp.listenerCount("before-quit"), 0);
  assert.equal(compareVersions("1.1.0-preview.10", "1.1.0-preview.2"), 1);
  assert.equal(compareVersions("1.1.0", "1.1.0-preview.10"), 1);
  assert.throws(() => assertUpdateVersion("1.1.0", "1.0.9", "stable"), /bloqueó/);
  assert.throws(() => assertUpdateVersion("1.0.0", "1.1.0-preview.1", "stable"), /prueba/);
  assertUpdateVersion("1.0.0", "1.1.0-preview.1", "preview");
  assert.throws(() => assertUpdateVersion("1.0.0", "latest", "stable"), /comprobarse/);
  let attempts = 0; const delays = [];
  assert.equal(await withNetworkRetry(async () => { if (++attempts < 3) throw new Error("ETIMEDOUT"); return "fixture"; }, { sleep: async ms => delays.push(ms) }), "fixture");
  assert.deepEqual(delays, [1000, 3000]);
  attempts = 0;
  await assert.rejects(() => withNetworkRetry(async () => { attempts++; throw new Error("ECONNRESET"); }, { sleep: async () => {} }));
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(() => withNetworkRetry(async () => { attempts++; throw new Error("ERR_UPDATER_INVALID_SIGNATURE"); }, { sleep: async () => {} }));
  assert.equal(attempts, 1);
  assert.match(friendlyUpdateError(new Error("Could not get code signature")), /instalador verificado/);
  const events = [];
  const host = { mode: "host", stopHost: async () => events.push("stop"), backupHost: async () => { events.push("backup"); return { type: "lexopen-host-data", includes: ["pgdata", "storage"] }; }, install: async () => events.push("install"), restartHost: async () => events.push("restart") };
  await installPreparedUpdate(host);
  assert.deepEqual(events, ["stop", "backup", "install"]);
  events.length = 0;
  await assert.rejects(() => installPreparedUpdate({ ...host, stopHost: async () => { events.push("stop"); throw new Error("fixture PostgreSQL still active"); } }), /still active/);
  assert.deepEqual(events, ["stop"], "an unconfirmed stop never reaches backup or install");
  events.length = 0;
  await assert.rejects(() => installPreparedUpdate({ ...host, backupHost: async () => { events.push("backup"); throw new Error("fixture full disk"); } }), /full disk/);
  assert.deepEqual(events, ["stop", "backup", "restart"], "a failed backup blocks installation and attempts to resume the old Host");
  await assert.rejects(() => installPreparedUpdate({ ...host,
    install: async () => { throw new Error("fixture installer failed"); },
    restartHost: async () => { throw new Error("fixture restart failed"); },
  }), error => error.code === "ERR_UPDATER_HOST_RECOVERY_FAILED" && error.errors.length === 2 && /no se pudo reanudar/.test(error.message));
  events.length = 0;
  await installPreparedUpdate({ ...host, mode: "client" });
  assert.deepEqual(events, ["install"], "clients do not back up the remote database");
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-update-integrity-"));
  try {
    fs.mkdirSync(path.join(tmp, "source")); fs.writeFileSync(path.join(tmp, "source", "fixture.txt"), "preserved fixture");
    fs.cpSync(path.join(tmp, "source"), path.join(tmp, "backup"), { recursive: true });
    assert.equal((await verifyBackupContents(path.join(tmp, "source"), path.join(tmp, "backup"))).verifiedFiles, 1);
    fs.writeFileSync(path.join(tmp, "backup", "fixture.txt"), "changed fixture");
    await assert.rejects(() => verifyBackupContents(path.join(tmp, "source"), path.join(tmp, "backup")), /integridad/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const probes = [];
  const tools = await diagnoseOptionalTools({ env: { PATH: "/fixture/bin", DATABASE_URL: "must-not-reach-tools", SESSION_SECRET: "must-not-reach-tools" }, execute: async (command, args, options) => {
    probes.push({ command, args, options });
    if (command === "pdftoppm") return "pdftoppm version 25.01.0";
    if (command === "tesseract") throw Object.assign(new Error("fixture missing"), { code: "ENOENT" });
    return "codex-cli 0.155.1";
  } });
  assert.deepEqual(tools.map(tool => tool.status), ["detected", "missing", "detected"]);
  assert.ok(probes.every(probe => probe.options.shell === false && probe.options.env.DATABASE_URL === undefined && probe.options.env.SESSION_SECRET === undefined));
  console.log("desktop update policy: channels/signature/downgrade/bounded retry/mandatory backup passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
