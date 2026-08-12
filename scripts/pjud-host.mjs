#!/usr/bin/env node
/**
 * Arranque recomendado del sidecar PJUD en el host LexOpen.
 *
 * Uso:
 *   npx playwright install chromium   # una vez
 *   npm run pjud:host                 # sidecar en :8787
 *   # otra terminal: npm run web:host  (o npm run dev)
 *
 * Env mínimas (en .env o entorno):
 *   CAPTCHA_SOLVER_PROVIDER=nopecha|2captcha|capsolver|anticaptcha|capmonster
 *   CAPTCHA_SOLVER_API_KEY=...   (opcional para nopecha free tier)
 *   PJUD_SCRAPER_KEY=...   (recomendado)
 *
 * Flags:
 *   --with-web     también arranca `npm run web:host`
 *   --check-only   valida env + Chromium y sale
 */

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const shell = process.platform === "win32";
const args = new Set(process.argv.slice(2));

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
      .filter(Boolean)
  );
}

function loadEnv() {
  const dataDir = process.env.LEXOPEN_DATA_DIR?.trim();
  const candidates = [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    dataDir ? path.join(dataDir, ".env") : null,
  ].filter(Boolean);
  const merged = {};
  for (const file of candidates) {
    Object.assign(merged, readEnvFile(file));
  }
  return { ...merged, ...process.env };
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

async function waitForScraper(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && (body.ok === true || body.status === "ok")) {
        return body;
      }
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function chromiumHint() {
  const probe = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["playwright", "install", "--dry-run", "chromium"],
    { cwd: root, encoding: "utf8", shell }
  );
  // dry-run may not exist on all versions — ignore failures
  void probe;
  return "npx playwright install chromium";
}

function validateEnv(env) {
  const missing = [];
  const providers = [
    "nopecha",
    "2captcha",
    "capsolver",
    "anticaptcha",
    "capmonster",
  ];
  const provider = env.CAPTCHA_SOLVER_PROVIDER?.trim().toLowerCase();
  const key = env.CAPTCHA_SOLVER_API_KEY?.trim();
  const keyOptional =
    !key || key.toLowerCase() === "free" || key.toLowerCase() === "none";
  if (!provider || !providers.includes(provider)) {
    missing.push(
      "CAPTCHA_SOLVER_PROVIDER=nopecha|2captcha|capsolver|anticaptcha|capmonster"
    );
  } else if (provider !== "nopecha" && keyOptional) {
    missing.push(`CAPTCHA_SOLVER_API_KEY (requerido para ${provider})`);
  }
  return { missing, provider, key };
}

async function main() {
  const envIn = loadEnv();
  const port = Number(envIn.PJUD_SCRAPER_PORT || envIn.PORT_SCRAPER || 8787);
  const scraperKey =
    envIn.PJUD_SCRAPER_KEY?.trim() ||
    (envIn.PJUD_HOST_AUTOKEY === "1"
      ? randomBytes(24).toString("hex")
      : "");
  const baseUrl = `http://127.0.0.1:${port}`;

  const env = {
    ...envIn,
    PORT: String(port),
    PJUD_PUBLIC_SCRAPE: envIn.PJUD_PUBLIC_SCRAPE || "1",
    PJUD_SCRAPER_ALLOW_PRIVATE: "1",
    PJUD_SCRAPER_URL: envIn.PJUD_SCRAPER_URL?.trim() || baseUrl,
    PJUD_ALLOW_DEMO: envIn.PJUD_ALLOW_DEMO ?? "0",
  };
  if (scraperKey) env.PJUD_SCRAPER_KEY = scraperKey;

  console.log("[pjud-host] LexOpen PJUD sidecar (opción recomendada)");
  console.log(`[pjud-host] URL ${baseUrl}`);

  const { missing } = validateEnv(env);
  if (missing.length) {
    console.error("[pjud-host] Falta configurar:");
    for (const item of missing) console.error(`  - ${item}`);
    console.error(
      "[pjud-host] Añada las variables al .env del repo o de LEXOPEN_DATA_DIR."
    );
    console.error(
      "[pjud-host] Chromium (una vez): " + chromiumHint()
    );
    if (args.has("--check-only")) process.exit(1);
    process.exit(1);
  }

  if (!env.PJUD_SCRAPER_KEY) {
    console.warn(
      "[pjud-host] Aviso: PJUD_SCRAPER_KEY vacío — en desarrollo el sidecar acepta sin key; en producción defínala y copie la misma al web."
    );
  } else if (envIn.PJUD_HOST_AUTOKEY === "1" && !envIn.PJUD_SCRAPER_KEY) {
    console.log(
      `[pjud-host] PJUD_SCRAPER_KEY generada (AUTOKEY): ${env.PJUD_SCRAPER_KEY}`
    );
    console.log(
      "[pjud-host] Copie esa key al .env del web (PJUD_SCRAPER_KEY=...)."
    );
  }

  if (args.has("--check-only")) {
    console.log("[pjud-host] check-only OK (CAPTCHA configurado).");
    console.log(
      `[pjud-host] provider=${env.CAPTCHA_SOLVER_PROVIDER || "?"} key=${
        env.CAPTCHA_SOLVER_API_KEY &&
        !["free", "none", ""].includes(
          String(env.CAPTCHA_SOLVER_API_KEY).trim().toLowerCase()
        )
          ? "yes"
          : "no (ok si nopecha free)"
      } fallback=${env.CAPTCHA_SOLVER_FALLBACK || "—"}`
    );
    console.log(`[pjud-host] Use en el web:\n  PJUD_SCRAPER_URL=${baseUrl}\n  PJUD_SCRAPER_ALLOW_PRIVATE=1\n  PJUD_SCRAPER_KEY=${env.PJUD_SCRAPER_KEY || "(vacío en dev)"}`);
    process.exit(0);
  }

  console.log("[pjud-host] Arrancando sidecar…");
  const scraper = spawn(npm, ["run", "pjud:scraper"], {
    cwd: root,
    env,
    shell,
    stdio: "inherit",
  });

  const children = [scraper];
  let web = null;

  const shutdown = async (code = 0) => {
    await Promise.all(children.map((c) => stopChild(c)));
    process.exit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  scraper.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[pjud-host] sidecar salió con código ${code}`);
      void shutdown(code);
    }
  });

  const health = await waitForScraper(baseUrl);
  if (!health) {
    console.error(
      "[pjud-host] Timeout esperando /health. ¿Chromium instalado? → " +
        chromiumHint()
    );
    await shutdown(1);
    return;
  }

  console.log(
    `[pjud-host] health ok · scrapeReady=${Boolean(health.scrapeReady ?? health.workerRunning)} · captcha=${Boolean(health.captcha)}`
  );
  if (!health.scrapeReady && !health.workerRunning) {
    console.warn(
      "[pjud-host] scrapeReady=false — revise CAPTCHA_* y Playwright/Chromium."
    );
  }

  console.log(`[pjud-host] Configure el web con:`);
  console.log(`  PJUD_SCRAPER_URL=${baseUrl}`);
  console.log(`  PJUD_SCRAPER_ALLOW_PRIVATE=1`);
  if (env.PJUD_SCRAPER_KEY) {
    console.log(`  PJUD_SCRAPER_KEY=${env.PJUD_SCRAPER_KEY}`);
  }
  console.log(`  PJUD_ALLOW_DEMO=0`);

  if (args.has("--with-web")) {
    console.log("[pjud-host] Arrancando web:host…");
    web = spawn(npm, ["run", "web:host"], {
      cwd: root,
      env: {
        ...env,
        PJUD_SCRAPER_URL: baseUrl,
        PJUD_SCRAPER_ALLOW_PRIVATE: "1",
      },
      shell,
      stdio: "inherit",
    });
    children.push(web);
    web.on("exit", (code) => void shutdown(code || 0));
  } else {
    console.log(
      "[pjud-host] Sidecar listo. En otra terminal: npm run web:host  (o npm run dev)"
    );
  }
}

main().catch((error) => {
  console.error("[pjud-host]", error);
  process.exit(1);
});
