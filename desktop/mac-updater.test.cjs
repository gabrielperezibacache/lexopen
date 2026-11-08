/** Real MacUpdater contract with a native Electron shim; no macOS installer runs. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const Module = require("node:module");
const { EventEmitter, once } = require("node:events");
const { applyUpdaterPolicy, quitAndInstallUpdate } = require("./update-policy.cjs");

function fixture() {
  const native = new EventEmitter(), app = new EventEmitter();
  const calls = { checks: 0, installs: 0 };
  app.version = "1.0.0";
  app.quit = () => app.emit("before-quit");
  const result = { native, app, calls, check: () => setImmediate(() => native.emit("update-downloaded")) };
  native.checkForUpdates = () => { calls.checks++; return result.check(); };
  native.quitAndInstall = () => { calls.installs++; app.emit("before-quit"); };
  native.setFeedURL = options => { result.feed = options; };
  const originalLoad = Module._load;
  try {
    Module._load = function (request, ...args) {
      return request === "electron" ? { autoUpdater: native } : originalLoad.call(this, request, ...args);
    };
    const { MacUpdater } = require("electron-updater/out/MacUpdater");
    result.updater = new MacUpdater(null, app);
  } finally { Module._load = originalLoad; }
  result.updater.logger = null;
  applyUpdaterPolicy(result.updater, {});
  return result;
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("MacUpdater fixture did not settle")), 3000);
    })]);
  } finally { clearTimeout(timer); }
}

function get(url, headers) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks) }));
    }).on("error", reject);
  });
}

async function main() {
  {
    const { updater, native, app, calls } = fixture();
    const constructorListeners = native.listeners("update-downloaded");
    native.checkForUpdates = () => setImmediate(() => native.emit("error", new Error("fixture native signature error")));
    await assert.rejects(bounded(quitAndInstallUpdate(updater, app, { nativeUpdater: native })), /native signature error/);
    assert.deepEqual(native.listeners("update-downloaded"), constructorListeners, "failed installation removes only the callback it added");
    native.emit("update-downloaded");
    assert.equal(calls.installs, 0, "a late native download cannot install after the Host resumed");
    assert.equal(updater.squirrelDownloadedUpdate, true, "MacUpdater's permanent state listener stays attached");
    assert.equal(app.listenerCount("before-quit"), 0);
  }
  {
    const f = fixture();
    const constructorListeners = f.native.listeners("update-downloaded");
    f.check = () => setImmediate(() => f.native.emit("error", new Error("fixture first attempt failed")));
    await assert.rejects(bounded(quitAndInstallUpdate(f.updater, f.app, { nativeUpdater: f.native })), /first attempt failed/);
    f.check = () => setImmediate(() => f.native.emit("update-downloaded"));
    await bounded(quitAndInstallUpdate(f.updater, f.app, { nativeUpdater: f.native }));
    assert.equal(f.calls.checks, 2);
    assert.equal(f.calls.installs, 1, "retrying does not retain the failed attempt's installation callback");
    assert.deepEqual(f.native.listeners("update-downloaded"), constructorListeners);
  }
  {
    const f = fixture();
    const constructorListeners = f.native.listeners("update-downloaded");
    f.check = () => { throw new Error("fixture synchronous native failure"); };
    await assert.rejects(bounded(quitAndInstallUpdate(f.updater, f.app, { nativeUpdater: f.native })), /synchronous native failure/);
    assert.deepEqual(f.native.listeners("update-downloaded"), constructorListeners);
    f.native.emit("update-downloaded");
    assert.equal(f.calls.installs, 0);
  }
  {
    const f = fixture();
    const constructorListeners = f.native.listeners("update-downloaded");
    f.check = () => {};
    await assert.rejects(bounded(quitAndInstallUpdate(f.updater, f.app, { nativeUpdater: f.native, timeoutMs: 20 })), error => error.code === "ERR_UPDATER_INSTALL_TIMEOUT");
    assert.deepEqual(f.native.listeners("update-downloaded"), constructorListeners);
    assert.equal(f.app.listenerCount("before-quit"), 0);
    f.native.emit("update-downloaded");
    assert.equal(f.calls.installs, 0, "a timed-out installation cannot run after Host recovery");
  }
  {
    const f = fixture();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-mac-updater-"));
    const bytes = Buffer.from("fictitious ZIP bytes; native OS signature validation is outside this fixture");
    const file = path.join(directory, "fixture.zip");
    await fs.writeFile(file, bytes);
    let downloadedEvents = 0;
    f.updater.on("update-downloaded", () => { downloadedEvents++; });
    try {
      await bounded(f.updater.updateDownloaded({ url: new URL("https://example.invalid/fixture.zip"), info: { size: bytes.length } }, { version: "1.0.1", downloadedFile: file }));
      assert.equal(downloadedEvents, 1);
      assert.equal(f.calls.checks, 0, "native preparation waits for explicit installation");
      assert.equal((await get(f.feed.url)).status, 401, "native feed requires its generated authentication");
      assert.equal((await get(f.feed.url + "/unknown")).status, 404);
      f.check = () => {
        void (async () => {
          const response = await get(f.feed.url, f.feed.headers);
          assert.equal(response.status, 200);
          const target = JSON.parse(response.body.toString()).url;
          const archive = await get(target);
          assert.equal(archive.status, 200);
          assert.deepEqual(archive.body, bytes);
          f.native.emit("update-downloaded");
        })().catch(error => f.native.emit("error", error));
      };
      await bounded(quitAndInstallUpdate(f.updater, f.app, { nativeUpdater: f.native }));
      assert.equal(f.calls.installs, 1);
      assert.equal(f.updater.squirrelDownloadedUpdate, true);
    } finally {
      if (f.updater.server?.listening) {
        const closed = once(f.updater.server, "close");
        f.updater.closeServerIfExists();
        await closed;
      }
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
  console.log("MacUpdater real contract: failure cancellation, late event, retry and authenticated local proxy passed; native macOS signing not exercised");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
