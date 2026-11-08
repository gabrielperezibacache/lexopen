/** Real updater/provider/checksum and temporary executable replacement, without a user installation. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const Module = require("node:module");
const { createHash } = require("node:crypto");
const { EventEmitter, once } = require("node:events");
const { AppImageUpdater } = require("electron-updater/out/AppImageUpdater");
const { ElectronHttpExecutor } = require("electron-updater/out/electronHttpExecutor");
const { applyUpdaterPolicy, withNetworkRetry, verifyDownloadedUpdate, quitAndInstallUpdate } = require("./update-policy.cjs");

class LocalHttpExecutor extends ElectronHttpExecutor {
  // Preserve electron-updater's download pipeline and SHA512 verification,
  // replacing only Electron's network transport with loopback Node HTTP.
  createRequest(options, callback) {
    assert.equal(options.hostname, "127.0.0.1");
    return http.request({ ...options, agent: false }, callback);
  }
  addRedirectHandlers() {}
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("AppImageUpdater fixture did not settle")), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

async function main() {
  if (process.platform !== "linux") {
    console.log("AppImageUpdater temporary executable replacement requires Linux; covered by the Linux CI job");
    return;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-appimage-updater-"));
  const previousEnvironment = { APPIMAGE: process.env.APPIMAGE, LEXOPEN_UPDATE_FIXTURE_MARKER: process.env.LEXOPEN_UPDATE_FIXTURE_MARKER };
  const originalLoad = Module._load;
  const native = new EventEmitter();
  const appImage = path.join(root, "LexOpen-1.0.0-linux-x86_64.AppImage");
  const marker = path.join(root, "restarted.txt");
  const data = path.join(root, "preserved.txt");
  const name = "LexOpen-1.0.1-linux-x86_64.AppImage";
  const bytes = Buffer.from('#!/bin/sh\nprintf "fixture restarted" > "$LEXOPEN_UPDATE_FIXTURE_MARKER"\n');
  const checksum = createHash("sha512").update(bytes).digest("base64");
  const requests = [], retryDelays = [];
  let failFirstCheck = true, corruptDownload = false;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    requests.push(pathname);
    if (pathname === "/latest-linux.yml") {
      if (failFirstCheck) { failFirstCheck = false; response.writeHead(503).end("fixture transient failure"); return; }
      response.end(JSON.stringify({ version: "1.0.1", files: [{ url: name, sha512: checksum, size: bytes.length }] }));
    } else if (pathname === `/${name}`) {
      response.end(corruptDownload ? Buffer.from("fixture corrupted archive") : bytes);
    } else response.writeHead(404).end();
  });
  try {
    fs.writeFileSync(appImage, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.writeFileSync(data, "fixture preserved data");
    process.env.APPIMAGE = appImage;
    process.env.LEXOPEN_UPDATE_FIXTURE_MARKER = marker;
    Module._load = function (request, ...args) {
      return request === "electron" ? { autoUpdater: native } : originalLoad.call(this, request, ...args);
    };
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const url = `http://127.0.0.1:${server.address().port}`;
    function fixture(label) {
      const app = new EventEmitter();
      Object.assign(app, { version: "1.0.0", name: "LexOpen fixture", isPackaged: true,
        baseCachePath: path.join(root, label, "cache"), userDataPath: path.join(root, label, "data"),
        whenReady: async () => {}, quit: () => app.emit("before-quit") });
      const updater = new AppImageUpdater(null, app);
      updater.logger = null;
      updater.httpExecutor = new LocalHttpExecutor();
      updater.configOnDisk = { value: Promise.resolve({ updaterCacheDirName: "lexopen-fixture" }) };
      updater.disableDifferentialDownload = true;
      updater.setFeedURL({ provider: "generic", url });
      applyUpdaterPolicy(updater, {});
      const events = [];
      for (const event of ["checking-for-update", "update-available", "update-downloaded", "error"]) updater.on(event, () => events.push(event));
      return { app, updater, events };
    }
    const valid = fixture("valid");
    const checked = await bounded(withNetworkRetry(() => valid.updater.checkForUpdates(), { sleep: async delay => retryDelays.push(delay) }));
    assert.equal(checked.isUpdateAvailable, true);
    assert.equal(checked.downloadPromise, null, "automatic checks do not download without consent");
    assert.deepEqual(retryDelays, [1000], "real HTTP 503 errors are retried");
    assert.equal(requests.includes(`/${name}`), false);
    const [download] = await bounded(valid.updater.downloadUpdate());
    assert.deepEqual(fs.readFileSync(download), bytes);
    assert.equal(fs.statSync(download).mode & 0o777, 0o755);
    assert.equal(valid.events.filter(event => event === "update-downloaded").length, 1);
    assert.equal(fs.existsSync(appImage), true, "downloading preserves the current installation");
    const originalApp = fs.readFileSync(appImage);
    const linkedSource = path.join(root, "other-verified-file");
    fs.writeFileSync(linkedSource, bytes);
    for (const change of ["missing", "tampered", "symlink"]) {
      const cached = valid.updater.downloadedUpdateHelper.file;
      if (change === "missing") fs.unlinkSync(cached);
      else if (change === "tampered") { const changed = Buffer.from(bytes); changed[0] ^= 1; fs.writeFileSync(cached, changed); }
      else { fs.unlinkSync(cached); fs.symlinkSync(linkedSource, cached); }
      await assert.rejects(bounded((async () => {
        await verifyDownloadedUpdate(valid.updater, "1.0.1");
        await quitAndInstallUpdate(valid.updater, valid.app);
      })()), error => error.code === "ERR_UPDATER_CACHE_INVALID");
      assert.deepEqual(fs.readFileSync(appImage), originalApp, `${change} cache must not remove the installed AppImage`);
      assert.equal(fs.readFileSync(data, "utf8"), "fixture preserved data");
      await valid.updater.downloadedUpdateHelper.clear();
      await bounded(valid.updater.downloadUpdate());
      assert.deepEqual(fs.readFileSync(valid.updater.downloadedUpdateHelper.file), bytes, "the same updater can download a fresh verified cache");
      assert.deepEqual(fs.readFileSync(linkedSource), bytes, "cache cleanup never follows a rejected symlink");
    }
    const prepared = await verifyDownloadedUpdate(valid.updater, "1.0.1");
    // The cache can be cleaned while the Host backup is running. The second
    // preflight immediately before the real installer must reject that too.
    fs.unlinkSync(prepared.file);
    await assert.rejects(verifyDownloadedUpdate(valid.updater, "1.0.1", prepared), error => error.code === "ERR_UPDATER_CACHE_INVALID");
    assert.deepEqual(fs.readFileSync(appImage), originalApp);
    await valid.updater.downloadedUpdateHelper.clear();
    await bounded(valid.updater.downloadUpdate());
    await verifyDownloadedUpdate(valid.updater, "1.0.1");
    await bounded(quitAndInstallUpdate(valid.updater, valid.app));
    const destination = path.join(root, name);
    assert.equal(fs.existsSync(appImage), false);
    assert.deepEqual(fs.readFileSync(destination), bytes);
    await bounded((async () => {
      while (!fs.existsSync(marker)) await new Promise(resolve => setTimeout(resolve, 10));
    })());
    assert.equal(fs.readFileSync(marker, "utf8"), "fixture restarted");
    assert.equal(fs.readFileSync(data, "utf8"), "fixture preserved data");
    // A fresh cache must reject corrupt server bytes before replacement.
    process.env.APPIMAGE = destination;
    corruptDownload = true;
    const invalid = fixture("corrupt");
    await bounded(invalid.updater.checkForUpdates());
    await assert.rejects(bounded(invalid.updater.downloadUpdate()), error => error.code === "ERR_CHECKSUM_MISMATCH");
    assert.equal(invalid.events.includes("update-downloaded"), false);
    assert.deepEqual(fs.readFileSync(destination), bytes);
    assert.equal(fs.readFileSync(data, "utf8"), "fixture preserved data");
    console.log("AppImageUpdater real contract: HTTP retry, consent, SHA512, missing/tampered/symlink cache preflight, redownload, temporary replacement/restart and corrupt download rejection passed");
  } finally {
    Module._load = originalLoad;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
