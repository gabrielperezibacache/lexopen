/**
 * LexOpen Desktop — Electron shell.
 * mode=host → Postgres embebido + Next; mode=client → BrowserWindow a URL Tailscale.
 */
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron");
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

let mainWindow = null;
let hostHandle = null;
let lastStatus = { phase: "idle", message: "Iniciando…" };
let lastRemoteVersion = null;
let shuttingDown = false;

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
