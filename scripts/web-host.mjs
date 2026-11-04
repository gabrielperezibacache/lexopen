import { stopChild, assertHostStopped, readPostgresPid, embeddedDatabasePort } from "../desktop/host-runtime.mjs";
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
let selfUpdateBusy = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (backupScheduler) {
    await backupScheduler.stop().catch((error) => {
      console.warn("[web-host] No se pudo detener el scheduler de backups:", error);
    });
  }
  if (child) await stopCurrentHost();
  process.exit(exitCode);
}

function startHostProcess() {
  console.log("[web-host] Iniciando proceso del Host local");
  const current = spawn(process.execPath, [path.join(root, "desktop", "host-runtime.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      LEXOPEN_DESKTOP: "1",
      LEXOPEN_WEB_HOST: "1",
      LEXOPEN_DATA_DIR: dataDir,
    },
    shell: false,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
  child = current;
  current.once("exit", (code, signal) => {
    if (child === current) child = null;
    if (expectedChildExits.has(current) || shuttingDown) return;
    console.error(
      `[web-host] El proceso del Host terminó inesperadamente (code=${code}, signal=${signal || "none"}).`
    );
    if (!selfUpdateBusy) void shutdown(signal ? 1 : code ?? 1);
  });
  return current;
}

async function stopCurrentHost() {
  const current = child;
  if (!current) throw new Error("No se conserva el proceso del Host; no se confirmó su parada para respaldar.");
  const hostEnv = { ...process.env, ...readEnvFile(path.join(dataDir, ".env")) };
  const port = Number(hostEnv.PORT || readConfig(dataDir).port || 3000);
  if (!hostEnv.DATABASE_URL) throw new Error("Falta la identidad de PostgreSQL; no se realizará el respaldo.");
  const pgPort = embeddedDatabasePort(hostEnv.DATABASE_URL), postgresPid = readPostgresPid(dataDir);
  expectedChildExits.add(current);
  await stopChild(current, { requireCleanExit: true });
  await assertHostStopped({ dataDir, port, pgPort, child: current, postgresPid });
  if (child === current) child = null;
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
  statusPath: selfUpdateStatusPath,
  finalizeSelfUpdate,
  releaseUpdateLock,
  claimUpdateLock,
  canRestartPreparedUpdate,
} = await import("./web-self-update.mjs");

async function updateHealth() {
  try {
    const response = await fetch(`${initialUrl}/api/health`, { signal: AbortSignal.timeout(3000), redirect: "error", cache: "no-store" });
    return response.ok ? await response.json() : { ok: false };
  } catch { return { ok: false }; }
}

// A manually prepared update may be completed only by a healthy restart of its exact build.
try {
  const pending = JSON.parse(fs.readFileSync(selfUpdateStatusPath(dataDir), "utf8"));
  if (pending.phase === "awaiting_restart") finalizeSelfUpdate(dataDir, pending.requestId, await updateHealth());
} catch { /* No pending receipt on a normal first start. */ }

async function maybeRunSelfUpdate() {
  if (selfUpdateBusy || shuttingDown) return;
  const reqFile = selfUpdateRequestPath(dataDir);
  if (!fs.existsSync(reqFile)) return;
  let request;
  try { request = JSON.parse(fs.readFileSync(reqFile, "utf8")); }
  catch { console.error("[web-host] Solicitud de actualización inválida; no se borró ni ejecutó."); return; }
  if (!request.requestId) { console.error("[web-host] Solicitud antigua sin identidad; revise el estado y vuelva a solicitar la actualización."); return; }
  let previous;
  try { previous = JSON.parse(fs.readFileSync(selfUpdateStatusPath(dataDir), "utf8")); } catch { /* A fresh request has no terminal receipt. */ }
  if (previous?.requestId === request.requestId && ["done", "failed"].includes(previous.phase)) {
    try { claimUpdateLock(dataDir, request.requestId); releaseUpdateLock(dataDir, request.requestId); }
    catch { console.warn("[web-host] Se conserva el bloqueo de otro coordinador; no se repetirá la actualización terminada."); }
    return;
  }
  selfUpdateBusy = true;
  let hostStopped = false;
  try {
    if (backupScheduler) await backupScheduler.stop();
    await stopCurrentHost();
    hostStopped = true;
    await applySelfUpdate({ dataDir, branch: "main", requestId: request.requestId, hostStopped: true,
      onPhase: phase => console.log(`[web-host] self-update ${phase}`),
    });
  } catch (error) {
    console.error("[web-host] Actualización no completada:", error.message);
  } finally {
    let status;
    try { status = JSON.parse(fs.readFileSync(selfUpdateStatusPath(dataDir), "utf8")); } catch { status = null; }
    // Failed dependency/build steps may leave new code with old generated files.
    // Do not start migrations or claim a rollback in that state.
    const restartSafe = canRestartPreparedUpdate(status, request.requestId);
    if (hostStopped && !shuttingDown && restartSafe) {
      startHostProcess();
      const ok = await waitForHost(initialUrl);
      if (status.phase === "awaiting_restart") finalizeSelfUpdate(dataDir, request.requestId, ok ? await updateHealth() : { ok: false });
      if (!ok) console.error("[web-host] El Host no confirmó el arranque; consulte el recibo de actualización y el respaldo.");
      else backupScheduler = createLocalBackupScheduler({ dataDir, env: { ...process.env, ...readEnvFile(path.join(dataDir, ".env")) }, baseUrl: initialUrl, getChild: () => child, stopHost: stopCurrentHost, startHost: startHostProcess, waitForHost });
    } else if (hostStopped) {
      console.error("[web-host] Host detenido para recuperación supervisada. No se ejecutaron migraciones ni una reversión automática.");
    }
    releaseUpdateLock(dataDir, request.requestId);
    selfUpdateBusy = false;
  }
}

setInterval(() => {
  void maybeRunSelfUpdate();
}, 5_000);

// PJUD / digest / alertas de plazos: los arranca desktop/host-runtime.mjs
// (también usado por Electron), para no duplicar crons con web:host.
