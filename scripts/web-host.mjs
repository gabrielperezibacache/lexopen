import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createLocalBackupScheduler } from "./web-backup-scheduler.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { defaultDataDir, readConfig } = require("../desktop/config.cjs");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const shell = process.platform === "win32";
const standaloneServer = path.join(root, ".next", "standalone", "server.js");
const desktopRuntime = path.join(
  root,
  "desktop",
  "node_modules",
  "embedded-postgres",
  "package.json"
);

function runSetup(args, label) {
  console.log(`[web-host] ${label}`);
  const result = spawnSync(npm, args, {
    cwd: root,
    env: process.env,
    shell,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return index > 0
          ? [line.slice(0, index).trim(), line.slice(index + 1).trim()]
          : null;
      })
      .filter((entry) => entry !== null)
  );
}

function killChild(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      shell: true,
    });
    return;
  }
  child.kill("SIGTERM");
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 10_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    killChild(child);
  });
}

async function waitForHost(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(2_000),
        redirect: "error",
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok === true) return true;
    } catch {
      // The Host is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

if (!fs.existsSync(desktopRuntime)) {
  runSetup(["run", "desktop:install"], "Instalando runtime local de PostgreSQL");
}
if (!fs.existsSync(standaloneServer)) {
  runSetup(["run", "desktop:build"], "Compilando LexOpen para el Host web");
}

console.log("[web-host] Iniciando Host web local en el navegador");
const dataDir = path.resolve(
  process.env.LEXOPEN_DATA_DIR || defaultDataDir()
);
let backupScheduler = null;
let child = null;
const expectedChildExits = new WeakSet();
let shuttingDown = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (backupScheduler) {
    await backupScheduler.stop().catch((error) => {
      console.warn("[web-host] No se pudo detener el scheduler de backups:", error);
    });
  }
  await stopCurrentHost();
  process.exit(exitCode);
}

function startHostProcess() {
  console.log("[web-host] Iniciando proceso del Host local");
  const current = spawn(npm, ["run", "desktop:host"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      LEXOPEN_DESKTOP: "1",
      LEXOPEN_WEB_HOST: "1",
      LEXOPEN_DATA_DIR: dataDir,
    },
    shell,
    stdio: "inherit",
  });
  child = current;
  current.once("exit", (code, signal) => {
    if (child === current) child = null;
    if (expectedChildExits.has(current) || shuttingDown) return;
    console.error(
      `[web-host] El proceso del Host terminó inesperadamente (code=${code}, signal=${signal || "none"}).`
    );
    void shutdown(signal ? 1 : code ?? 1);
  });
  return current;
}

async function stopCurrentHost() {
  const current = child;
  if (!current) return;
  child = null;
  expectedChildExits.add(current);
  await stopChild(current);
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

startHostProcess();
const initialEnv = {
  ...process.env,
  ...readEnvFile(path.join(dataDir, ".env")),
};
const initialPort = Number(
  initialEnv.PORT || readConfig(dataDir).port || 3000
);
const initialUrl = `http://127.0.0.1:${initialPort}`;
if (!(await waitForHost(initialUrl))) {
  console.error("[web-host] Health no disponible después de iniciar el Host.");
  await shutdown(1);
}

backupScheduler = createLocalBackupScheduler({
  dataDir,
  env: initialEnv,
  baseUrl: initialUrl,
  getChild: () => child,
  stopHost: stopCurrentHost,
  startHost: startHostProcess,
  waitForHost,
});

const {
  applySelfUpdate,
  requestPath: selfUpdateRequestPath,
  lockPath: selfUpdateLockPath,
  statusPath: selfUpdateStatusPath,
} = await import("./web-self-update.mjs");

let selfUpdateBusy = false;

async function maybeRunSelfUpdate() {
  if (selfUpdateBusy || shuttingDown) return;
  const reqFile = selfUpdateRequestPath(dataDir);
  if (!fs.existsSync(reqFile)) return;
  selfUpdateBusy = true;
  console.log("[web-host] Solicitud de actualización in-app detectada");
  let hostStopped = false;
  try {
    await stopCurrentHost();
    hostStopped = true;
    applySelfUpdate({
      dataDir,
      branch: "main",
      onPhase: (phase, extra) => {
        console.log(
          `[web-host] self-update ${phase}${extra?.message ? `: ${extra.message}` : ""}`
        );
      },
    });
  } catch (error) {
    console.error(
      "[web-host] Actualización in-app falló:",
      error instanceof Error ? error.message : error
    );
  } finally {
    try {
      if (fs.existsSync(reqFile)) fs.unlinkSync(reqFile);
    } catch {
      // ignore
    }
    try {
      const lock = selfUpdateLockPath(dataDir);
      if (fs.existsSync(lock)) fs.unlinkSync(lock);
    } catch {
      // ignore
    }
    if (hostStopped && !shuttingDown) {
      startHostProcess();
      const ok = await waitForHost(initialUrl);
      if (!ok) {
        console.error(
          "[web-host] Health no disponible tras la actualización in-app."
        );
      } else {
        // Mark done with restarting cleared for UI.
        try {
          const statusFile = selfUpdateStatusPath(dataDir);
          if (fs.existsSync(statusFile)) {
            const prev = JSON.parse(fs.readFileSync(statusFile, "utf8"));
            fs.writeFileSync(
              statusFile,
              JSON.stringify(
                {
                  ...prev,
                  phase: prev.phase === "failed" ? "failed" : "done",
                  message:
                    prev.phase === "failed"
                      ? prev.message
                      : "Actualización aplicada. Ya puede recargar el navegador.",
                  updatedAt: new Date().toISOString(),
                },
                null,
                2
              )
            );
          }
        } catch {
          // ignore
        }
      }
    }
    selfUpdateBusy = false;
  }
}

setInterval(() => {
  void maybeRunSelfUpdate();
}, 5_000);

// PJUD / digest / alertas de plazos: los arranca desktop/host-runtime.mjs
// (también usado por Electron), para no duplicar crons con web:host.
