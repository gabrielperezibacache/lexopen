/** Electron main integration in a fake process; no GUI, network, updater or real data is used. */
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const { EventEmitter } = require("node:events");
const realConfig = require("./config.cjs"), realBackup = require("./backup.cjs");
async function main() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-main-updater-")));
  const dataDir = path.join(tmp, "data");
  fs.mkdirSync(path.join(dataDir, "pgdata"), { recursive: true }); fs.mkdirSync(path.join(dataDir, "storage"));
  fs.writeFileSync(path.join(dataDir, "pgdata", "PG_VERSION"), "17"); fs.writeFileSync(path.join(dataDir, "storage", "fixture.txt"), "fake preserved content");
  fs.writeFileSync(path.join(dataDir, ".env"), `STORAGE_PATH=${path.join(dataDir, "storage")}\n`);
  const cfg = { ...realConfig.DEFAULTS, dataDir, hostDataDir: dataDir, mode: null };
  const events = [], intervals = [], status = [], dialogs = [], handlers = new Map();
  const updater = new EventEmitter(); let checks = 0;
  Object.assign(updater, { verifyUpdateCodeSignature: false, checkForUpdates: async () => { checks++; return {}; }, quitAndInstall: () => events.push("install") });
  const app = new EventEmitter(); Object.assign(app, { isPackaged: true, whenReady: () => Promise.resolve(), getPath: () => tmp, getAppPath: () => path.join(tmp, "app"), quit() {}, exit() {} });
  let window;
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = new EventEmitter(); Object.assign(this.webContents, { setWindowOpenHandler() {}, send: (_name, value) => status.push(value), getURL: () => "file:///fixture/setup.html" }); window = this; }
    isDestroyed() { return false; }
    loadFile() { return Promise.resolve(); }
    setProgressBar(value) { this.progress = value; }
    static getAllWindows() { return window ? [window] : []; }
  }
  const sandbox = { console, __dirname, process: { env: { LEXOPEN_APP_VERSION: "0.0.1-untrusted" }, resourcesPath: path.join(tmp, "resources"), platform: "linux", pid: process.pid }, URL, Date, AbortSignal,
    setTimeout: () => ({ unref() {} }), setInterval: (callback, ms) => { intervals.push({ callback, ms }); return { unref() {} }; }, clearInterval() {},
    fixtureHost: { stop: async () => events.push("stop") },
    require: name => {
      if (name === "electron") return { app, BrowserWindow: Window, ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, shell: { openPath() {}, openExternal() {} }, Menu: { buildFromTemplate: value => value, setApplicationMenu() {} }, dialog: { showMessageBox: async options => { dialogs.push(options); return { response: 0 }; }, showErrorBox: (_title, message) => { throw new Error(message); } } };
      if (name === "electron-updater") return { autoUpdater: updater };
      if (name === "./config.cjs") return { ...realConfig, readConfig: () => ({ ...cfg }), writeConfig: value => Object.assign(cfg, value), readPackageVersion: () => "1.0.0", readAppState: () => ({}) };
      if (name === "./backup.cjs") return { ...realBackup, createDataBackup: async (...args) => { events.push("backup"); return realBackup.createDataBackup(...args); } };
      if (name === "./media-permissions.cjs") return { attachMicrophoneGuards() {} };
      return require(name);
    },
  };
  try {
    const context = vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8"), context, { filename: "main.cjs" });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(vm.runInContext("bundledVersion()", context), "1.0.0", "packaged identity ignores untrusted environment overrides");
    assert.equal(updater.verifyUpdateCodeSignature, true);
    assert.equal(updater.allowDowngrade, false);
    assert.equal(intervals.some(timer => timer.ms === 6 * 60 * 60 * 1000), true);
    await vm.runInContext("checkForUpdates(true)", context); assert.equal(checks, 1);
    cfg.updateChecks = false;
    await vm.runInContext("checkForUpdates(false)", context); assert.equal(checks, 1);
    updater.emit("download-progress", { percent: 42.5 });
    assert.equal(window.progress, 0.425); assert.equal(status.at(-1).progress, 42.5);
    cfg.mode = "host";
    vm.runInContext("hostHandle = fixtureHost", context);
    await vm.runInContext("promptInstallUpdate({version:'1.0.1'})", context);
    assert.deepEqual(events, ["stop", "backup", "install"]);
    const backupRoot = realBackup.defaultBackupDirectory(dataDir);
    assert.equal(fs.readdirSync(backupRoot).length, 1);
    assert.equal(dialogs.some(row => /respaldo consistente/.test(row.detail || "")), true);
    cfg.mode = "client"; events.length = 0;
    vm.runInContext("quitting = false", context);
    await vm.runInContext("promptInstallUpdate({version:'1.0.1'})", context);
    assert.deepEqual(events, ["install"]);
    assert.equal(handlers.has("desktop:choose-data-directory"), true);
    console.log("desktop main fixture: periodic preference/progress/package identity/Host stop+verified backup/client install passed");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
