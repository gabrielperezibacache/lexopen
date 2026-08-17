/**
 * Arranca Postgres embebido + migraciones + servidor Next.
 * Bind: 127.0.0.1 por defecto; 0.0.0.0 solo con URL pública no-local o LEXOPEN_BIND.
 * Datos/config del usuario viven en LEXOPEN_DATA_DIR (fuera del clon).
 */
import { createRequire } from "module";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "package.json"));
const {
  defaultDataDir,
  ensureHostEnv,
  readConfig,
  recognizeAppVersion,
  readPackageVersion,
  localAppUrl,
  pgDataDir,
  pgPasswordFromDatabaseUrl,
  isLegacyPgPassword,
  newPgPassword,
  rewriteDatabaseUrlPassword,
  writeEnvKey,
} = require("./config.cjs");

const repoRoot = process.env.LEXOPEN_APP_ROOT
  ? path.resolve(process.env.LEXOPEN_APP_ROOT)
  : path.resolve(__dirname, "..");
const prismaRoot = process.env.LEXOPEN_PRISMA_ROOT
  ? path.resolve(process.env.LEXOPEN_PRISMA_ROOT)
  : path.join(repoRoot, "prisma");

export function validateHostPorts(port, pgPort) {
  for (const [label, value] of [
    ["LexOpen", port],
    ["PostgreSQL", pgPort],
  ]) {
    if (!Number.isInteger(value) || value < 1024 || value > 65535) {
      throw new Error(`Puerto inválido para ${label}: ${value}`);
    }
  }
  if (port === pgPort) {
    throw new Error("El puerto de LexOpen y PostgreSQL debe ser distinto.");
  }
}

async function assertPortAvailable(port, label, host = "127.0.0.1") {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    const fail = (error) => {
      probe.close();
      if (error?.code === "EADDRINUSE") {
        reject(new Error(`El puerto ${port} (${label}) ya está en uso.`));
      } else {
        reject(error);
      }
    };
    probe.once("error", fail);
    probe.listen({ port, host, exclusive: true }, () => {
      probe.close((closeError) => (closeError ? reject(closeError) : resolve()));
    });
  });
}

function appVersion() {
  const fromEnv = process.env.LEXOPEN_APP_VERSION;
  if (fromEnv) return fromEnv;
  const desktopPkg = path.join(__dirname, "package.json");
  const rootPkg = path.join(repoRoot, "package.json");
  if (fs.existsSync(desktopPkg)) return readPackageVersion(desktopPkg);
  return readPackageVersion(rootPkg);
}

/** Load .env into process.env without overriding keys already set by the parent. */
export function loadEnvFile(file, targetEnv = process.env) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i);
    const value = trimmed.slice(i + 1);
    // Do not override env already set by systemd/launchd/parent process
    // (fail-closed demo flags from deploy units must win over a stale .env).
    if (targetEnv[key] === undefined) {
      targetEnv[key] = value;
    }
  }
}

/**
 * Production Host must never inherit CI/shell security relaxations
 * (e.g. LEXOPEN_RELAX_CSRF=1 from a developer machine or cloud agent).
 * Call after loadEnvFile so data-dir KEEP_* can still opt demos back in.
 */
export function applyHostFailClosedEnv(targetEnv = process.env) {
  for (const key of [
    "LEXOPEN_OPEN_ACCESS",
    "LEXOPEN_RELAX_CSRF",
    "LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS",
  ]) {
    targetEnv[key] = "0";
  }
  const demos = [
    ["LEXOPEN_DEMO_SWITCHER", "LEXOPEN_KEEP_DEMO_SWITCHER"],
    ["HERMES_ALLOW_DEMO", "LEXOPEN_KEEP_HERMES_DEMO"],
    ["LLM_ALLOW_DEMO", "LEXOPEN_KEEP_LLM_DEMO"],
    ["PJUD_ALLOW_DEMO", "LEXOPEN_KEEP_PJUD_DEMO"],
  ];
  for (const [flag, keep] of demos) {
    if (targetEnv[keep] !== "1") {
      targetEnv[flag] = "0";
    }
  }
  return targetEnv;
}

/**
 * Keys that define Host identity / secrets. The data-dir `.env` must win over
 * a polluted parent shell (e.g. CI DATABASE_URL pointing at lexopen_e2e).
 */
export const HOST_ENV_FILE_WINS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "STORAGE_PATH",
  "OBSIDIAN_VAULT_PATH",
  "PORT",
  "HOSTNAME",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_APP_NAME",
  "LEXOPEN_TRUSTED_ORIGINS",
  "LEXOPEN_BOOTSTRAP_TOKEN",
  "LEXOPEN_RECOVERY_TOKEN",
  "CRON_SECRET",
  "PJUD_SCRAPER_URL",
  "PJUD_SCRAPER_KEY",
  "PJUD_SCRAPER_ALLOW_PRIVATE",
  "LEXOPEN_DESKTOP",
  "LEXOPEN_DESKTOP_MODE",
  "LEXOPEN_DATA_DIR",
  "LEXOPEN_COOKIE_SECURE",
  "OBSIDIAN_ALLOW_PRIVATE_URL",
  "LEXOPEN_DEMO_SWITCHER",
  "HERMES_ALLOW_DEMO",
  "LLM_ALLOW_DEMO",
  "PJUD_ALLOW_DEMO",
  "LEXOPEN_OPEN_ACCESS",
  "LEXOPEN_RELAX_CSRF",
  "LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS",
  "LEXOPEN_KEEP_LLM_DEMO",
  "LEXOPEN_KEEP_DEMO_SWITCHER",
  "LEXOPEN_KEEP_HERMES_DEMO",
  "LEXOPEN_KEEP_PJUD_DEMO",
];

/** Overlay listed keys from an env file onto targetEnv (file wins). */
export function preferEnvFileKeys(
  file,
  keys = HOST_ENV_FILE_WINS,
  targetEnv = process.env
) {
  if (!fs.existsSync(file)) return targetEnv;
  const fromFile = {};
  loadEnvFile(file, fromFile);
  for (const key of keys) {
    if (fromFile[key] !== undefined) {
      targetEnv[key] = fromFile[key];
    }
  }
  return targetEnv;
}

/** Setup guidance that never embeds the bootstrap token. */
export function setupPendingMessage({
  isElectron = false,
  port = 3000,
} = {}) {
  if (isElectron) {
    return "[lexopen-host] Configuración inicial pendiente: abra /setup desde la app Desktop (el token no se imprime en logs).";
  }
  return (
    "[lexopen-host] Configuración inicial pendiente: abra http://127.0.0.1:" +
    port +
    "/setup y pegue LEXOPEN_BOOTSTRAP_TOKEN desde el archivo .env del data dir (el token no se imprime en logs)."
  );
}

async function migrateLegacyPgPassword(pg, dataDir, databaseUrl) {
  const current =
    pgPasswordFromDatabaseUrl(databaseUrl || process.env.DATABASE_URL || "") ||
    "lexopen";
  if (!isLegacyPgPassword(current)) {
    return { databaseUrl, rotated: false };
  }
  const next = newPgPassword();
  const client = typeof pg.getPgClient === "function" ? pg.getPgClient() : null;
  if (!client) {
    console.warn(
      "[lexopen-host] No se pudo rotar la contraseña legacy de Postgres (sin getPgClient)."
    );
    return { databaseUrl, rotated: false };
  }
  await client.connect();
  try {
    // Dollar-quote avoids injection / escaping issues with the random password.
    const tag = `pw${crypto.randomBytes(8).toString("hex")}`;
    await client.query(
      `ALTER USER lexopen WITH PASSWORD $${tag}$${next}$${tag}$`
    );
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
  const rewritten = rewriteDatabaseUrlPassword(
    databaseUrl || process.env.DATABASE_URL,
    next
  );
  writeEnvKey(dataDir, "DATABASE_URL", rewritten);
  process.env.DATABASE_URL = rewritten;
  console.log(
    "[lexopen-host] Contraseña Postgres legacy rotada (ya no usa el default lexopen)."
  );
  return { databaseUrl: rewritten, rotated: true };
}

async function startEmbeddedPostgres(dataDir, pgPort, databaseUrl) {
  const modPath =
    bundledModuleFile("embedded-postgres", "dist/index.js") ||
    require.resolve("embedded-postgres");
  const EmbeddedPostgres = (await import(pathToFileURL(modPath).href)).default;
  const databaseDir = pgDataDir(dataDir);
  const alreadyInitialized = fs.existsSync(path.join(databaseDir, "PG_VERSION"));
  // Prefer password from DATABASE_URL. Brand-new clusters may briefly use
  // "lexopen" only when URL has no password; migrateLegacyPgPassword rotates it.
  const password =
    pgPasswordFromDatabaseUrl(databaseUrl || process.env.DATABASE_URL || "") ||
    "lexopen";
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "lexopen",
    password,
    port: pgPort,
    persistent: true,
  });
  if (!alreadyInitialized) {
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase("lexopen");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already exists/i.test(msg)) {
      console.warn("[lexopen-host] createDatabase:", msg);
    }
  }
  await migrateLegacyPgPassword(pg, dataDir, databaseUrl);
  return pg;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || repoRoot,
      env: { ...process.env, ...opts.env },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} → exit ${code}`));
    });
  });
}

function bundledModuleFile(name, file) {
  const candidates = [
    process.resourcesPath
      ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", name, file)
      : null,
    path.join(__dirname, "node_modules", name, file),
    path.join(repoRoot, "node_modules", name, file),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

export function extraHostToolPathDirs(platform = process.platform) {
  if (platform === "darwin") return ["/opt/homebrew/bin", "/usr/local/bin"];
  if (platform === "win32") {
    return [
      "C:\\Program Files\\Tesseract-OCR",
      "C:\\Program Files (x86)\\Tesseract-OCR",
    ];
  }
  return [];
}

/** GUI / launchd PATH often omits Homebrew; pdfdown-ocr looks up `tesseract` on PATH. */
export function ensureHostToolPath(
  env = process.env,
  platform = process.platform
) {
  const dirs = extraHostToolPathDirs(platform).filter((dir) => fs.existsSync(dir));
  const pathKey =
    platform === "win32" && !env.PATH && env.Path ? "Path" : "PATH";
  const sep = platform === "win32" ? ";" : ":";
  const parts = String(env[pathKey] || "")
    .split(sep)
    .filter(Boolean);
  const seen = new Set(parts.map((part) => part.toLowerCase()));
  for (const dir of [...dirs].reverse()) {
    if (seen.has(dir.toLowerCase())) continue;
    parts.unshift(dir);
    seen.add(dir.toLowerCase());
  }
  env[pathKey] = parts.join(sep);
  if (platform === "win32") env.PATH = env[pathKey];
  return env[pathKey];
}

function runtimeEnv(env = {}) {
  return process.versions.electron
    ? { ...env, ELECTRON_RUN_AS_NODE: "1" }
    : env;
}

function runBundledTool(name, file, args, opts = {}) {
  const entry = bundledModuleFile(name, file);
  if (!entry) return null;
  return run(process.execPath, [entry, ...args], {
    ...opts,
    env: runtimeEnv(opts.env),
  });
}

function killChild(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        shell: true,
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.killed) return Promise.resolve();
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

async function migrate() {
  console.log(
    "[lexopen-host] Aplicando migraciones Prisma (migrate deploy; dev local usa db push solo en npm run setup)."
  );
  const schema = path.join(prismaRoot, "schema.prisma");
  const bundled = runBundledTool(
    "prisma",
    "build/index.js",
    ["migrate", "deploy", "--schema", schema],
    { cwd: repoRoot, env: { DATABASE_URL: process.env.DATABASE_URL } }
  );
  if (bundled) {
    await bundled;
    return;
  }
  await run("npx", ["prisma", "migrate", "deploy", "--schema", schema], {
    cwd: repoRoot,
    env: { DATABASE_URL: process.env.DATABASE_URL },
  });
}

async function maybeSeed(seedDemo, dataDir) {
  if (!seedDemo) return;
  const marker = path.join(dataDir, ".seeded");
  if (fs.existsSync(marker)) {
    console.log("[lexopen-host] Seed demo ya aplicado — no se vuelve a ejecutar.");
    return;
  }
  const bundled = runBundledTool("tsx", "dist/cli.mjs", ["prisma/seed.ts"], {
    cwd: repoRoot,
    env: { DATABASE_URL: process.env.DATABASE_URL },
  });
  if (bundled) await bundled;
  else await run("npx", ["tsx", "prisma/seed.ts"]);
  fs.writeFileSync(marker, new Date().toISOString(), "utf8");
}

function resolveServerEntry() {
  const packaged = path.join(repoRoot, "server.js");
  if (fs.existsSync(packaged)) return { type: "standalone", entry: packaged };
  const standalone = path.join(repoRoot, ".next", "standalone", "server.js");
  if (fs.existsSync(standalone)) return { type: "standalone", entry: standalone };
  return { type: "next", entry: null };
}

function copyDirIfDistinct(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (path.resolve(src) === path.resolve(dest)) return fs.existsSync(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  return true;
}

/**
 * Next standalone does not include `.next/static` or `public`. After a clone
 * build they live next to standalone; copy them in so CSS/JS resolve.
 */
export function ensureStandaloneStaticAssets(entry, appRoot = repoRoot) {
  const standaloneDir = path.dirname(entry);
  const destStatic = path.join(standaloneDir, ".next", "static");
  const destPublic = path.join(standaloneDir, "public");
  const srcStatic = path.join(appRoot, ".next", "static");
  const srcPublic = path.join(appRoot, "public");

  copyDirIfDistinct(srcStatic, destStatic);
  copyDirIfDistinct(srcPublic, destPublic);

  if (!fs.existsSync(destStatic)) {
    throw new Error(
      "Faltan los estilos de Next (.next/static). En el clon ejecute: npm run desktop:build"
    );
  }
  return destStatic;
}

function sameNpmPackageVersion(src, dest) {
  try {
    const a = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8"));
    const b = JSON.parse(fs.readFileSync(path.join(dest, "package.json"), "utf8"));
    return Boolean(a.version && a.version === b.version);
  } catch {
    return false;
  }
}

const STANDALONE_PLAYWRIGHT_PACKAGES = ["playwright", "playwright-core"];

/**
 * Next standalone traces a subset of node_modules. Dynamic `import("playwright")`
 * is often omitted, so ClaveÚnica/OJV scrape fails even after `npm ci`.
 */
export function ensureStandalonePlaywright(entry, appRoot = repoRoot) {
  const standaloneDir = path.dirname(entry);
  const destNm = path.join(standaloneDir, "node_modules");
  let copied = 0;
  for (const name of STANDALONE_PLAYWRIGHT_PACKAGES) {
    const src = path.join(appRoot, "node_modules", name);
    const dest = path.join(destNm, name);
    if (!fs.existsSync(src)) continue;
    if (!sameNpmPackageVersion(src, dest)) {
      copyDirIfDistinct(src, dest);
    }
    copied += 1;
  }
  return copied;
}

export function repoNodePath(appRoot = repoRoot, existing = "") {
  const extra = path.join(appRoot, "node_modules");
  const parts = String(existing || "")
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes(extra)) parts.unshift(extra);
  return parts.join(path.delimiter);
}

/** @deprecated Use ensureStandaloneStaticAssets */
export function assertStandaloneStaticAssets(entry, appRoot = repoRoot) {
  return ensureStandaloneStaticAssets(entry, appRoot);
}

function startNextServer(port, bindHost = "127.0.0.1") {
  const resolved = resolveServerEntry();
  const host = bindHost || "127.0.0.1";
  const env = runtimeEnv({
    ...process.env,
    PORT: String(port),
    HOSTNAME: host,
    NODE_ENV: "production",
  });

  if (resolved.type === "standalone") {
    ensureStandaloneStaticAssets(resolved.entry, repoRoot);
    const pwCopied = ensureStandalonePlaywright(resolved.entry, repoRoot);
    env.LEXOPEN_APP_ROOT = repoRoot;
    env.NODE_PATH = repoNodePath(repoRoot, env.NODE_PATH);
    if (pwCopied === 0) {
      console.warn(
        "[lexopen-host] Falta el paquete playwright. En el clon: npm ci && npm run pjud:chromium"
      );
    }
    console.log("[lexopen-host] Usando Next standalone:", resolved.entry);
    return spawn(process.execPath, [resolved.entry], {
      cwd: path.dirname(resolved.entry),
      env,
      stdio: "inherit",
    });
  }

  console.log(
    "[lexopen-host] Usando `next start` (empaquetado: LEXOPEN_STANDALONE=1 npm run build)."
  );
  if (process.versions.electron) {
    throw new Error("Falta .next/standalone/server.js. Ejecute `npm run desktop:build` o `npm run web:host`.");
  }
  return spawn("npx", ["next", "start", "-H", host, "-p", String(port)], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

async function waitForHealth(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${url}/api/health`, { redirect: "error" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok === true) {
        return { ok: true, needsSetup: Boolean(body.needsSetup) };
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, needsSetup: false };
}

export async function startHost(options = {}) {
  const dataDir = options.dataDir || defaultDataDir();
  process.env.LEXOPEN_DATA_DIR = dataDir;

  const cfg = readConfig(dataDir);
  const port = Number(options.port || process.env.PORT || cfg.port || 3000);
  const pgPort = Number(options.pgPort || process.env.LEXOPEN_PG_PORT || cfg.pgPort || 54329);
  validateHostPorts(port, pgPort);
  // seed solo si ya estaba guardado en config; no forzar en cada update
  const seedDemo = Boolean(
    options.seedDemo !== undefined ? options.seedDemo : cfg.seedDemo
  );
  const publicUrl =
    options.publicUrl !== undefined ? options.publicUrl : cfg.publicUrl || "";

  const version = appVersion();
  process.env.LEXOPEN_APP_VERSION = version;

  // Reconocer actualización de inmediato (app-state.json), sin tocar desktop-config/.env
  const recognition = recognizeAppVersion(version, dataDir);
  process.env.LEXOPEN_APP_VERSION = version;
  process.env.LEXOPEN_UPDATE_RECOGNIZED = recognition.changed ? "1" : "0";
  if (recognition.previousVersion) {
    process.env.LEXOPEN_PREVIOUS_APP_VERSION = recognition.previousVersion;
  }
  if (recognition.changed) {
    console.log(
      `[lexopen-host] Actualización reconocida: ${recognition.previousVersion} → ${recognition.currentVersion}`
    );
  } else if (recognition.firstRun) {
    console.log(`[lexopen-host] Primera ejecución · v${version}`);
  } else {
    console.log(`[lexopen-host] Versión activa v${version} (datos preservados)`);
  }

  const host = ensureHostEnv(dataDir, { port, pgPort, seedDemo, publicUrl });
  loadEnvFile(host.envFile);
  // Data-dir .env owns Host identity (never migrate/serve against a shell DATABASE_URL).
  preferEnvFileKeys(host.envFile, HOST_ENV_FILE_WINS, process.env);
  // Strip CI/shell relaxations that would fail instrumentation in NODE_ENV=production.
  applyHostFailClosedEnv(process.env);
  ensureHostToolPath(process.env);
  // Reafirmar tras cargar .env (el archivo no debe pisar la versión del binario)
  process.env.LEXOPEN_APP_VERSION = version;
  process.env.LEXOPEN_DATA_DIR = dataDir;
  process.env.DATABASE_URL = host.databaseUrl || process.env.DATABASE_URL;
  process.env.PORT = String(host.port);
  process.env.HOSTNAME = host.bindHost || process.env.HOSTNAME || "127.0.0.1";
  process.env.STORAGE_PATH = host.storagePath || process.env.STORAGE_PATH;
  process.env.LEXOPEN_UPDATE_RECOGNIZED = recognition.changed ? "1" : "0";
  if (host.envPreserved) {
    console.log(
      "[lexopen-host] .env existente preservado (solo se completaron claves faltantes:",
      host.addedKeys.length ? host.addedKeys.join(", ") : "ninguna",
      ")"
    );
  }

  const bindHost = host.bindHost || process.env.HOSTNAME || "127.0.0.1";
  console.log("[lexopen-host] Datos en", dataDir);
  console.log("[lexopen-host] Postgres :", host.pgPort, "·", pgDataDir(dataDir));
  console.log("[lexopen-host] Storage  :", host.storagePath);
  console.log("[lexopen-host] App      :", localAppUrl(host.port), `(bind ${bindHost})`);
  if (host.publicUrl) {
    console.log("[lexopen-host] URL pública:", host.publicUrl);
  }

  let pg = null;
  let child = null;
  try {
    await assertPortAvailable(pgPort, "PostgreSQL");
    pg = await startEmbeddedPostgres(dataDir, pgPort, host.databaseUrl);
    await migrate();
    await maybeSeed(seedDemo, dataDir);
    await assertPortAvailable(host.port, "LexOpen", bindHost);

    child = startNextServer(host.port, bindHost);
    const url = localAppUrl(host.port);
    const health = await waitForHealth(url);
    if (!health.ok) {
      throw new Error("[lexopen-host] Health check falló; el servidor no está listo.");
    }
    const needsSetup = health.needsSetup;
    const bootstrapToken = needsSetup
      ? process.env.LEXOPEN_BOOTSTRAP_TOKEN || ""
      : null;
    const recoveryToken = process.env.LEXOPEN_RECOVERY_TOKEN || "";
    if (needsSetup && !bootstrapToken) {
      throw new Error(
        "[lexopen-host] No hay token de configuración inicial; revise el archivo .env del Host."
      );
    }
    if (needsSetup) {
      console.log(
        setupPendingMessage({
          isElectron: Boolean(process.versions.electron),
          port: host.port,
        })
      );
    }

    let hostSchedulers = null;
    try {
      const schedulersModule = path.join(
        repoRoot,
        "scripts",
        "local-host-schedulers.mjs"
      );
      if (fs.existsSync(schedulersModule)) {
        const { startLocalHostSchedulers } = await import(
          pathToFileURL(schedulersModule).href
        );
        hostSchedulers = await startLocalHostSchedulers({
          baseUrl: url,
          env: process.env,
          logPrefix: "lexopen-host",
          alreadyHealthy: true,
        });
      } else {
        console.warn(
          "[lexopen-host] scripts/local-host-schedulers.mjs no empaquetado; schedulers locales omitidos."
        );
      }
    } catch (e) {
      console.warn(
        "[lexopen-host] No se pudieron iniciar schedulers locales:",
        e instanceof Error ? e.message : e
      );
    }

    let stopPromise = null;
    const stop = async () => {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        try {
          hostSchedulers?.stop?.();
        } catch (e) {
          console.warn("[lexopen-host] schedulers.stop:", e);
        }
        await stopChild(child);
        try {
          await pg.stop();
        } catch (e) {
          console.warn("[lexopen-host] pg.stop:", e);
        }
      })();
      return stopPromise;
    };

    return {
      url,
      publicUrl: host.publicUrl,
      port: host.port,
      stop,
      child,
      dataDir,
      version,
      needsSetup,
      bootstrapToken,
      recoveryToken,
      updateRecognized: recognition.changed,
      previousVersion: recognition.previousVersion,
    };
  } catch (error) {
    await stopChild(child);
    if (pg) await pg.stop().catch(() => undefined);
    throw error;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let hostHandle;
  const shutdown = () =>
    Promise.resolve(hostHandle?.stop?.())
      .catch((e) => console.warn("[lexopen-host] shutdown:", e))
      .finally(() => process.exit(0));
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  startHost()
    .then((handle) => {
      hostHandle = handle;
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
