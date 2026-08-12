/**
 * LexOpen Host production checklist (env + optional /api/health probe).
 *
 * Usage:
 *   LEXOPEN_DATA_DIR=/ruta/lexopen npm run prod:check
 *   npm run prod:check -- --env /ruta/lexopen/.env --health http://127.0.0.1:3000
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { defaultDataDir, envPath } = require("../desktop/config.cjs");

const WEAK_SESSION_SECRET_RE =
  /change-me|dev-session-secret|lexopen-dev|password|secret123/i;

const FORBIDDEN_ON = [
  "LEXOPEN_OPEN_ACCESS",
  "LEXOPEN_RELAX_CSRF",
  "LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS",
  "LEXOPEN_DEMO_SWITCHER",
];

const DEMO_OFF = ["HERMES_ALLOW_DEMO", "LLM_ALLOW_DEMO", "PJUD_ALLOW_DEMO"];

export function readEnvFile(file) {
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

export function isStrongSessionSecret(secret) {
  const value = String(secret || "").trim();
  if (value.length < 16) return false;
  if (WEAK_SESSION_SECRET_RE.test(value)) return false;
  return true;
}

function intervalOn(env, key) {
  const n = Number(env[key] || 0);
  return Number.isFinite(n) && n > 0;
}

/**
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function evaluateHostEnv(env = {}) {
  const errors = [];
  const warnings = [];

  if (!isStrongSessionSecret(env.SESSION_SECRET)) {
    errors.push(
      "SESSION_SECRET ausente, corto (<16) o placeholder (p. ej. change-me-in-production)."
    );
  }

  for (const key of FORBIDDEN_ON) {
    if (env[key] === "1") {
      errors.push(`${key}=1 está prohibido en producción (arranque fallará).`);
    }
  }

  for (const key of DEMO_OFF) {
    if (env[key] === "1") {
      warnings.push(
        `${key}=1 debilita controles; use 0 salvo LEXOPEN_KEEP_* intencional.`
      );
    }
  }

  const schedulers =
    intervalOn(env, "PJUD_SYNC_INTERVAL_MINUTES") ||
    intervalOn(env, "PJUD_DIGEST_INTERVAL_MINUTES") ||
    intervalOn(env, "PJUD_MIS_CAUSAS_INTERVAL_MINUTES") ||
    intervalOn(env, "PLAZOS_ALERTAS_INTERVAL_MINUTES");
  if (schedulers && !String(env.CRON_SECRET || "").trim()) {
    errors.push(
      "Hay intervalos de scheduler > 0 pero falta CRON_SECRET (requerido por proxy/cron)."
    );
  }

  if (intervalOn(env, "LEXOPEN_BACKUP_INTERVAL_MINUTES")) {
    const backupDir = String(env.LEXOPEN_BACKUP_DIR || "").trim();
    const dataDir = String(env.LEXOPEN_DATA_DIR || "").trim();
    if (!backupDir) {
      warnings.push(
        "LEXOPEN_BACKUP_INTERVAL_MINUTES>0 sin LEXOPEN_BACKUP_DIR; el Host usará un hermano *-backups."
      );
    } else if (dataDir && path.resolve(backupDir).startsWith(path.resolve(dataDir) + path.sep)) {
      errors.push(
        "LEXOPEN_BACKUP_DIR no debe vivir dentro de LEXOPEN_DATA_DIR."
      );
    }
  }

  if (
    env.LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE !== "1" &&
    !String(env.S3_BUCKET || "").trim()
  ) {
    warnings.push(
      "Sin S3_BUCKET ni LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE=1; en Host embebido web:host lo habilita vía LEXOPEN_DESKTOP."
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { envFile: null, healthUrl: null, dataDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--env" && argv[i + 1]) out.envFile = argv[++i];
    else if (a === "--health" && argv[i + 1]) out.healthUrl = argv[++i];
    else if (a === "--data-dir" && argv[i + 1]) out.dataDir = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function probeHealth(url) {
  const res = await fetch(`${url.replace(/\/$/, "")}/api/health`, {
    redirect: "error",
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Usage: npm run prod:check -- [--data-dir DIR] [--env FILE] [--health URL]

Checks Host production readiness against the data-dir .env (and optional health).`);
    process.exit(0);
  }

  const dataDir = args.dataDir || process.env.LEXOPEN_DATA_DIR || defaultDataDir();
  const file = args.envFile || envPath(dataDir);
  const fromFile = readEnvFile(file);
  const env = {
    ...fromFile,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined)
    ),
    LEXOPEN_DATA_DIR: process.env.LEXOPEN_DATA_DIR || fromFile.LEXOPEN_DATA_DIR || dataDir,
  };

  console.log(`[prod-check] data dir: ${dataDir}`);
  console.log(`[prod-check] env file: ${fs.existsSync(file) ? file : "(missing)"}`);

  if (!fs.existsSync(file)) {
    console.error(
      "[prod-check] FAIL: no hay .env del Host. Ejecute primero: npm run web:host"
    );
    process.exit(2);
  }

  const result = evaluateHostEnv(env);
  for (const w of result.warnings) console.warn(`[prod-check] WARN: ${w}`);
  for (const e of result.errors) console.error(`[prod-check] FAIL: ${e}`);

  if (args.healthUrl) {
    try {
      const { status, body } = await probeHealth(args.healthUrl);
      if (status !== 200 || body.ok !== true || body.db !== "up") {
        result.errors.push(
          `Health ${args.healthUrl} → HTTP ${status}, ok=${body.ok}, db=${body.db}`
        );
        console.error(
          `[prod-check] FAIL: health probe HTTP ${status} ok=${body.ok} db=${body.db}`
        );
      } else {
        console.log(
          `[prod-check] health ok (db=${body.db}${
            body.needsSetup != null ? `, needsSetup=${body.needsSetup}` : ""
          }${body.storageReady != null ? `, storageReady=${body.storageReady}` : ""})`
        );
        if (body.needsSetup === true) {
          result.warnings.push(
            "needsSetup=true: cree el admin en /setup antes de operación real."
          );
          console.warn(
            "[prod-check] WARN: needsSetup=true — complete /setup antes de cargar datos reales."
          );
        }
      }
    } catch (e) {
      result.errors.push(
        `No se pudo consultar health: ${e instanceof Error ? e.message : e}`
      );
      console.error(
        `[prod-check] FAIL: health probe: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  if (result.errors.length) {
    console.error(`[prod-check] ${result.errors.length} error(es).`);
    process.exit(1);
  }
  console.log("[prod-check] OK — checklist de entorno Host superado.");
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
