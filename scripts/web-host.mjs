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

async function startLocalPjudScheduler(dataDir) {
  const config = readConfig(dataDir);
  const env = {
    ...process.env,
    ...readEnvFile(path.join(dataDir, ".env")),
  };
  const intervalMinutes = Number(env.PJUD_SYNC_INTERVAL_MINUTES || 0);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return null;

  const secret = env.CRON_SECRET;
  if (!secret) {
    console.warn(
      "[web-host] PJUD_SYNC_INTERVAL_MINUTES está configurado, pero falta CRON_SECRET; scheduler desactivado."
    );
    return null;
  }

  const port = Number(env.PORT || config.port || 3000);
  const baseUrl = `http://127.0.0.1:${port}`;
  if (!(await waitForHost(baseUrl))) {
    console.warn("[web-host] No se pudo iniciar el scheduler PJUD: health no disponible.");
    return null;
  }

  const sync = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/causas/monitoreo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: "{}",
        signal: AbortSignal.timeout(120_000),
        redirect: "error",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn("[web-host] Sync PJUD falló:", body.error || response.status);
        return;
      }
      console.log(
        `[web-host] Sync PJUD local: ${body.synced || 0} causas procesadas.`
      );
    } catch (error) {
      console.warn(
        "[web-host] Sync PJUD falló:",
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  await sync();
  const timer = setInterval(() => void sync(), intervalMinutes * 60_000);
  console.log(
    `[web-host] Scheduler PJUD local activo cada ${intervalMinutes} minutos.`
  );
  return timer;
}

async function startLocalMisCausasScheduler(dataDir) {
  const config = readConfig(dataDir);
  const env = {
    ...process.env,
    ...readEnvFile(path.join(dataDir, ".env")),
  };
  const intervalMinutes = Number(env.PJUD_MIS_CAUSAS_INTERVAL_MINUTES || 0);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return null;

  const secret = env.CRON_SECRET;
  if (!secret) {
    console.warn(
      "[web-host] PJUD_MIS_CAUSAS_INTERVAL_MINUTES está configurado, pero falta CRON_SECRET; scheduler Mis Causas desactivado."
    );
    return null;
  }

  const port = Number(env.PORT || config.port || 3000);
  const baseUrl = `http://127.0.0.1:${port}`;
  if (!(await waitForHost(baseUrl))) {
    console.warn(
      "[web-host] No se pudo iniciar el scheduler Mis Causas: health no disponible."
    );
    return null;
  }

  const sync = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/pjud/mis-causas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({ syncMovimientos: true }),
        signal: AbortSignal.timeout(300_000),
        redirect: "error",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn(
          "[web-host] Sync Mis Causas falló:",
          body.error || response.status
        );
        return;
      }
      console.log(
        `[web-host] Mis Causas: ${body.listed || 0} listadas · ${body.created || 0} nuevas.`
      );
    } catch (error) {
      console.warn(
        "[web-host] Sync Mis Causas falló:",
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  await sync();
  const timer = setInterval(() => void sync(), intervalMinutes * 60_000);
  console.log(
    `[web-host] Scheduler Mis Causas activo cada ${intervalMinutes} minutos.`
  );
  return timer;
}

async function startLocalDigestScheduler(dataDir) {
  const config = readConfig(dataDir);
  const env = {
    ...process.env,
    ...readEnvFile(path.join(dataDir, ".env")),
  };
  const intervalMinutes = Number(env.PJUD_DIGEST_INTERVAL_MINUTES || 0);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return null;

  const secret = env.CRON_SECRET;
  if (!secret) {
    console.warn(
      "[web-host] PJUD_DIGEST_INTERVAL_MINUTES está configurado, pero falta CRON_SECRET; scheduler digest desactivado."
    );
    return null;
  }

  const port = Number(env.PORT || config.port || 3000);
  const baseUrl = `http://127.0.0.1:${port}`;
  if (!(await waitForHost(baseUrl))) {
    console.warn(
      "[web-host] No se pudo iniciar el scheduler digest: health no disponible."
    );
    return null;
  }

  const run = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/pjud/digest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: "{}",
        signal: AbortSignal.timeout(120_000),
        redirect: "error",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn(
          "[web-host] Digest PJUD falló:",
          body.error || response.status
        );
        return;
      }
      console.log(
        `[web-host] Digest PJUD: ${body.causas || 0} causas · email ${body.emailed || 0} · in-app ${body.notified || 0}.`
      );
    } catch (error) {
      console.warn(
        "[web-host] Digest PJUD falló:",
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  await run();
  const timer = setInterval(() => void run(), intervalMinutes * 60_000);
  console.log(
    `[web-host] Scheduler digest PJUD activo cada ${intervalMinutes} minutos.`
  );
  return timer;
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
let schedulerTimer = null;
let misCausasSchedulerTimer = null;
let digestSchedulerTimer = null;
let backupScheduler = null;
let child = null;
const expectedChildExits = new WeakSet();
let shuttingDown = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (misCausasSchedulerTimer) clearInterval(misCausasSchedulerTimer);
  if (digestSchedulerTimer) clearInterval(digestSchedulerTimer);
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

void startLocalPjudScheduler(dataDir)
  .then((timer) => {
    if (shuttingDown) {
      if (timer) clearInterval(timer);
    } else {
      schedulerTimer = timer;
    }
  })
  .catch((error) => {
    console.warn(
      "[web-host] No se pudo iniciar el scheduler PJUD:",
      error instanceof Error ? error.message : String(error)
    );
  });

void startLocalMisCausasScheduler(dataDir)
  .then((timer) => {
    if (shuttingDown) {
      if (timer) clearInterval(timer);
    } else {
      misCausasSchedulerTimer = timer;
    }
  })
  .catch((error) => {
    console.warn(
      "[web-host] No se pudo iniciar el scheduler Mis Causas:",
      error instanceof Error ? error.message : String(error)
    );
  });
void startLocalDigestScheduler(dataDir)
  .then((timer) => {
    if (shuttingDown) {
      if (timer) clearInterval(timer);
    } else {
      digestSchedulerTimer = timer;
    }
  })
  .catch((error) => {
    console.warn(
      "[web-host] No se pudo iniciar el scheduler digest:",
      error instanceof Error ? error.message : String(error)
    );
  });
