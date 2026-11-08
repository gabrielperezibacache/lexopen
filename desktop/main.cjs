/**
 * LexOpen Desktop — Electron shell.
 * mode=host → Postgres embebido + Next; mode=client → BrowserWindow a URL Tailscale.
 */
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");
const {
  readConfig,
  writeConfig,
  normalizeRemoteUrl,
  localAppUrl,
  activeDataDir,
  validateExistingDataDirectory,
  parseEnvFile,
  readPackageVersion,
  readAppState,
} = require("./config.cjs");
const {
  createDataBackup,
  finalizeRestore,
  restoreDataDirectory,
  rollbackRestore,
  defaultBackupDirectory,
  validateBackupDirectory,
} = require("./backup.cjs");
const { isAllowedAppUrl, isAllowedExternalUrl } = require("./external-url.cjs");
const { pathToFileURL } = require("node:url");
const { prepareDesktopToolpack } = require("./altazor-toolpack.cjs");
const { attachMicrophoneGuards } = require("./media-permissions.cjs");
const { CHECK_INTERVAL_MS, RELEASES_URL, updatePreferences, applyUpdaterPolicy, assertUpdateVersion, friendlyUpdateError, withNetworkRetry, installPreparedUpdate, verifyBackupContents, diagnoseOptionalTools } = require("./update-policy.cjs");

let mainWindow = null;
let currentDesktopAppUrl = "";
let hostHandle = null;
let lastStatus = { phase: "idle", message: "Iniciando…" };
let lastRemoteVersion = null;
let shuttingDown = false;
let updaterConfigured = false;
let updaterCheckPromise = null;
let interactiveUpdateCheck = false;
let updateDownloadedInfo = null;
let updatePromptActive = false;
let clientWatchTimer = null;
let booting = false;
let quitting = false;
let updateCheckTimer = null;
let pendingDataDirectory = null;
let maintenanceActive = false;
let desktopPreparation = null;
let desktopPreparationTask = null;
let desktopPreparationAbort = null;

const desktopPreparationMessages = {
  "engine-missing": "Instala Docker en el equipo principal y vuelve a intentar. Puedes seguir usando LexOpen.",
  "engine-unavailable": "Abre Docker en el equipo principal y vuelve a intentar.",
  "linux-engine-required": "Cambia Docker al modo de contenedores Linux y vuelve a intentar.",
  "engine-architecture-unsupported": "Esta arquitectura del motor de Docker aún no es compatible con el escritorio.",
  "profile-detected": "Herramientas listas. Vincula tu escritorio dedicado desde Mi asistente.",
  "package-unavailable": "Esta versión todavía no ofrece herramientas para este equipo. Consulta la guía de preparación.",
  "package-check-failed": "No pudimos comprobar el paquete oficial. Revisa tu conexión y vuelve a intentar.",
  "package-cancelled": "Preparación interrumpida. Puedes volver a intentar.",
  "package-checking": "Comprobando Docker y las herramientas de Altazor…",
  "package-downloading": "Descargando herramientas verificadas…",
  "package-loading": "Instalando las herramientas de Altazor…",
  "package-mismatch": "El paquete descargado no coincide con la versión oficial. Vuelve a intentar.",
  "package-download-failed": "No pudimos descargar el paquete. Revisa tu conexión y el espacio disponible.",
  "package-read-failed": "No pudimos preparar el archivo. Revisa el espacio disponible.",
  "package-load-unconfirmed": "Docker no confirmó la instalación. Abre Docker y vuelve a intentar.",
  "package-loaded": "Herramientas instaladas. Vincula tu escritorio dedicado desde Mi asistente.",
  "source-mismatch": "No pudimos verificar los archivos de preparación de este instalador. Reinstala LexOpen desde la publicación oficial.",
  "source-building": "Preparando las herramientas en Docker. Puedes seguir usando LexOpen mientras termina.",
  "source-build-failed": "Docker no terminó de preparar las herramientas. Revisa tu conexión y el espacio disponible y vuelve a intentar.",
  "unavailable": "La preparación del escritorio no está disponible en este momento.",
};
const desktopPreparationInProgress = new Set(["package-checking", "package-downloading", "package-loading", "source-building"]);

function hostDataDirectory() { return activeDataDir(readConfig()); }

function changeUpdatePreferences(partial) {
  if (updateDownloadedInfo || updaterCheckPromise || updatePromptActive) {
    void dialog.showMessageBox({ type: "info", message: "Termine la actualización pendiente antes de cambiar el canal." });
    return;
  }
  writeConfig(partial);
  configureAutoUpdater();
  buildMenu();
}

function bundledVersion() {
  const version = readPackageVersion(path.join(__dirname, "package.json"));
  return app.isPackaged ? version : process.env.LEXOPEN_APP_VERSION || version;
}

function sendStatus(partial) {
  lastStatus = { ...lastStatus, ...partial, at: new Date().toISOString() };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:status", lastStatus);
  }
}

function configureAutoUpdater() {
  if (!app.isPackaged) return;
  applyUpdaterPolicy(autoUpdater, readConfig());
  if (updaterConfigured) return;
  updaterConfigured = true;

  autoUpdater.on("checking-for-update", () => {
    sendStatus({ phase: "checking-update", message: "Buscando actualizaciones…" });
  });
  autoUpdater.on("update-available", (info) => {
    try { assertUpdateVersion(bundledVersion(), info.version, updatePreferences(readConfig()).channel); }
    catch (error) { sendStatus({ phase: "update-error", message: error.message }); return; }
    sendStatus({
      phase: "update-available",
      message: `Actualización v${info.version} disponible`,
      updateVersion: info.version,
    });
    void promptDownloadUpdate(info);
  });
  autoUpdater.on("update-not-available", () => {
    sendStatus({ phase: "ready", message: "LexOpen está actualizado." });
    if (interactiveUpdateCheck) {
      void dialog.showMessageBox({
        type: "info",
        title: "LexOpen",
        message: "No hay actualizaciones disponibles.",
      });
    }
    interactiveUpdateCheck = false;
  });
  autoUpdater.on("update-downloaded", (info) => {
    try { assertUpdateVersion(bundledVersion(), info.version, updatePreferences(readConfig()).channel); }
    catch (error) { sendStatus({ phase: "update-error", message: error.message }); return; }
    updateDownloadedInfo = info;
    sendStatus({
      phase: "update-downloaded",
      message: `Actualización v${info.version} lista para instalar`,
      updateVersion: info.version,
    });
    void promptInstallUpdate(info);
  });
  autoUpdater.on("error", (error) => {
    const message = friendlyUpdateError(error);
    sendStatus({ phase: "update-error", message });
  });
  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(percent / 100);
    sendStatus({ phase: "downloading-update", message: `Descargando actualización: ${Math.round(percent)} %`, progress: percent });
  });
}

async function checkForUpdates(interactive = false) {
  if (quitting || shuttingDown || !interactive && !updatePreferences(readConfig()).enabled) return null;
  if (updateDownloadedInfo) { if (interactive) await promptInstallUpdate(updateDownloadedInfo); return null; }
  if (!app.isPackaged) {
    if (interactive) {
      await dialog.showMessageBox({
        type: "info",
        title: "LexOpen",
        message: "En el clon del repo actualice con git pull origin main && npm ci.",
      });
    }
    return null;
  }
  configureAutoUpdater();
  if (updaterCheckPromise) return updaterCheckPromise;
  interactiveUpdateCheck = interactive;
  updaterCheckPromise = withNetworkRetry(() => autoUpdater.checkForUpdates(), {
    onRetry: () => sendStatus({ phase: "checking-update", message: "La conexión falló; volviendo a comprobar el canal…" }),
  })
    .catch((error) => {
      const message = friendlyUpdateError(error);
      sendStatus({ phase: "update-error", message });
      if (interactive) {
        dialog.showErrorBox("Actualizaciones", message);
      }
      interactiveUpdateCheck = false;
      return null;
    })
    .finally(() => {
      updaterCheckPromise = null;
      interactiveUpdateCheck = false;
    });
  return updaterCheckPromise;
}

async function promptDownloadUpdate(info) {
  if (updatePromptActive || updateDownloadedInfo) return;
  updatePromptActive = true;
  try {
    const result = await dialog.showMessageBox({
      type: "info",
      title: "Actualización disponible",
      message: `LexOpen ${info.version} está disponible.`,
      detail:
        "La descarga no detendrá el Host. La instalación requerirá cerrar LexOpen y conservará sus datos.",
      buttons: ["Descargar", "Más tarde"],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) {
      sendStatus({ phase: "downloading-update", message: "Descargando actualización…" });
      await withNetworkRetry(() => autoUpdater.downloadUpdate(), { onRetry: () => sendStatus({ phase: "downloading-update", message: "Se interrumpió la descarga; reintentando…" }) });
    }
  } catch (error) {
    const message = friendlyUpdateError(error);
    dialog.showErrorBox("Actualizaciones", message);
  } finally {
    updatePromptActive = false;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
    if (updateDownloadedInfo && !quitting) void promptInstallUpdate(updateDownloadedInfo);
  }
}

async function promptInstallUpdate(info) {
  if (updatePromptActive) return;
  updatePromptActive = true;
  let ownsMaintenance = false;
  try {
    const result = await dialog.showMessageBox({
      type: "info",
      title: "Actualización descargada",
      message: `LexOpen ${info.version} está lista.`,
      detail:
        "En modo Host se detendrá el servidor y se comprobará un respaldo consistente antes de instalar. Guarde su trabajo y detenga las grabaciones; sus clientes perderán conexión durante el reinicio.",
      buttons: ["Reiniciar e instalar", "Más tarde"],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) {
      if (maintenanceActive) throw new Error("Ya hay un respaldo o una operación de mantenimiento en curso.");
      maintenanceActive = true;
      ownsMaintenance = true;
      assertUpdateVersion(bundledVersion(), info.version, updatePreferences(readConfig()).channel);
      const cfg = readConfig();
      await installPreparedUpdate({
        mode: cfg.mode,
        stopHost: async () => { if (!hostHandle) throw new Error("Inicie el Host antes de preparar el respaldo de actualización."); await stopHostForMaintenance(); },
        backupHost: async () => {
          const dataDir = hostDataDirectory();
          validateExistingDataDirectory(dataDir);
          const destination = path.join(defaultBackupDirectory(dataDir), `pre-update-${Date.now()}-${require("node:crypto").randomUUID()}`);
          await createDataBackup(dataDir, destination, { appVersion: bundledVersion(), backupMode: "pre-update" });
          const checked = await validateBackupDirectory(destination);
          await verifyBackupContents(dataDir, destination);
          sendStatus({ backupCreated: true, message: "Respaldo comprobado. Preparando la instalación…" });
          return checked.manifest;
        },
        install: async () => {
          if (clientWatchTimer) clearInterval(clientWatchTimer);
          desktopPreparationAbort?.abort();
          await desktopPreparationTask;
          quitting = true;
          try { autoUpdater.quitAndInstall(false, true); }
          catch (error) { quitting = false; throw error; }
        },
        restartHost: () => restartHostAfterMaintenance(cfg),
        status: phase => sendStatus({ phase, message: phase === "backing-up" ? "Creando y comprobando el respaldo del Host…" : "Preparando actualización…" }),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Actualizaciones", message);
  } finally {
    updatePromptActive = false;
    if (ownsMaintenance) maintenanceActive = false;
  }
}

function collectDesktopAppUrls() {
  const cfg = readConfig();
  return [
    hostHandle?.url,
    hostHandle?.publicUrl,
    cfg.publicUrl,
    cfg.remoteUrl,
    localAppUrl(cfg.port || 3000),
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean);
}

function isAllowedDesktopNavigation(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      const rendererRoot = path.resolve(__dirname, "renderer");
      let filePath = decodeURIComponent(parsed.pathname);
      if (process.platform === "win32" && /^\/[A-Za-z]:/.test(filePath)) {
        filePath = filePath.slice(1);
      }
      const resolved = path.resolve(filePath);
      return (
        resolved === rendererRoot ||
        resolved.startsWith(rendererRoot + path.sep)
      );
    }
    return isAllowedAppUrl(url, collectDesktopAppUrls());
  } catch {
    return false;
  }
}

function isAllowedDesktopExternalUrl(url) {
  return isAllowedExternalUrl(url, {
    appUrls: collectDesktopAppUrls(),
    extraHosts: ["github.com", "www.github.com", "render.com", "docs.render.com"],
  });
}

function attachWindowGuards(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedDesktopExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isAllowedDesktopNavigation(url)) return;
    event.preventDefault();
    if (isAllowedDesktopExternalUrl(url)) void shell.openExternal(url);
  });
}

function ensureWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "LexOpen",
    backgroundColor: "#f7f2e8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  attachWindowGuards(mainWindow);
  attachMicrophoneGuards(mainWindow, () => currentDesktopAppUrl);
  mainWindow.on("closed", () => {
    mainWindow = null;
    currentDesktopAppUrl = "";
  });
  return mainWindow;
}

function rendererPath(...parts) {
  return path.join(__dirname, "renderer", ...parts);
}

function setupShellPath() {
  return path.join(app.getPath("temp"), "lexopen-desktop", "setup.html");
}

function fromSetupShell(event) {
  const contents = mainWindow?.webContents;
  return contents && event.sender === contents && event.senderFrame === contents.mainFrame &&
    event.senderFrame?.url === pathToFileURL(setupShellPath()).href;
}

function publishDesktopPreparation(progress) {
  const { state, percent } = progress;
  const message = desktopPreparationMessages[state] || desktopPreparationMessages.unavailable;
  desktopPreparation = { state, message: Number.isInteger(percent) ? `${message} ${percent} %` : message, busy: desktopPreparationInProgress.has(state) };
  const contents = mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents;
  if (contents && fromSetupShell({ sender: contents, senderFrame: contents.mainFrame })) contents.send("desktop:altazor-preparation", desktopPreparation);
}

function startDesktopPreparation(retry = false) {
  if (desktopPreparationTask || (desktopPreparation && !retry)) return desktopPreparation;
  const controller = new AbortController();
  desktopPreparationAbort = controller;
  desktopPreparationTask = prepareDesktopToolpack(bundledVersion(), {
    resourceRoot: process.resourcesPath,
    progress: publishDesktopPreparation,
    signal: controller.signal,
  }).then(result => publishDesktopPreparation(controller.signal.aborted ? { state: "package-cancelled" } : result))
    .catch(() => publishDesktopPreparation({ state: controller.signal.aborted ? "package-cancelled" : "unavailable" }))
    .finally(() => { desktopPreparationTask = null; desktopPreparationAbort = null; });
  return desktopPreparation;
}

/**
 * Packaged Chromium treats each file:// URL as its own origin, so CSP `'self'`
 * blocks sibling setup.css / setup.js inside the asar (macOS installers show
 * a white page of unstyled HTML). Inline both and the packaged mark before loading.
 */
async function loadSetupShell(win) {
  currentDesktopAppUrl = "";
  const css = fs.readFileSync(rendererPath("setup.css"), "utf8");
  const js = fs.readFileSync(rendererPath("setup.js"), "utf8");
  const brand = fs.readFileSync(rendererPath("lexopen-brand.png")).toString("base64");
  const html = fs
    .readFileSync(rendererPath("setup.html"), "utf8")
    .replace("<!--SETUP_BRAND-->", `data:image/png;base64,${brand}`)
    .replace("<!--SETUP_CSS-->", `<style>\n${css}\n</style>`)
    .replace("<!--SETUP_JS-->", `<script>\n${js}\n</script>`);
  if (!html.includes("<style>") || !html.includes("<script>")) {
    throw new Error("No se pudieron incrustar los estilos del asistente.");
  }
  const tmp = setupShellPath();
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, html, "utf8");
  await win.loadFile(tmp);
}

function showSetup() {
  const win = ensureWindow();
  void loadSetupShell(win).catch((error) => {
    console.error("[lexopen-desktop] No se pudo cargar el asistente", error);
  });
}

async function probeRemote(url) {
  const base = normalizeRemoteUrl(url);
  if (!base) return { ok: false, error: "URL vacía" };
  try {
    const res = await fetch(`${base}/api/health`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
      redirect: "error",
    });
    const body = await res.json().catch(() => ({}));
    // 503 con version = Host vivo (p. ej. DB momentánea); sigue sirviendo updates
    if (!res.ok && !body.version && body.ok !== true) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return {
      ok: true,
      url: base,
      version: body.version || null,
      updateRecognized: Boolean(body.updateRecognized),
      degraded: !res.ok,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Sin conexión",
    };
  }
}

function loadAppUrl(url, version) {
  const win = ensureWindow();
  currentDesktopAppUrl = url;
  const v = version || bundledVersion();
  const sep = url.includes("?") ? "&" : "?";
  win.loadURL(`${url}${sep}lexopen_v=${encodeURIComponent(v)}`);
}

async function setOneTimeHostCookie(baseUrl, name, value) {
  const win = ensureWindow();
  const secure = String(baseUrl).startsWith("https://");
  await win.webContents.session.cookies.set({
    url: baseUrl,
    name,
    value,
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "strict",
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60,
  });
}

async function stopHostIfRunning() {
  if (!hostHandle?.stop) return;
  try {
    await hostHandle.stop();
  } catch {
    /* ignore */
  }
  hostHandle = null;
}

async function startHostMode(cfg) {
  await stopHostIfRunning();
  sendStatus({ phase: "starting-host", message: "Arrancando servidor local…" });
  const { startHost } = await import("./host-runtime.mjs");
  hostHandle = await startHost({
    dataDir: hostDataDirectory(),
    port: cfg.port,
    pgPort: cfg.pgPort,
    publicUrl: cfg.publicUrl,
  });
  // Setup token goes into an httpOnly cookie — never the address bar / status IPC.
  if (hostHandle.needsSetup && hostHandle.bootstrapToken) {
    await setOneTimeHostCookie(
      hostHandle.url,
      "lexopen_setup_token",
      hostHandle.bootstrapToken
    );
  }
  const targetUrl = hostHandle.needsSetup
    ? `${hostHandle.url}/setup`
    : hostHandle.url;
  const msg = hostHandle.needsSetup
    ? "Configuración inicial requerida"
    : hostHandle.updateRecognized
    ? `Actualización v${hostHandle.previousVersion} → v${hostHandle.version} reconocida · datos intactos`
    : `Servidor listo · v${hostHandle.version}`;
  sendStatus({
    phase: hostHandle.needsSetup ? "setup" : "ready",
    message: msg,
    url: hostHandle.url,
    setupPending: Boolean(hostHandle.needsSetup),
    publicUrl: hostHandle.publicUrl,
    version: hostHandle.version,
    updateRecognized: hostHandle.updateRecognized,
  });
  return targetUrl;
}

async function stopHostForMaintenance() {
  if (hostHandle?.stop) {
    await hostHandle.stop();
    hostHandle = null;
  }
}

async function restartHostAfterMaintenance(cfg) {
  const url = await startHostMode(cfg);
  loadAppUrl(url, hostHandle?.version);
  return url;
}

async function chooseDirectory(title, buttonLabel, defaultPath) {
  const result = await dialog.showOpenDialog({
    title,
    buttonLabel,
    defaultPath,
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0] || null;
}

async function createHostBackup() {
  if (maintenanceActive) return dialog.showErrorBox("LexOpen", "Hay otra operación de mantenimiento en curso.");
  if (!hostHandle) {
    dialog.showErrorBox("LexOpen", "El respaldo requiere un Host activo.");
    return;
  }
  const destination = await chooseDirectory(
    "Elegir destino del respaldo",
    "Crear respaldo aquí",
    path.join(
      path.dirname(hostDataDirectory()),
      `LexOpen-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
    )
  );
  if (!destination) return;
  if (maintenanceActive) return;
  maintenanceActive = true;

  const cfg = readConfig();
  try {
    await stopHostForMaintenance();
    const manifest = await createDataBackup(hostDataDirectory(), destination, {
      appVersion: bundledVersion(),
    });
    await restartHostAfterMaintenance(cfg);
    await dialog.showMessageBox({
      type: "info",
      title: "Respaldo creado",
      message: "El respaldo de LexOpen fue creado correctamente.",
      detail: `${manifest.includes.length} componentes respaldados en:\n${destination}\n\nContiene secretos y debe guardarse en un disco cifrado.`,
    });
  } catch (error) {
    try {
      await restartHostAfterMaintenance(cfg);
    } catch (restartError) {
      console.error("[lexopen-desktop] No se pudo reanudar el Host", restartError);
    }
    dialog.showErrorBox(
      "No se pudo crear el respaldo",
      error instanceof Error ? error.message : String(error)
    );
  } finally { maintenanceActive = false; }
}

async function restoreHostBackup() {
  if (maintenanceActive) return dialog.showErrorBox("LexOpen", "Hay otra operación de mantenimiento en curso.");
  if (!hostHandle) {
    dialog.showErrorBox("LexOpen", "La restauración requiere un Host activo.");
    return;
  }
  const backupDir = await chooseDirectory(
    "Elegir respaldo LexOpen",
    "Usar este respaldo",
    path.dirname(hostDataDirectory())
  );
  if (!backupDir) return;
  const confirmation = await dialog.showMessageBox({
    type: "warning",
    title: "Restaurar respaldo",
    message: "Esta operación reemplazará todos los datos actuales del Host.",
    detail:
      "El estado actual se conservará temporalmente para poder revertir si el arranque falla. Continúe solo si eligió un respaldo confiable.",
    buttons: ["Cancelar", "Restaurar"],
    defaultId: 0,
    cancelId: 0,
  });
  if (confirmation.response !== 1) return;
  if (maintenanceActive) return;
  maintenanceActive = true;

  const cfg = readConfig();
  let replacement = null;
  try {
    await stopHostForMaintenance();
    replacement = await restoreDataDirectory(hostDataDirectory(), backupDir);
    await restartHostAfterMaintenance(cfg);
    try {
      await finalizeRestore(replacement.rollback);
    } catch (cleanupError) {
      console.warn(
        "[lexopen-desktop] No se pudo eliminar el rollback anterior",
        cleanupError
      );
    }
    await dialog.showMessageBox({
      type: "info",
      title: "Restauración completada",
      message: "El Host fue restaurado y reiniciado correctamente.",
      detail: `Respaldo utilizado: ${backupDir}`,
    });
  } catch (error) {
    try {
      if (hostHandle?.stop) await stopHostForMaintenance();
      if (replacement) {
        await rollbackRestore(hostDataDirectory(), replacement.rollback);
      }
      await restartHostAfterMaintenance(cfg);
    } catch (rollbackError) {
      console.error("[lexopen-desktop] Falló la recuperación del estado anterior", rollbackError);
    }
    dialog.showErrorBox(
      "No se pudo restaurar el respaldo",
      error instanceof Error ? error.message : String(error)
    );
  } finally { maintenanceActive = false; }
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "LexOpen",
        submenu: [
          {
            label: "Cambiar modo (asistente)",
            click: () => {
              writeConfig({ mode: null });
              showSetup();
              sendStatus({
                phase: "setup",
                message: "Configure Host o Cliente",
              });
            },
          },
          {
            label: "Abrir carpeta de datos",
            click: () => shell.openPath(hostDataDirectory()),
          },
          {
            label: "Crear respaldo…",
            click: () => void createHostBackup(),
          },
          {
            label: "Restaurar respaldo…",
            click: () => void restoreHostBackup(),
          },
          {
            label: "Buscar actualizaciones…",
            click: () => void checkForUpdates(true),
          },
          {
            label: "Actualizaciones",
            submenu: [
              { label: "Comprobar automáticamente cada seis horas", type: "checkbox", checked: updatePreferences(readConfig()).enabled, click: item => changeUpdatePreferences({ updateChecks: item.checked }) },
              { label: "Canal estable", type: "radio", checked: updatePreferences(readConfig()).channel === "stable", click: () => changeUpdatePreferences({ updateChannel: "stable" }) },
              { label: "Canal Vista previa", type: "radio", checked: updatePreferences(readConfig()).channel === "preview", click: () => changeUpdatePreferences({ updateChannel: "preview" }) },
              { type: "separator" },
              { label: "Descargar instalador oficial…", click: () => void shell.openExternal(RELEASES_URL) },
            ],
          },
          {
            label: "Comprobar herramientas opcionales…",
            click: () => void (async () => {
              const envFile = path.join(hostDataDirectory(), ".env");
              const configured = fs.existsSync(envFile) ? parseEnvFile(fs.readFileSync(envFile, "utf8")).map : {};
              const results = await diagnoseOptionalTools({ env: { ...process.env, OCR_PDFTOPPM_BIN: configured.OCR_PDFTOPPM_BIN || process.env.OCR_PDFTOPPM_BIN, OCR_TESSERACT_BIN: configured.OCR_TESSERACT_BIN || process.env.OCR_TESSERACT_BIN, CODEX_BIN: configured.CODEX_BIN || process.env.CODEX_BIN } });
              await dialog.showMessageBox({ type: "info", title: "Herramientas opcionales", message: "Diagnóstico local; no se instaló ni actualizó ninguna herramienta.", detail: results.map(row => `${row.name}: ${row.message}\n${row.help}`).join("\n\n") + "\n\nChromium/OJV se comprueba desde la configuración PJUD del Host. El entorno aislado requiere su preparación expresa; no se instala Docker automáticamente." });
            })().catch(() => dialog.showErrorBox("Herramientas opcionales", "No se pudo completar el diagnóstico. Revise la configuración del Host.")),
          },
          {
            label: "Recuperar contraseña admin…",
            click: () => {
              if (!hostHandle?.recoveryToken) {
                dialog.showErrorBox(
                  "LexOpen",
                  "La recuperación local requiere un Host activo."
                );
                return;
              }
              void (async () => {
                await setOneTimeHostCookie(
                  hostHandle.url,
                  "lexopen_recovery_token",
                  hostHandle.recoveryToken
                );
                loadAppUrl(`${hostHandle.url}/recovery`, hostHandle.version);
              })();
            },
          },
          {
            label: "Versión y estado",
            click: () => {
              const state = readAppState(hostDataDirectory());
              dialog.showMessageBox({
                type: "info",
                title: "LexOpen",
                message: `Versión empaquetada: ${bundledVersion()}`,
                detail: [
                  `Última aplicada: ${state.lastAppVersion || "—"}`,
                  `Reconocida: ${state.updateRecognizedAt || "—"}`,
                  `Datos: ${hostDataDirectory()}`,
                  `Actualizaciones: ${updatePreferences(readConfig()).channel === "preview" ? "Vista previa" : "Estable"}`,
                  ...(desktopPreparation ? [`Escritorio de Altazor: ${desktopPreparation.message}`] : []),
                  lastStatus.message || "",
                  "Las actualizaciones no borran .env, pgdata ni storage.",
                ].join("\n"),
              });
            },
          },
          { type: "separator" },
          { role: "quit", label: "Salir" },
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
    ])
  );
}

function startClientVersionWatch(remoteUrl) {
  if (clientWatchTimer) clearInterval(clientWatchTimer);
  clientWatchTimer = setInterval(() => {
    void (async () => {
      const probe = await probeRemote(remoteUrl);
      if (!probe.ok || !probe.version) return;
      if (lastRemoteVersion && probe.version !== lastRemoteVersion) {
        lastRemoteVersion = probe.version;
        sendStatus({
          phase: "ready",
          message: `Host actualizado a v${probe.version} — recargando…`,
          url: probe.url,
          version: probe.version,
          updateRecognized: true,
        });
        loadAppUrl(probe.url, probe.version);
      } else if (!lastRemoteVersion) {
        lastRemoteVersion = probe.version;
      }
    })();
  }, 10000);
}

async function boot() {
  if (booting) return lastStatus;
  booting = true;
  try {
    buildMenu();
    const cfg = readConfig();
    ensureWindow();

    if (!cfg.mode) {
      showSetup();
      sendStatus({ phase: "setup", message: "Configure Host o Cliente" });
      return lastStatus;
    }

    if (cfg.mode === "client") {
      sendStatus({ phase: "probing", message: "Comprobando servidor remoto…" });
      const probe = await probeRemote(cfg.remoteUrl);
      if (!probe.ok) {
        sendStatus({
          phase: "error",
          message: `No se alcanza el servidor: ${probe.error}. ¿Tailscale conectado y el PC principal encendido?`,
        });
        showSetup();
        return lastStatus;
      }
      lastRemoteVersion = probe.version;
      sendStatus({
        phase: "ready",
        message: probe.version
          ? `Conectado · Host v${probe.version}`
          : "Conectado",
        url: probe.url,
        version: probe.version,
      });
      loadAppUrl(probe.url, probe.version);
      startClientVersionWatch(cfg.remoteUrl);
      return lastStatus;
    }

    try {
      if (app.isPackaged) startDesktopPreparation();
      const url = await startHostMode(cfg);
      loadAppUrl(url, hostHandle?.version);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendStatus({ phase: "error", message: msg });
      dialog.showErrorBox("LexOpen Host", msg);
      showSetup();
    }
    return lastStatus;
  } finally {
    booting = false;
  }
}

ipcMain.handle("desktop:get-state", async event => {
  const cfg = readConfig();
  return {
    config: cfg,
    status: lastStatus,
    dataDir: hostDataDirectory(),
    appState: readAppState(hostDataDirectory()),
    version: bundledVersion(),
    ...(event && fromSetupShell(event) ? { desktopPreparation } : {}),
  };
});

ipcMain.handle("desktop:prepare-altazor-desktop", async (event, retry) => {
  if (!fromSetupShell(event) || maintenanceActive || quitting) return { state: "unavailable", message: desktopPreparationMessages.unavailable };
  return startDesktopPreparation(retry === true);
});

ipcMain.handle("desktop:choose-data-directory", async event => {
  if (event.sender !== mainWindow?.webContents || !event.sender.getURL().startsWith("file:")) return { ok: false, error: "Abra el asistente de configuración para elegir una carpeta." };
  const result = await dialog.showOpenDialog(mainWindow, { title: "Elegir carpeta de datos existente", buttonLabel: "Usar esta carpeta", defaultPath: hostDataDirectory(), properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths[0]) return { ok: true, cancelled: true };
  try {
    const dataDir = validateExistingDataDirectory(result.filePaths[0], { installRoots: [app.getAppPath(), process.resourcesPath].filter(Boolean), currentDataDir: hostDataDirectory() });
    pendingDataDirectory = dataDir;
    const previous = readConfig(dataDir);
    const envFile = path.join(dataDir, ".env");
    const env = fs.existsSync(envFile) ? parseEnvFile(fs.readFileSync(envFile, "utf8")).map : {};
    const pgPort = env.DATABASE_URL ? Number(new URL(env.DATABASE_URL).port || 5432) : previous.pgPort;
    return { ok: true, dataDir, port: Number(env.PORT) || previous.port, pgPort, publicUrl: env.NEXT_PUBLIC_APP_URL || previous.publicUrl };
  } catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle("desktop:save-setup", async (event, payload) => {
  if (event.sender !== mainWindow?.webContents || !event.sender.getURL().startsWith("file:")) return { ok: false, error: "Abra el asistente de configuración para guardar estos cambios." };
  if (maintenanceActive || booting) return { ok: false, error: "Espere a que termine el arranque o mantenimiento del Host." };
  const mode = payload?.mode === "client" ? "client" : "host";
  const remoteUrl = normalizeRemoteUrl(payload?.remoteUrl || "");
  const port = Number(payload?.port) || 3000;
  const pgPort = Number(payload?.pgPort) || 54329;
  const seedDemo = Boolean(payload?.seedDemo);
  const publicUrl = normalizeRemoteUrl(payload?.publicUrl || "");

  if (mode === "client" && !remoteUrl) {
    return { ok: false, error: "Indique la URL del PC principal (Tailscale)." };
  }

  if (![port, pgPort].every(value => Number.isInteger(value) && value >= 1024 && value <= 65535)) return { ok: false, error: "Los puertos deben estar entre 1024 y 65535." };
  const chosen = pendingDataDirectory || hostDataDirectory();
  try { if (pendingDataDirectory) validateExistingDataDirectory(chosen, { installRoots: [app.getAppPath(), process.resourcesPath].filter(Boolean), currentDataDir: hostDataDirectory() }); }
  catch (error) { return { ok: false, error: error.message }; }
  writeConfig({ mode, remoteUrl, port, pgPort, seedDemo, publicUrl, ...(mode === "host" && pendingDataDirectory ? { hostDataDir: chosen } : {}), updateChecks: payload?.updateChecks !== false, updateChannel: payload?.updateChannel === "preview" ? "preview" : "stable" });
  pendingDataDirectory = null;
  await stopHostIfRunning();

  if (mode === "client") {
    desktopPreparationAbort?.abort();
    sendStatus({ phase: "probing", message: "Comprobando servidor…" });
    const probe = await probeRemote(remoteUrl);
    if (!probe.ok) {
      return {
        ok: false,
        error: `No se alcanza ${remoteUrl}: ${probe.error}`,
      };
    }
    lastRemoteVersion = probe.version;
    sendStatus({
      phase: "ready",
      message: probe.version
        ? `Conectado · Host v${probe.version}`
        : "Conectado",
      url: probe.url,
      version: probe.version,
    });
    loadAppUrl(probe.url, probe.version);
    startClientVersionWatch(remoteUrl);
    return { ok: true, url: probe.url, version: probe.version };
  }

  try {
    if (fromSetupShell(event)) startDesktopPreparation();
    const cfg = readConfig();
    const url = await startHostMode(cfg);
    loadAppUrl(url, hostHandle?.version);
    return {
      ok: true,
      url,
      publicUrl: cfg.publicUrl || localAppUrl(port),
      version: hostHandle?.version,
      updateRecognized: hostHandle?.updateRecognized,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
});

ipcMain.handle("desktop:open-external", async (_e, url) => {
  if (!isAllowedDesktopExternalUrl(url)) {
    return { ok: false, error: "URL no permitida" };
  }
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle("desktop:retry", async () => {
  await stopHostIfRunning();
  await boot();
  return lastStatus;
});

app.whenReady().then(() => {
  if (app.isPackaged) {
    process.env.LEXOPEN_APP_ROOT = path.join(
      process.resourcesPath,
      "app-standalone"
    );
    process.env.LEXOPEN_PRISMA_ROOT = path.join(process.resourcesPath, "prisma");
  }
  configureAutoUpdater();
  setTimeout(() => void checkForUpdates(false), 8000).unref();
  updateCheckTimer = setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS);
  updateCheckTimer.unref();
  void boot();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void boot();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  desktopPreparationAbort?.abort();
  if (shuttingDown || quitting) return;
  if (!hostHandle?.stop && !clientWatchTimer && !desktopPreparationTask) return;
  event.preventDefault();
  shuttingDown = true;
  quitting = true;
  if (clientWatchTimer) clearInterval(clientWatchTimer);
  Promise.allSettled([stopHostIfRunning(), desktopPreparationTask])
    .finally(() => app.exit(0));
});
