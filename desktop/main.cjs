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
} = require("./config.cjs");

let mainWindow = null;
let hostHandle = null;
let lastStatus = { phase: "idle", message: "Iniciando…" };

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
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, url: base };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Sin conexión",
    };
  }
}

async function startHostMode(cfg) {
  sendStatus({ phase: "starting-host", message: "Arrancando servidor local…" });
  const { startHost } = await import("./host-runtime.mjs");
  hostHandle = await startHost({
    dataDir: defaultDataDir(),
    port: cfg.port,
    pgPort: cfg.pgPort,
    seedDemo: cfg.seedDemo,
    publicUrl: cfg.publicUrl,
  });
  sendStatus({
    phase: "ready",
    message: "Servidor listo",
    url: hostHandle.url,
    publicUrl: hostHandle.publicUrl,
  });
  return hostHandle.url;
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
    sendStatus({ phase: "ready", message: "Conectado", url: probe.url });
    mainWindow.loadURL(probe.url);
    return;
  }

  // host
  createWindow(null);
  try {
    const url = await startHostMode(cfg);
    mainWindow.loadURL(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendStatus({ phase: "error", message: msg });
    dialog.showErrorBox("LexOpen Host", msg);
    mainWindow.loadFile(path.join(__dirname, "renderer", "setup.html"));
  }
}

ipcMain.handle("desktop:get-state", async () => {
  const cfg = readConfig();
  return { config: cfg, status: lastStatus, dataDir: defaultDataDir() };
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
    sendStatus({ phase: "ready", message: "Conectado", url: probe.url });
    if (mainWindow) mainWindow.loadURL(probe.url);
    return { ok: true, url: probe.url };
  }

  try {
    const cfg = readConfig();
    const url = await startHostMode(cfg);
    if (mainWindow) mainWindow.loadURL(url);
    return { ok: true, url, publicUrl: cfg.publicUrl || localAppUrl(port) };
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

app.on("before-quit", () => {
  if (hostHandle?.stop) void hostHandle.stop();
});
