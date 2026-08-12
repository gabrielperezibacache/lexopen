/**
 * Preferencias y datos del usuario viven FUERA del instalador
 * (Application Support / %APPDATA%). Las actualizaciones solo
 * reemplazan el binario; nunca reescriben config ni pgdata/storage.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const DEFAULTS = {
  mode: null, // "host" | "client" | null (asistente)
  remoteUrl: "",
  port: 3000,
  pgPort: 54329,
  seedDemo: false,
  publicUrl: "",
};

/** Claves que el runtime puede crear si faltan, pero NUNCA pisar si ya existen. */
const PRESERVE_IF_SET = new Set([
  "SESSION_SECRET",
  "DATABASE_URL",
  "PORT",
  "HOSTNAME",
  "LEXOPEN_DEMO_SWITCHER",
  "HERMES_ALLOW_DEMO",
  "LLM_ALLOW_DEMO",
  "LLM_API_URL",
  "LLM_API_KEY",
  "LLM_MODEL",
  "HERMES_API_URL",
  "HERMES_API_KEY",
  "NEXT_PUBLIC_APP_NAME",
  "NEXT_PUBLIC_APP_URL",
  "LEXOPEN_TRUSTED_ORIGINS",
  "LEXOPEN_TRUSTED_PROXY",
  "LEXOPEN_BOOTSTRAP_TOKEN",
  "LEXOPEN_RECOVERY_TOKEN",
  "PJUD_ALLOW_DEMO",
  "PJUD_SCRAPER_URL",
  "PJUD_SCRAPER_KEY",
  "PJUD_SCRAPER_ALLOW_PRIVATE",
  "CRON_SECRET",
  "STORAGE_PATH",
  "OBSIDIAN_VAULT_PATH",
  "OBSIDIAN_REST_URL",
  "OBSIDIAN_REST_TOKEN",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
]);

function defaultDataDir() {
  if (process.env.LEXOPEN_DATA_DIR) {
    return path.resolve(process.env.LEXOPEN_DATA_DIR);
  }
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "LexOpen");
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(home, "AppData", "Roaming"),
      "LexOpen"
    );
  }
  return path.join(home, ".local", "share", "LexOpen");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function configPath(dataDir = defaultDataDir()) {
  return path.join(dataDir, "desktop-config.json");
}

function envPath(dataDir = defaultDataDir()) {
  return path.join(dataDir, ".env");
}

function appStatePath(dataDir = defaultDataDir()) {
  return path.join(dataDir, "app-state.json");
}

function storageDir(dataDir = defaultDataDir()) {
  return path.join(dataDir, "storage");
}

function vaultDir(dataDir = defaultDataDir()) {
  return path.join(dataDir, "obsidian-vault");
}

function pgDataDir(dataDir = defaultDataDir()) {
  return path.join(dataDir, "pgdata");
}

/** true si la ruta de storage quedaría dentro del instalador (se borra al actualizar). */
function isUnsafeStoragePath(storagePath, dataDir) {
  if (!storagePath) return true;
  const resolved = path.resolve(storagePath);
  const data = path.resolve(dataDir);
  if (resolved === data || resolved.startsWith(data + path.sep)) return false;
  // cwd / .next / resources del empaquetado
  const cwd = process.cwd();
  if (resolved === cwd || resolved.startsWith(cwd + path.sep)) return true;
  if (/[/\\]\.next([/\\]|$)/i.test(resolved)) return true;
  if (/[/\\]app-standalone([/\\]|$)/i.test(resolved)) return true;
  return false;
}

function readJsonSafe(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return fallback;
  }
}

function replaceFileAtomic(file, contents) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, contents, "utf8");
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    // Windows: rename sobre destino existente puede fallar
    const code = e && typeof e === "object" && "code" in e ? e.code : "";
    if (code === "EEXIST" || code === "EPERM" || process.platform === "win32") {
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
      fs.renameSync(tmp, file);
    } else {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      throw e;
    }
  }
}

function writeJsonAtomic(file, data) {
  replaceFileAtomic(file, JSON.stringify(data, null, 2) + "\n");
}

function readConfig(dataDir = defaultDataDir()) {
  ensureDir(dataDir);
  const raw = readJsonSafe(configPath(dataDir), {});
  return { ...DEFAULTS, ...raw, dataDir };
}

/**
 * Fusiona preferencias sin borrar claves desconocidas del usuario.
 * No escribe si `partial` está vacío.
 */
function writeConfig(partial, dataDir = defaultDataDir()) {
  ensureDir(dataDir);
  const prev = readJsonSafe(configPath(dataDir), {});
  const next = { ...DEFAULTS, ...prev, ...partial };
  delete next.dataDir;
  writeJsonAtomic(configPath(dataDir), next);
  return { ...next, dataDir };
}

function readAppState(dataDir = defaultDataDir()) {
  return readJsonSafe(appStatePath(dataDir), {
    lastAppVersion: null,
    lastAppliedAt: null,
    updateRecognizedAt: null,
  });
}

/**
 * Registra de inmediato la versión de app en curso (sin tocar config/.env/pgdata).
 * Devuelve si hubo cambio de versión (actualización detectada).
 */
function recognizeAppVersion(appVersion, dataDir = defaultDataDir()) {
  ensureDir(dataDir);
  const prev = readAppState(dataDir);
  const changed =
    Boolean(appVersion) &&
    prev.lastAppVersion !== null &&
    prev.lastAppVersion !== appVersion;
  const firstRun = !prev.lastAppVersion;
  const now = new Date().toISOString();
  const next = {
    ...prev,
    lastAppVersion: appVersion,
    lastAppliedAt: now,
    updateRecognizedAt: changed || firstRun ? now : prev.updateRecognizedAt,
    previousAppVersion: changed ? prev.lastAppVersion : prev.previousAppVersion || null,
  };
  writeJsonAtomic(appStatePath(dataDir), next);
  return {
    changed,
    firstRun,
    previousVersion: prev.lastAppVersion,
    currentVersion: appVersion,
    state: next,
  };
}

function parseEnvFile(text) {
  const map = {};
  const order = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) {
      order.push({ type: "raw", value: line });
      continue;
    }
    const i = line.indexOf("=");
    if (i === -1) {
      order.push({ type: "raw", value: line });
      continue;
    }
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1);
    map[key] = value;
    order.push({ type: "key", key });
  }
  return { map, order };
}

function serializeEnv(map, order) {
  const seen = new Set();
  const lines = [];
  for (const item of order) {
    if (item.type === "raw") {
      lines.push(item.value);
      continue;
    }
    if (map[item.key] === undefined) continue;
    lines.push(`${item.key}=${map[item.key]}`);
    seen.add(item.key);
  }
  for (const key of Object.keys(map)) {
    if (seen.has(key)) continue;
    lines.push(`${key}=${map[key]}`);
  }
  return lines.join("\n").replace(/\n*$/, "\n");
}

/**
 * Aplica defaults solo donde faltan claves. Nunca pisa valores ya guardados
 * (incl. los que el usuario editó a mano en .env).
 */
function mergeEnvPreserveUser(existingText, defaults) {
  const { map, order } = parseEnvFile(existingText);
  const added = [];
  for (const [key, value] of Object.entries(defaults)) {
    if (map[key] === undefined || map[key] === "") {
      map[key] = value;
      added.push(key);
    } else if (!PRESERVE_IF_SET.has(key) && defaults[key] !== undefined) {
      // claves de infraestructura no listadas: tampoco pisar
    }
  }
  // Cabecera informativa solo si el archivo es nuevo
  let nextOrder = order;
  if (!existingText || !existingText.trim()) {
    nextOrder = [
      {
        type: "raw",
        value:
          "# LexOpen Desktop — datos del usuario. Las actualizaciones NO reescriben este archivo.",
      },
      { type: "raw", value: "# Puede editar LLM_*, S3_*, Google, etc. con seguridad." },
      { type: "raw", value: "" },
      ...Object.keys(defaults).map((key) => ({ type: "key", key })),
    ];
  }
  return {
    text: serializeEnv(map, nextOrder),
    map,
    added,
  };
}

function normalizeRemoteUrl(url) {
  const t = String(url || "").trim().replace(/\/+$/, "");
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) return `http://${t}`;
  return t;
}

/**
 * Garantiza .env mínimo para Host sin borrar secretos ni overrides del usuario.
 * STORAGE_PATH / vault siempre bajo dataDir (sobreviven al actualizar el .app/.exe).
 */
function ensureHostEnv(dataDir = defaultDataDir(), opts = {}) {
  ensureDir(dataDir);
  ensureDir(storageDir(dataDir));
  ensureDir(vaultDir(dataDir));

  const cfg = readConfig(dataDir);
  const port = Number(opts.port || cfg.port || 3000);
  const pgPort = Number(opts.pgPort || cfg.pgPort || 54329);
  const file = envPath(dataDir);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";

  const publicUrl =
    normalizeRemoteUrl(opts.publicUrl || cfg.publicUrl) ||
    `http://127.0.0.1:${port}`;

  const defaults = {
    DATABASE_URL: `postgresql://lexopen:lexopen@127.0.0.1:${pgPort}/lexopen`,
    SESSION_SECRET: crypto.randomBytes(24).toString("hex"),
    PORT: String(port),
    HOSTNAME: "0.0.0.0",
    LEXOPEN_DESKTOP: "1",
    LEXOPEN_DESKTOP_MODE: "host",
    LEXOPEN_DATA_DIR: dataDir,
    STORAGE_PATH: storageDir(dataDir),
    OBSIDIAN_VAULT_PATH: vaultDir(dataDir),
    LEXOPEN_DEMO_SWITCHER: opts.seedDemo || cfg.seedDemo ? "1" : "0",
    HERMES_ALLOW_DEMO: "0",
    LLM_ALLOW_DEMO: "1",
    PJUD_ALLOW_DEMO: "0",
    NEXT_PUBLIC_APP_NAME: "LexOpen",
    NEXT_PUBLIC_APP_URL: publicUrl,
    LEXOPEN_TRUSTED_ORIGINS: [
      publicUrl,
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
    ].join(","),
    LEXOPEN_BOOTSTRAP_TOKEN: crypto.randomBytes(32).toString("hex"),
    LEXOPEN_RECOVERY_TOKEN: crypto.randomBytes(32).toString("hex"),
    CRON_SECRET: crypto.randomBytes(24).toString("hex"),
    PJUD_SCRAPER_KEY: crypto.randomBytes(24).toString("hex"),
    PJUD_SCRAPER_URL: "http://127.0.0.1:8787",
    PJUD_SCRAPER_ALLOW_PRIVATE: "1",
  };

  const merged = mergeEnvPreserveUser(existing, defaults);
  let finalMap = merged.map;
  let finalText = merged.text;

  // Si STORAGE_PATH apunta dentro del instalador (se perdería al actualizar), corregir
  if (isUnsafeStoragePath(finalMap.STORAGE_PATH, dataDir)) {
    const forced = parseEnvFile(finalText);
    forced.map.STORAGE_PATH = storageDir(dataDir);
    finalMap = forced.map;
    finalText = serializeEnv(forced.map, forced.order);
  }

  if (finalText !== existing) {
    replaceFileAtomic(file, finalText);
  }

  return {
    dataDir,
    envFile: file,
    port: Number(finalMap.PORT || port),
    pgPort,
    databaseUrl: finalMap.DATABASE_URL,
    publicUrl: finalMap.NEXT_PUBLIC_APP_URL || publicUrl,
    storagePath: finalMap.STORAGE_PATH || storageDir(dataDir),
    addedKeys: merged.added,
    envPreserved: Boolean(existing.trim()),
  };
}

function localAppUrl(port = 3000) {
  return `http://127.0.0.1:${port}`;
}

function readPackageVersion(packageJsonPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

module.exports = {
  DEFAULTS,
  PRESERVE_IF_SET,
  defaultDataDir,
  ensureDir,
  configPath,
  envPath,
  appStatePath,
  storageDir,
  vaultDir,
  pgDataDir,
  readConfig,
  writeConfig,
  readAppState,
  recognizeAppVersion,
  parseEnvFile,
  serializeEnv,
  mergeEnvPreserveUser,
  normalizeRemoteUrl,
  ensureHostEnv,
  localAppUrl,
  readPackageVersion,
  isUnsafeStoragePath,
  replaceFileAtomic,
};
