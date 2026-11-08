const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RELEASES_URL = "https://github.com/gabrielperezibacache/lexopen/releases";

async function verifyBackupContents(source, destination) {
  const fs = require("node:fs"), path = require("node:path"), { createHash } = require("node:crypto");
  const hash = file => new Promise((resolve, reject) => {
    const digest = createHash("sha256"), stream = fs.createReadStream(file);
    stream.on("data", chunk => digest.update(chunk)); stream.on("error", reject); stream.on("end", () => resolve(digest.digest("hex")));
  });
  let files = 0;
  async function compare(relative) {
    const original = path.join(source, relative), copied = path.join(destination, relative), stat = await fs.promises.lstat(original);
    if (stat.isSymbolicLink() || !stat.isFile() && !stat.isDirectory()) throw new Error("El respaldo no admite enlaces ni archivos especiales. No se instaló la actualización.");
    const target = await fs.promises.lstat(copied);
    if (target.isSymbolicLink() || stat.isDirectory() !== target.isDirectory() || stat.isFile() !== target.isFile()) throw new Error("El respaldo no coincide con los datos del Host.");
    if (stat.isDirectory()) {
      for (const name of await fs.promises.readdir(original)) await compare(path.join(relative, name));
    } else {
      if (stat.size !== target.size || await hash(original) !== await hash(copied)) throw new Error("La comprobación de integridad del respaldo falló. No se instaló la actualización.");
      files++;
    }
  }
  await compare("");
  return { verifiedFiles: files, verifiedAt: new Date().toISOString() };
}

async function diagnoseOptionalTools({ env = process.env, execute } = {}) {
  const { execFile } = require("node:child_process");
  const run = execute || ((file, args, options) => new Promise((resolve, reject) => execFile(file, args, options, (error, stdout, stderr) => error ? reject(error) : resolve(`${stdout}\n${stderr}`))));
  // Version checks receive no database, model, account or session credentials.
  const safeEnv = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "TMP", "TEMP", "LANG"].filter(key => env[key]).map(key => [key, env[key]]));
  const tools = [
    { id: "pdf", name: "Páginas PDF (Poppler)", command: env.OCR_PDFTOPPM_BIN || "pdftoppm", args: ["-v"], pattern: /pdftoppm version\s+([\w.+-]+)/i, help: "Instale una versión compatible de Poppler y configure OCR_PDFTOPPM_BIN si no se encuentra." },
    { id: "ocr", name: "OCR (Tesseract)", command: env.OCR_TESSERACT_BIN || "tesseract", args: ["--version"], pattern: /tesseract\s+([\w.+-]+)/i, help: "Instale Tesseract y el idioma español; configure OCR_TESSERACT_BIN cuando corresponda." },
    { id: "codex", name: "Codex personal (opcional)", command: env.CODEX_BIN || "codex", args: ["--version"], pattern: /codex(?:-cli)?\s+([\w.+-]+)/i, help: "Prepare Codex CLI compatible con app-server y configure CODEX_BIN. La cuenta se conecta expresamente desde Mi cuenta." },
  ];
  return Promise.all(tools.map(async tool => {
    try {
      const output = String(await run(tool.command, tool.args, { timeout: 3000, maxBuffer: 32768, windowsHide: true, shell: false, env: safeEnv }));
      const version = tool.pattern.exec(output)?.[1] || null;
      return { id: tool.id, name: tool.name, status: version ? "detected" : "unverified", version, message: version ? `Versión detectada: ${version}; la función aún requiere su prueba específica.` : "El ejecutable respondió, pero no se pudo comprobar su versión.", help: tool.help };
    } catch (error) { return { id: tool.id, name: tool.name, status: error.code === "ENOENT" ? "missing" : "unverified", version: null, message: error.code === "ENOENT" ? "No se encontró la herramienta." : "No se pudo comprobar la herramienta dentro del tiempo permitido.", help: tool.help }; }
  }));
}

function updatePreferences(config = {}) {
  return { enabled: config.updateChecks !== false, channel: config.updateChannel === "preview" ? "preview" : "stable" };
}

function applyUpdaterPolicy(updater, config) {
  const { channel } = updatePreferences(config);
  // electron-updater's channel setter enables downgrades; reset it afterwards.
  updater.channel = channel === "preview" ? "preview" : "latest";
  updater.allowPrerelease = channel === "preview";
  updater.allowDowngrade = false;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  // NsisUpdater exposes verifyUpdateCodeSignature as a verifier function, not
  // the boolean electron-builder option. Keep its built-in verifier intact.
}

function versionParts(raw) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(raw || ""));
  if (!match) throw new Error("La versión de la actualización no pudo comprobarse.");
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split(".") || [] };
}

function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] < b.core[i] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return Number(x) < Number(y) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

function assertUpdateVersion(current, candidate, channel, { allowEqual = false } = {}) {
  const parsed = versionParts(candidate), compared = compareVersions(candidate, current);
  if (compared < 0 || !allowEqual && compared === 0) throw new Error("Se bloqueó una actualización que no es posterior a la versión instalada.");
  if (channel !== "preview" && parsed.pre.length) throw new Error("Esta versión es de prueba. Elija el canal Vista previa para recibirla.");
}

function friendlyUpdateError(error) {
  const detail = String(error?.message || error || "");
  if (/signature|codesign|code sign|signed|firma|ERR_UPDATER_INVALID_SIGNATURE/i.test(detail)) {
    return "No se pudo verificar la firma de esta instalación o actualización. En macOS el actualizador requiere una app firmada. Use un instalador verificado desde Descargas; no se desactivó la verificación.";
  }
  if (/sha512|checksum|hash mismatch|ERR_UPDATER_CHECKSUM/i.test(detail)) return "La descarga no superó la comprobación de integridad. Se conservó la instalación actual; vuelva a descargar desde el canal oficial.";
  if (/ENOENT|latest.*ya?ml|404|No published versions|No releases/i.test(detail)) return "El canal aún no tiene una actualización compatible publicada. Puede consultar los instaladores disponibles en Descargas.";
  if (isTransientUpdateError(error)) return "No se pudo contactar con el canal de actualizaciones después de los reintentos. Su instalación sigue disponible; puede volver a comprobarlo más tarde.";
  return "No se pudo completar la actualización. Se conservan los datos; consulte Versión y estado o Descargas para continuar de forma manual.";
}

function isTransientUpdateError(error) {
  const status = Number(error?.statusCode ?? error?.status);
  if (status === 429 || status >= 500 && status <= 599) return true;
  return /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ERR_NETWORK|ERR_INTERNET_DISCONNECTED|timed? ?out|HTTP\s*(?:429|5\d\d)|status(?: code)?\s*[:=]?\s*(?:429|5\d\d)/i.test(String(error?.code || "") + " " + String(error?.message || error || ""));
}

async function withNetworkRetry(run, { attempts = 3, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onRetry = () => {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) {
      if (!isTransientUpdateError(error) || attempt + 1 >= attempts) throw error;
      const delay = [1000, 3000][Math.min(attempt, 1)];
      onRetry(attempt + 1, delay);
      await sleep(delay);
    }
  }
}

async function verifyDownloadedUpdate(updater, version, prepared) {
  const fs = require("node:fs"), path = require("node:path"), { createHash } = require("node:crypto");
  const invalid = cause => Object.assign(new Error("La descarga de actualización ya no está disponible o cambió. Se conservó la instalación actual; busque la actualización para descargarla otra vez.", { cause }), { code: "ERR_UPDATER_CACHE_INVALID" });
  const helper = updater.downloadedUpdateHelper;
  const info = helper?.fileInfo?.info;
  const expected = prepared || Object.freeze({ file: helper?.file, size: info?.size, sha512: info?.sha512, version });
  if (typeof expected.file !== "string" || !path.isAbsolute(expected.file) || expected.version !== version ||
    helper?.versionInfo?.version !== version || helper?.file !== expected.file ||
    !Number.isSafeInteger(expected.size) || expected.size <= 0 || info?.size !== expected.size ||
    typeof expected.sha512 !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(expected.sha512) ||
    info?.sha512 !== expected.sha512 || helper?.downloadedFileInfo?.sha512 !== expected.sha512) throw invalid();
  let handle;
  try {
    const before = await fs.promises.lstat(expected.file);
    if (!before.isFile() || before.isSymbolicLink() || before.size !== expected.size) throw invalid();
    handle = await fs.promises.open(expected.file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== expected.size || opened.ino !== before.ino || opened.dev !== before.dev) throw invalid();
    const hash = createHash("sha512");
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    if (hash.digest("base64") !== expected.sha512 || after.size !== expected.size || after.mtimeMs !== opened.mtimeMs) throw invalid();
    return expected;
  } catch (error) {
    throw error?.code === "ERR_UPDATER_CACHE_INVALID" ? error : invalid(error);
  } finally { await handle?.close(); }
}

function quitAndInstallUpdate(updater, app, { nativeUpdater, timeoutMs = 10 * 60 * 1000 } = {}) {
  // electron-updater reports installer failures through "error", including
  // synchronous failures that quitAndInstall catches internally. Wait until
  // Electron actually starts quitting so the caller can resume a stopped Host.
  return new Promise((resolve, reject) => {
    let timer;
    // electron-updater 6.8.x MacUpdater adds its install callback synchronously
    // in quitAndInstall(). Snapshot that call only; retain permanent native
    // listeners, including MacUpdater's downloaded-state listener.
    const priorNativeListeners = new Set(nativeUpdater?.rawListeners("update-downloaded") || []);
    const addedNativeListeners = () => nativeUpdater?.rawListeners("update-downloaded").filter(listener => !priorNativeListeners.has(listener)) || [];
    let installListeners;
    const cleanup = () => {
      clearTimeout(timer);
      updater.removeListener("error", failed);
      app.removeListener("before-quit", quitting);
      // MacUpdater uses on(), so a native error otherwise leaves an install
      // callback armed. A later download must not install after Host recovery.
      for (const listener of installListeners || addedNativeListeners()) nativeUpdater.removeListener("update-downloaded", listener);
    };
    const failed = error => { cleanup(); reject(error); };
    const quitting = () => { cleanup(); resolve(); };
    updater.once("error", failed);
    app.once("before-quit", quitting);
    timer = setTimeout(() => failed(Object.assign(new Error("La instalación no confirmó el reinicio dentro del tiempo previsto. Se canceló el intento; puede volver a intentarlo."), { code: "ERR_UPDATER_INSTALL_TIMEOUT" })), timeoutMs);
    try {
      updater.quitAndInstall(false, true);
      installListeners = addedNativeListeners();
    }
    catch (error) { failed(error); }
  });
}

async function installPreparedUpdate({ mode, stopHost, backupHost, install, restartHost, status = () => {} }) {
  let stopped = false;
  try {
    if (mode === "host") {
      status("stopping-host");
      await stopHost();
      stopped = true;
      status("backing-up");
      const backup = await backupHost();
      if (backup?.type !== "lexopen-host-data" || !backup.includes?.includes("pgdata") || !backup.includes?.includes("storage")) {
        throw new Error("No se pudo comprobar un respaldo consistente del Host. No se instaló la actualización.");
      }
    }
    status("installing-update");
    await install();
  } catch (error) {
    if (stopped) {
      try { await restartHost(); }
      catch (restartError) {
        throw Object.assign(new AggregateError([error, restartError], "La actualización falló y no se pudo reanudar el Host. Conserve el respaldo y vuelva a iniciar el Host antes de intentar otra actualización.", { cause: error }), { code: "ERR_UPDATER_HOST_RECOVERY_FAILED" });
      }
    }
    throw error;
  }
}

module.exports = { CHECK_INTERVAL_MS, RELEASES_URL, updatePreferences, applyUpdaterPolicy, compareVersions, assertUpdateVersion, friendlyUpdateError, isTransientUpdateError, withNetworkRetry, verifyDownloadedUpdate, quitAndInstallUpdate, installPreparedUpdate, verifyBackupContents, diagnoseOptionalTools };
