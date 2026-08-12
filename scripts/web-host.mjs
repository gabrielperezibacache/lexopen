import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

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
  const env = readEnvFile(path.join(dataDir, ".env"));
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

if (!fs.existsSync(desktopRuntime)) {
  runSetup(["run", "desktop:install"], "Instalando runtime local de PostgreSQL");
}
if (!fs.existsSync(standaloneServer)) {
  runSetup(["run", "desktop:build"], "Compilando LexOpen para el Host web");
}

console.log("[web-host] Iniciando Host web local en el navegador");
const child = spawn(npm, ["run", "desktop:host"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    LEXOPEN_DESKTOP: "1",
  },
  shell,
  stdio: "inherit",
});
const dataDir = path.resolve(
  process.env.LEXOPEN_DATA_DIR || defaultDataDir()
);
let schedulerTimer = null;
void startLocalPjudScheduler(dataDir).then((timer) => {
  schedulerTimer = timer;
});

const forwardSignal = (signal) => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (!child.killed) child.kill(signal);
};
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));
child.once("exit", (code, signal) => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (signal) {
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
