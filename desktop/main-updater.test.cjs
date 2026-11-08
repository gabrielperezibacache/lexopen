/** Electron main integration in a fake process; no GUI, network, updater or real data is used. */
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { pathToFileURL } = require("node:url");
const realConfig = require("./config.cjs"), realBackup = require("./backup.cjs");
async function main() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-main-updater-")));
  const dataDir = path.join(tmp, "data");
  fs.mkdirSync(path.join(dataDir, "pgdata"), { recursive: true }); fs.mkdirSync(path.join(dataDir, "storage"));
  fs.writeFileSync(path.join(dataDir, "pgdata", "PG_VERSION"), "17"); fs.writeFileSync(path.join(dataDir, "storage", "fixture.txt"), "fake preserved content");
  fs.writeFileSync(path.join(dataDir, ".env"), `STORAGE_PATH=${path.join(dataDir, "storage")}\n`);
  const cfg = { ...realConfig.DEFAULTS, dataDir, hostDataDir: dataDir, mode: null };
  const events = [], intervals = [], status = [], dialogs = [], errors = [], handlers = new Map(), externalUrls = [];
  const packageCalls = [];
  let cacheClears = 0;
  let removeCacheAfterBackup = false;
  let mainMenu;
  let completePreparation;
  const updater = new EventEmitter(); let checks = 0;
  const downloadFile = path.join(tmp, "downloaded.AppImage");
  const downloadBytes = Buffer.from("fictitious verified installer bytes");
  const downloadHash = require("node:crypto").createHash("sha512").update(downloadBytes).digest("base64");
  const prepareDownload = version => {
    fs.writeFileSync(downloadFile, downloadBytes);
    updater.downloadedUpdateHelper = {
      file: downloadFile, versionInfo: { version }, fileInfo: { info: { size: downloadBytes.length, sha512: downloadHash } }, downloadedFileInfo: { sha512: downloadHash },
      async clear() { cacheClears++; fs.rmSync(downloadFile, { force: true }); this.file = null; this.versionInfo = null; this.fileInfo = null; },
    };
  };
  prepareDownload("1.0.1");
  const signatureVerifier = async () => null;
  Object.assign(updater, { verifyUpdateCodeSignature: signatureVerifier, setFeedURL() {}, checkForUpdates: async () => { checks++; return {}; }, quitAndInstall: () => { events.push("install"); app.emit("before-quit"); } });
  const app = new EventEmitter(); Object.assign(app, { isPackaged: true, whenReady: () => Promise.resolve(), getPath: () => tmp, getAppPath: () => path.join(tmp, "app"), quit() {}, exit() {} });
  const windows = [];
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = new EventEmitter(); Object.assign(this.webContents, { setWindowOpenHandler(handler) { this.openWindow = handler; }, send: (_name, value) => status.push(value), getURL: () => "file:///fixture/setup.html", mainFrame: { url: pathToFileURL(path.join(tmp, "lexopen-desktop", "setup.html")).href } }); windows.push(this); }
    isDestroyed() { return false; }
    loadFile() { return Promise.resolve(); }
    loadURL() { return Promise.resolve(); }
    setProgressBar(value) { this.progress = value; }
    static getAllWindows() { return windows; }
  }
  const sandbox = { console, __dirname, process: { env: { LEXOPEN_APP_VERSION: "0.0.1-untrusted" }, resourcesPath: path.join(tmp, "resources"), platform: "linux", pid: process.pid }, URL, Date, AbortSignal, AbortController,
    setTimeout: () => ({ unref() {} }), setInterval: (callback, ms) => { intervals.push({ callback, ms }); return { unref() {} }; }, clearInterval() {},
    fixtureHost: { stop: async () => events.push("stop") },
    fixtureRestart: async () => events.push("restart"),
    require: name => {
      if (name === "electron") return { app, BrowserWindow: Window, ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, shell: { openPath() {}, async openExternal(url) { externalUrls.push(url); } }, Menu: { buildFromTemplate: value => value, setApplicationMenu: value => { mainMenu = value; } }, dialog: { showOpenDialog: async () => assert.fail("Automatic preparation must not show a file chooser"), showMessageBox: async options => { dialogs.push(options); return { response: 0 }; }, showErrorBox: (_title, message) => errors.push(message) } };
      if (name === "electron-updater") return { autoUpdater: updater };
      if (name === "./config.cjs") return { ...realConfig, readConfig: () => ({ ...cfg }), writeConfig: value => Object.assign(cfg, value), readPackageVersion: () => "1.0.0", readAppState: () => ({}) };
      if (name === "./backup.cjs") return { ...realBackup, createDataBackup: async (...args) => { events.push("backup"); const manifest = await realBackup.createDataBackup(...args); if (removeCacheAfterBackup) fs.unlinkSync(downloadFile); return manifest; } };
      if (name === "./media-permissions.cjs") return { attachMicrophoneGuards() {} };
      if (name === "./altazor-toolpack.cjs") return {
        prepareDesktopToolpack: (version, { resourceRoot, progress, signal }) => {
          packageCalls.push([version, resourceRoot]);
          progress({ state: "package-downloading", percent: 50 });
          return new Promise(resolve => {
            completePreparation = resolve;
            signal.addEventListener("abort", () => resolve({ state: "package-cancelled" }), { once: true });
          });
        },
      };
      return require(name);
    },
  };
  try {
    const context = vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8"), context, { filename: "main.cjs" });
    await new Promise(resolve => setImmediate(resolve));
    const setup = fs.readFileSync(path.join(tmp, "lexopen-desktop", "setup.html"), "utf8");
    const brand = fs.readFileSync(path.join(__dirname, "renderer", "lexopen-brand.png"));
    assert.equal(setup.includes(`src="data:image/png;base64,${brand.toString("base64")}"`), true);
    assert.match(setup, /default-src 'none'; img-src data:;/);
    assert.equal(vm.runInContext("bundledVersion()", context), "1.0.0", "packaged identity ignores untrusted environment overrides");
    const prepare = handlers.get("desktop:prepare-altazor-desktop");
    const window = windows[0];
    const sender = window.webContents, senderFrame = sender.mainFrame;
    const setupEvent = { sender, senderFrame };
    const oauthParams = new URLSearchParams({ client_id: "fixture-public-client", response_type: "code", redirect_uri: "http://127.0.0.1:3000/api/altazor/connectors/oauth/callback", state: "s".repeat(43), code_challenge: "c".repeat(43), code_challenge_method: "S256" });
    const google = `https://accounts.google.com/o/oauth2/v2/auth?${oauthParams}`;
    const microsoftParams = new URLSearchParams(oauthParams); microsoftParams.set("scope", "offline_access User.Read Files.Read"); microsoftParams.set("response_mode", "query"); microsoftParams.set("redirect_uri", "http://localhost:3000/api/altazor/connectors/oauth/callback");
    const allowedExternal = [google, `https://www.dropbox.com/oauth2/authorize?${oauthParams}&token_access_type=offline`, `https://github.com/login/oauth/authorize?${oauthParams}`, `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${microsoftParams}`, "https://github.com/login/device", "https://docs.render.com/deploy-hooks#creating-a-deploy-hook"];
    const blockedExternal = ["https://evil.test/", `${google}&client_secret=fixture`, `${google}&redirect=https://evil.test`, google.replace("127.0.0.1%3A3000", "127.0.0.1%3A9999"), `${google}#token=fixture`, "https://accounts.google.com/other", "https://www.dropbox.com/redirect?url=https://evil.test", "javascript:alert(1)", "https://user:pass@github.com/login/device", "http://github.com/login/device"];
    for (const url of [...allowedExternal, ...blockedExternal]) {
      const expected = allowedExternal.includes(url);
      externalUrls.length = 0;
      assert.equal(sender.openWindow({ url }).action, "deny", "Electron must never create a provider child window");
      assert.deepEqual(externalUrls, expected ? [url] : [], `window.open: ${url}`);
      externalUrls.length = 0;
      let prevented = false;
      sender.emit("will-navigate", { preventDefault() { prevented = true; } }, url);
      assert.equal(prevented, true, "external pages must not replace the LexOpen window");
      assert.deepEqual(externalUrls, expected ? [url] : [], `will-navigate: ${url}`);
      externalUrls.length = 0;
      assert.equal((await handlers.get("desktop:open-external")({}, url)).ok, expected);
      assert.deepEqual(externalUrls, expected ? [url] : [], `IPC: ${url}`);
    }
    externalUrls.length = 0;
    for (const url of ["http://127.0.0.1:3000/inicio", pathToFileURL(path.join(__dirname, "renderer", "setup.html")).href]) {
      let prevented = false;
      sender.emit("will-navigate", { preventDefault() { prevented = true; } }, url);
      assert.equal(prevented, false, "app/setup navigation remains inside LexOpen");
      assert.deepEqual(externalUrls, []);
    }
    assert.equal((await prepare({ sender, senderFrame: { url: senderFrame.url } })).state, "unavailable");
    assert.deepEqual(packageCalls, []);
    assert.equal((await prepare(setupEvent, "ignored-file-from-renderer")).state, "package-downloading");
    assert.equal((await prepare(setupEvent, true)).busy, true);
    assert.deepEqual(packageCalls, [["1.0.0", path.join(tmp, "resources")]]);
    assert.match((await handlers.get("desktop:get-state")(setupEvent)).desktopPreparation.message, /50 %/);
    completePreparation({ state: "package-loaded" });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await prepare(setupEvent, false)).state, "package-loaded");
    assert.equal(packageCalls.length, 1);
    vm.runInContext("desktopPreparation = null; startHostMode = async () => 'http://127.0.0.1:3000'", context);
    const setupResult = await handlers.get("desktop:save-setup")(setupEvent, { mode: "host" });
    assert.equal(setupResult.ok, true);
    assert.equal((await handlers.get("desktop:get-state")(setupEvent)).desktopPreparation.busy, true, "Host startup must finish while desktop preparation is still running");
    assert.equal(packageCalls.length, 2);
    completePreparation({ state: "package-loaded" });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(updater.verifyUpdateCodeSignature, signatureVerifier);
    assert.equal(updater.allowDowngrade, false);
    assert.equal(intervals.some(timer => timer.ms === 6 * 60 * 60 * 1000), true);
    await vm.runInContext("checkForUpdates(true)", context); assert.equal(checks, 1);
    cfg.updateChecks = false;
    await vm.runInContext("checkForUpdates(false)", context); assert.equal(checks, 1);
    updater.emit("download-progress", { percent: 42.5 });
    assert.equal(window.progress, 0.425); assert.equal(status.at(-1).progress, 42.5);
    cfg.mode = "host";
    vm.runInContext("hostHandle = fixtureHost", context);
    assert.equal((await prepare(setupEvent, true)).busy, true);
    await vm.runInContext("promptInstallUpdate({version:'1.0.1'})", context);
    assert.equal((await handlers.get("desktop:get-state")(setupEvent)).desktopPreparation.state, "package-cancelled");
    assert.deepEqual(events, ["stop", "backup", "install"]);
    const backupRoot = realBackup.defaultBackupDirectory(dataDir);
    assert.equal(fs.readdirSync(backupRoot).length, 1);
    assert.equal(dialogs.some(row => /respaldo consistente/.test(row.detail || "")), true);
    const changeMode = mainMenu[0].submenu.find(item => item.label === "Cambiar modo (asistente)");
    vm.runInContext("quitting = false; maintenanceActive = true; hostHandle = fixtureHost", context);
    events.length = 0;
    changeMode.click();
    assert.equal(cfg.mode, "host", "maintenance prevents changing the running mode");
    await handlers.get("desktop:retry")();
    assert.deepEqual(events, [], "retry cannot restart the Host while the updater is backing up or installing");
    vm.runInContext("maintenanceActive = false", context);
    changeMode.click();
    assert.equal(cfg.mode, null);
    await vm.runInContext("promptInstallUpdate({version:'1.0.1'})", context);
    assert.deepEqual(events, ["stop", "backup", "install"], "an active Host is backed up even while its setup assistant is open");
    cfg.mode = "client"; events.length = 0;
    vm.runInContext("quitting = false", context);
    await vm.runInContext("promptInstallUpdate({version:'1.0.1'})", context);
    assert.deepEqual(events, ["install"]);
    assert.deepEqual(errors, []);
    cfg.mode = "host"; events.length = 0;
    vm.runInContext("quitting = false; hostHandle = fixtureHost; restartHostAfterMaintenance = async () => { hostHandle = fixtureHost; await fixtureRestart(); }", context);
    updater.quitAndInstall = () => { events.push("failed-install"); setImmediate(() => updater.emit("error", new Error("fixture asynchronous installer failure"))); };
    await vm.runInContext("promptInstallUpdate({version:'1.0.1'})", context);
    assert.deepEqual(events, ["stop", "backup", "failed-install", "restart"]);
    assert.equal(vm.runInContext("quitting || maintenanceActive", context), false);
    assert.match(errors.at(-1), /fixture asynchronous installer failure/);
    cfg.mode = "client"; cfg.remoteUrl = "http://127.0.0.1:3999"; events.length = 0;
    vm.runInContext("hostHandle = null; startClientVersionWatch(readConfig().remoteUrl)", context);
    const clientWatchesBeforeFailure = intervals.filter(timer => timer.ms === 10000).length;
    await vm.runInContext("promptInstallUpdate({version:'1.0.1'})", context);
    assert.deepEqual(events, ["failed-install"]);
    assert.equal(vm.runInContext("clientWatchTimer !== null", context), true);
    assert.equal(intervals.filter(timer => timer.ms === 10000).length, clientWatchesBeforeFailure + 1, "failed installation resumes the client's Host-version watch");
    // Follow the actual detection -> download event -> installation event flow.
    cfg.mode = "client"; events.length = 0;
    vm.runInContext("hostHandle = null", context);
    updater.checkForUpdates = async () => { updater.emit("update-available", { version: "1.0.2" }); return {}; };
    updater.downloadUpdate = async () => { prepareDownload("1.0.2"); events.push("download"); updater.emit("update-downloaded", { version: "1.0.2" }); };
    updater.quitAndInstall = () => { events.push("install"); app.emit("before-quit"); };
    const installed = new Promise(resolve => app.once("before-quit", resolve));
    await vm.runInContext("checkForUpdates(true)", context);
    await installed;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ["download", "install"]);
    assert.equal(dialogs.filter(row => row.title === "Actualización disponible").length, 1);
    assert.equal(status.some(row => row.phase === "update-available" && row.updateVersion === "1.0.2"), true);
    assert.equal(status.some(row => row.phase === "update-downloaded" && row.updateVersion === "1.0.2"), true);
    // A cleaned cache must fail before stopping the Host and allow another
    // normal check/download rather than remaining stuck on a downloaded notice.
    cfg.mode = "host"; events.length = 0;
    vm.runInContext("quitting = false; hostHandle = fixtureHost", context);
    fs.unlinkSync(downloadFile);
    await vm.runInContext("promptInstallUpdate({version:'1.0.2'})", context);
    assert.deepEqual(events, [], "missing cache is rejected before Host shutdown");
    assert.equal(cacheClears, 1);
    assert.equal(vm.runInContext("updateDownloadedInfo", context), null);
    cfg.mode = "client";
    vm.runInContext("hostHandle = null", context);
    const downloadedAgain = new Promise(resolve => app.once("before-quit", resolve));
    await vm.runInContext("checkForUpdates(true)", context);
    await downloadedAgain;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ["download", "install"], "a missing cache can be downloaded again in the same session");
    cfg.mode = "host"; events.length = 0;
    vm.runInContext("quitting = false; hostHandle = fixtureHost", context);
    prepareDownload("1.0.3");
    removeCacheAfterBackup = true;
    await vm.runInContext("promptInstallUpdate({version:'1.0.3'})", context);
    removeCacheAfterBackup = false;
    assert.deepEqual(events, ["stop", "backup", "restart"], "cache loss during backup blocks the installer and resumes the Host");
    assert.equal(cacheClears, 2);
    assert.equal(vm.runInContext("quitting || maintenanceActive", context), false);
    assert.equal(handlers.has("desktop:choose-data-directory"), true);
    console.log("desktop main fixture: shared window.open/navigation/IPC OAuth policy; update preferences/progress, Host backup, maintenance guards, installation failure recovery and client watch passed");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
