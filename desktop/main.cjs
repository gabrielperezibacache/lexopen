/**
 * LexOpen Desktop — Electron shell.
 * mode=host → Postgres embebido + Next; mode=client → BrowserWindow a URL Tailscale.
 */
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const {
  readConfig,
  writeConfig,
  normalizeRemoteUrl,
  localAppUrl,
  defaultDataDir,
  readPackageVersion,
  readAppState,
} = require("./config.cjs");
const {
  createDataBackup,
  finalizeRestore,
  restoreDataDirectory,
  rollbackRestore,
} = require("./backup.cjs");

let mainWindow = null;
let hostHandle = null;
let lastStatus = { phase: "idle", message: "Iniciando…" };
let lastRemoteVersion = null;
let shuttingDown = false;
let updaterConfigured = false;
let updaterCheckPromise = null;
let interactiveUpdateCheck = false;
let updateDownloadedInfo = null;
let updatePromptActive = false;

function bundledVersion() {
  return (
    process.env.LEXOPEN_APP_VERSION ||
    readPackageVersion(path.join(__dirname, "package.json"))
  );
}

function sendStatus(partial) {
  lastStatus = { ...lastStatus, ...partial, at: new Date().toISOString() };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:status", lastStatus);
  }
}

function configureAutoUpdater() {
  if (updaterConfigured || !app.isPackaged) return;
  updaterConfigured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    sendStatus({ phase: "checking-update", message: "Buscando actualizaciones…" });
  });
  autoUpdater.on("update-available", (info) => {
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
    updateDownloadedInfo = info;
    sendStatus({
      phase: "update-downloaded",
      message: `Actualización v${info.version} lista para instalar`,
      updateVersion: info.version,
    });
    void promptInstallUpdate(info);
  });
  autoUpdater.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    sendStatus({ phase: "update-error", message });
    if (interactiveUpdateCheck) {
      void dialog.showErrorBox("Actualizaciones", message);
    }
    interactiveUpdateCheck = false;
  });
}

async function checkForUpdates(interactive = false) {
  if (!app.isPackaged) {
    if (interactive) {
      await dialog.showMessageBox({
        type: "info",
        title: "LexOpen",
        message: "La búsqueda de actualizaciones solo está disponible en el instalador.",
      });
    }
    return null;
  }
  configureAutoUpdater();
  if (updaterCheckPromise) return updaterCheckPromise;
  interactiveUpdateCheck = interactive;
  updaterCheckPromise = autoUpdater
    .checkForUpdates()
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (interactive) {
        dialog.showErrorBox("Actualizaciones", message);
      }
      interactiveUpdateCheck = false;
      return null;
    })
    .finally(() => {
      updaterCheckPromise = null;
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
      await autoUpdater.downloadUpdate();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Actualizaciones", message);
  } finally {
    updatePromptActive = false;
  }
}

async function promptInstallUpdate(info) {
  if (updatePromptActive) return;
  updatePromptActive = true;
  try {
    const result = await dialog.showMessageBox({
      type: "info",
      title: "Actualización descargada",
      message: `LexOpen ${info.version} está lista.`,
      detail:
        "Se cerrará el Host de forma ordenada y la instalación conservará la carpeta de datos.",
      buttons: ["Reiniciar e instalar", "Más tarde"],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) {
      await stopHostForMaintenance();
      autoUpdater.quitAndInstall(false, true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Actualizaciones", message);
  } finally {
    updatePromptActive = false;
  }
}

function createWindow(loadUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "LexOpen",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (loadUrl) {
    mainWindow.loadURL(loadUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "renderer", "setup.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
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
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.json().catch(() => ({}));
    if (body.ok !== true) {
      return {
        ok: false,
        error: body.error || `Health check no disponible (${body.db || "desconocido"})`,
      };
    }
    return {
      ok: true,
      url: base,
      version: body.version || null,
      updateRecognized: Boolean(body.updateRecognized),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Sin conexión",
    };
  }
}

function loadAppUrl(url, version) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const v = version || bundledVersion();
  const sep = url.includes("?") ? "&" : "?";
  // Cache-bust inmediato tras publicar/actualizar el Host
  mainWindow.loadURL(`${url}${sep}lexopen_v=${encodeURIComponent(v)}`);
}

async function startHostMode(cfg) {
  sendStatus({ phase: "starting-host", message: "Arrancando servidor local…" });
  const { startHost } = await import("./host-runtime.mjs");
  hostHandle = await startHost({
    dataDir: defaultDataDir(),
    // No pasar seedDemo/publicUrl salvo que el usuario los cambie en el asistente:
    // startHost lee desktop-config.json existente y preserve .env.
    port: cfg.port,
    pgPort: cfg.pgPort,
  });
  const targetUrl = hostHandle.needsSetup
    ? `${hostHandle.url}/setup?token=${encodeURIComponent(hostHandle.bootstrapToken)}`
    : hostHandle.url;
  const msg = hostHandle.needsSetup
    ? "Configuración inicial requerida"
    : hostHandle.updateRecognized
    ? `Actualización v${hostHandle.previousVersion} → v${hostHandle.version} reconocida · datos intactos`
    : `Servidor listo · v${hostHandle.version}`;
  sendStatus({
    phase: hostHandle.needsSetup ? "setup" : "ready",
    message: msg,
    url: targetUrl,
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
  if (!hostHandle) {
    dialog.showErrorBox("LexOpen", "El respaldo requiere un Host activo.");
    return;
  }
  const destination = await chooseDirectory(
    "Elegir destino del respaldo",
    "Crear respaldo aquí",
    path.join(
      path.dirname(defaultDataDir()),
      `LexOpen-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
    )
  );
  if (!destination) return;

  const cfg = readConfig();
  try {
    await stopHostForMaintenance();
    const manifest = await createDataBackup(defaultDataDir(), destination, {
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
  }
}

async function restoreHostBackup() {
  if (!hostHandle) {
    dialog.showErrorBox("LexOpen", "La restauración requiere un Host activo.");
    return;
  }
  const backupDir = await chooseDirectory(
    "Elegir respaldo LexOpen",
    "Usar este respaldo",
    path.dirname(defaultDataDir())
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

  const cfg = readConfig();
  let replacement = null;
  try {
    await stopHostForMaintenance();
    replacement = await restoreDataDirectory(defaultDataDir(), backupDir);
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
        await rollbackRestore(defaultDataDir(), replacement.rollback);
      }
      await restartHostAfterMaintenance(cfg);
    } catch (rollbackError) {
      console.error("[lexopen-desktop] Falló la recuperación del estado anterior", rollbackError);
    }
    dialog.showErrorBox(
      "No se pudo restaurar el respaldo",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function boot() {
  const cfg = readConfig();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "LexOpen",
        submenu: [
          {
            label: "Cambiar modo (asistente)",
            click: () => {
              writeConfig({ mode: null });
              if (mainWindow) {
                mainWindow.loadFile(path.join(__dirname, "renderer", "setup.html"));
              }
            },
          },
          {
            label: "Abrir carpeta de datos",
            click: () => shell.openPath(defaultDataDir()),
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
            label: "Versión y estado",
            click: () => {
              const state = readAppState(defaultDataDir());
              dialog.showMessageBox({
                type: "info",
                title: "LexOpen",
                message: `Versión empaquetada: ${bundledVersion()}`,
                detail: [
                  `Última aplicada: ${state.lastAppVersion || "—"}`,
                  `Reconocida: ${state.updateRecognizedAt || "—"}`,
                  `Datos: ${defaultDataDir()}`,
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

  if (!cfg.mode) {
    createWindow(null);
    sendStatus({ phase: "setup", message: "Configure Host o Cliente" });
    return;
  }

  if (cfg.mode === "client") {
    createWindow(null);
    sendStatus({ phase: "probing", message: "Comprobando servidor remoto…" });
    const probe = await probeRemote(cfg.remoteUrl);
    if (!probe.ok) {
      sendStatus({
        phase: "error",
        message: `No se alcanza el servidor: ${probe.error}. ¿Tailscale conectado y el PC principal encendido?`,
      });
      mainWindow.loadFile(path.join(__dirname, "renderer", "setup.html"));
      return;
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
    return;
  }

  // host
  createWindow(null);
  try {
    const url = await startHostMode(cfg);
    loadAppUrl(url, hostHandle?.version);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendStatus({ phase: "error", message: msg });
    dialog.showErrorBox("LexOpen Host", msg);
    mainWindow.loadFile(path.join(__dirname, "renderer", "setup.html"));
  }
}

let clientWatchTimer = null;

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
  }, 15000);
}

ipcMain.handle("desktop:get-state", async () => {
  const cfg = readConfig();
  return {
    config: cfg,
    status: lastStatus,
    dataDir: defaultDataDir(),
    appState: readAppState(defaultDataDir()),
    version: bundledVersion(),
  };
});

ipcMain.handle("desktop:save-setup", async (_e, payload) => {
  const mode = payload?.mode === "client" ? "client" : "host";
  const remoteUrl = normalizeRemoteUrl(payload?.remoteUrl || "");
  const port = Number(payload?.port) || 3000;
  const pgPort = Number(payload?.pgPort) || 54329;
  const seedDemo = Boolean(payload?.seedDemo);
  const publicUrl = normalizeRemoteUrl(payload?.publicUrl || "");

  if (mode === "client" && !remoteUrl) {
    return { ok: false, error: "Indique la URL del PC principal (Tailscale)." };
  }

  // Solo el asistente escribe preferencias de modo; no se toca en updates.
  writeConfig({ mode, remoteUrl, port, pgPort, seedDemo, publicUrl });

  if (hostHandle?.stop) {
    await hostHandle.stop().catch(() => undefined);
    hostHandle = null;
  }

  if (mode === "client") {
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
    if (mainWindow) loadAppUrl(probe.url, probe.version);
    startClientVersionWatch(remoteUrl);
    return { ok: true, url: probe.url, version: probe.version };
  }

  try {
    const cfg = readConfig();
    const url = await startHostMode(cfg);
    if (mainWindow) loadAppUrl(url, hostHandle?.version);
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
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
  }
});

ipcMain.handle("desktop:retry", async () => {
  if (hostHandle?.stop) {
    await hostHandle.stop().catch(() => undefined);
    hostHandle = null;
  }
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
  setTimeout(() => void checkForUpdates(false), 8000);
  void boot();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void boot();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = true;
  if (clientWatchTimer) clearInterval(clientWatchTimer);
  Promise.resolve(hostHandle?.stop?.())
    .catch(() => undefined)
    .finally(() => app.exit(0));
});
