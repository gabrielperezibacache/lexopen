/**
 * Preferencias host/cliente (persistidas en userData de Electron o LEXOPEN_DATA_DIR).
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
  publicUrl: "", // URL Tailscale mostrada / anunciada
};

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

function readConfig(dataDir = defaultDataDir()) {
  ensureDir(dataDir);
  const file = configPath(dataDir);
  if (!fs.existsSync(file)) return { ...DEFAULTS, dataDir };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...DEFAULTS, ...raw, dataDir };
  } catch {
    return { ...DEFAULTS, dataDir };
  }
}

function writeConfig(partial, dataDir = defaultDataDir()) {
  ensureDir(dataDir);
  const next = { ...readConfig(dataDir), ...partial, dataDir };
  delete next.dataDir;
  fs.writeFileSync(configPath(dataDir), JSON.stringify(next, null, 2), "utf8");
  return { ...next, dataDir };
}

function normalizeRemoteUrl(url) {
  const t = String(url || "").trim().replace(/\/+$/, "");
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) return `http://${t}`;
  return t;
}

function ensureHostEnv(dataDir = defaultDataDir(), opts = {}) {
  ensureDir(dataDir);
  const cfg = readConfig(dataDir);
  const port = Number(opts.port || cfg.port || 3000);
  const pgPort = Number(opts.pgPort || cfg.pgPort || 54329);
  const file = envPath(dataDir);
  let secret = crypto.randomBytes(24).toString("hex");
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, "utf8");
    const m = existing.match(/^SESSION_SECRET=(.+)$/m);
    if (m?.[1]) secret = m[1].trim();
  }
  const dbUrl = `postgresql://lexopen:lexopen@127.0.0.1:${pgPort}/lexopen`;
  const publicUrl =
    normalizeRemoteUrl(opts.publicUrl || cfg.publicUrl) ||
    `http://127.0.0.1:${port}`;
  const lines = [
    `# Generado por LexOpen Desktop — no subir a git`,
    `DATABASE_URL=${dbUrl}`,
    `SESSION_SECRET=${secret}`,
    `PORT=${port}`,
    `HOSTNAME=0.0.0.0`,
    `LEXOPEN_DESKTOP=1`,
    `LEXOPEN_DESKTOP_MODE=host`,
    `LEXOPEN_DEMO_SWITCHER=${opts.seedDemo || cfg.seedDemo ? "1" : "0"}`,
    `HERMES_ALLOW_DEMO=0`,
    `LLM_ALLOW_DEMO=1`,
    `NEXT_PUBLIC_APP_NAME=LexOpen`,
    `NEXT_PUBLIC_APP_URL=${publicUrl}`,
    cfg.publicUrl || opts.publicUrl
      ? `LEXOPEN_TRUSTED_ORIGINS=${[
          publicUrl,
          `http://127.0.0.1:${port}`,
          `http://localhost:${port}`,
        ].join(",")}`
      : `LEXOPEN_TRUSTED_ORIGINS=http://127.0.0.1:${port},http://localhost:${port}`,
  ];
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
  return { dataDir, envFile: file, port, pgPort, databaseUrl: dbUrl, publicUrl };
}

function localAppUrl(port = 3000) {
  return `http://127.0.0.1:${port}`;
}

module.exports = {
  DEFAULTS,
  defaultDataDir,
  ensureDir,
  configPath,
  envPath,
  readConfig,
  writeConfig,
  normalizeRemoteUrl,
  ensureHostEnv,
  localAppUrl,
};
