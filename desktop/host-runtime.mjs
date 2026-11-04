/**
 * Arranca Postgres embebido + migraciones + servidor Next.
 * Bind: 127.0.0.1 por defecto; 0.0.0.0 solo con URL pública no-local o LEXOPEN_BIND.
 * Datos/config del usuario viven en LEXOPEN_DATA_DIR (fuera del clon).
 */
import { createRequire } from "module";
import { spawn, spawnSync } from "child_process";
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
  readAppState,
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
  const desktopPkg = path.join(__dirname, "package.json");
  if (packagedHost() && fs.existsSync(desktopPkg)) return readPackageVersion(desktopPkg);
  const fromEnv = process.env.LEXOPEN_APP_VERSION;
  if (fromEnv) return fromEnv;
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

let postgresInitialization = Promise.resolve();
const safeLifecycleFailure = Symbol("safeLifecycleFailure");
const hostLifecyclePhases = new Set(["PG_INIT", "PG_START", "MIGRATION", "NEXT_START", "HEALTH"]);
const postgresDiagnostics = new Set(["INVALID_LOCALE", "ACCESS_DENIED", "DLL_MISSING", "BINARY_LOOKUP", "UNKNOWN"]);

/** Classify transient input without retaining or printing PostgreSQL output. */
export function classifyPostgresDiagnostic(value) {
  const code = typeof value?.code === "string" ? value.code : "";
  const message = typeof value === "string" ? value : typeof value?.message === "string" ? value.message : "";
  const text = message.slice(0, 16_384);
  if (/invalid (?:locale|value.*lc_messages)|locale[^\r\n]{0,120}(?:not supported|not recognized|not found)|lc_messages[^\r\n]{0,120}(?:invalid|not supported)/i.test(text)) return "INVALID_LOCALE";
  if (["EACCES", "EPERM"].includes(code) || /permission denied|access (?:is )?denied|acceso denegado|operation not permitted/i.test(text)) return "ACCESS_DENIED";
  if (/0xc0000135|(?:dll|dynamic link library)[^\r\n]{0,120}(?:not found|missing|could not|failed)|(?:could not|cannot|failed to) load[^\r\n]{0,120}(?:library|module)|specified module could not be found/i.test(text)) return "DLL_MISSING";
  if (["ENOENT", "MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"].includes(code) || /cannot find (?:module|package)|no (?:supported|compatible) (?:architecture|binary)|(?:could not|cannot|failed to) find[^\r\n]{0,120}(?:binar|executable)/i.test(text)) return "BINARY_LOOKUP";
  return "UNKNOWN";
}

function lifecycleFailure(phase, diagnostic) {
  if (!hostLifecyclePhases.has(phase)) throw new Error("Invalid Host lifecycle diagnostic phase");
  diagnostic = postgresDiagnostics.has(diagnostic) ? diagnostic : "UNKNOWN";
  const code = phase.startsWith("PG_") ? `${phase}_${diagnostic}` : phase;
  const error = new Error(`No se completó el inicio del Host (${code}).`);
  Object.assign(error, { code, phase, ...(phase.startsWith("PG_") ? { diagnostic } : {}) });
  Object.defineProperty(error, safeLifecycleFailure, { value: true });
  return error;
}

async function duringHostPhase(phase, work, diagnostic = () => "UNKNOWN") {
  try { return await work(); }
  catch (error) {
    if (error?.[safeLifecycleFailure]) throw error;
    const fromError = classifyPostgresDiagnostic(error);
    throw lifecycleFailure(phase, fromError === "UNKNOWN" ? diagnostic() : fromError);
  }
}

/** embedded-postgres writes its init password into os.tmpdir(); contain it. */
export function withPrivatePostgresTemp(dataDir, work) {
  const pending = postgresInitialization.then(async () => {
    const temporary = fs.mkdtempSync(path.join(fs.realpathSync(dataDir), ".postgres-init-"));
    fs.chmodSync(temporary, 0o700);
    const keys = ["TMPDIR", "TMP", "TEMP"];
    const previous = new Map(keys.map(key => [key, process.env[key]]));
    const previousMask = process.umask(0o077);
    for (const key of keys) process.env[key] = temporary;
    try { return await work(); }
    finally {
      for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      process.umask(previousMask);
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
  postgresInitialization = pending.then(() => undefined, () => undefined);
  return pending;
}

export async function startEmbeddedPostgres(dataDir, pgPort, databaseUrl, overrides = {}) {
  const databaseDir = pgDataDir(dataDir);
  const alreadyInitialized = fs.existsSync(path.join(databaseDir, "PG_VERSION"));
  const preparationPhase = alreadyInitialized ? "PG_START" : "PG_INIT";
  const EmbeddedPostgres = await duringHostPhase(preparationPhase, async () => {
    if (overrides.EmbeddedPostgres) return overrides.EmbeddedPostgres;
    const modPath = bundledModuleFile("embedded-postgres", "dist/index.js") || require.resolve("embedded-postgres");
    return (await import(pathToFileURL(modPath).href)).default;
  });
  // Prefer password from DATABASE_URL. Brand-new clusters may briefly use
  // "lexopen" only when URL has no password; migrateLegacyPgPassword rotates it.
  const password =
    pgPasswordFromDatabaseUrl(databaseUrl || process.env.DATABASE_URL || "") ||
    "lexopen";
  let diagnostic = "UNKNOWN";
  const classifyLog = value => {
    const classified = classifyPostgresDiagnostic(value);
    if (classified !== "UNKNOWN") diagnostic = classified;
  };
  const pg = await duringHostPhase(preparationPhase, () => new EmbeddedPostgres({
    databaseDir,
    user: "lexopen",
    password,
    port: pgPort,
    persistent: true,
    // The dependency defaults to console.log/error. Keep only a fixed enum;
    // logs can contain passwords, data paths or full connection strings.
    onLog: classifyLog,
    onError: classifyLog,
  }));
  if (!alreadyInitialized) {
    await duringHostPhase("PG_INIT", () => withPrivatePostgresTemp(dataDir, () => pg.initialise()), () => diagnostic);
  }
  diagnostic = "UNKNOWN";
  await duringHostPhase("PG_START", () => pg.start(), () => diagnostic);
  try {
    await pg.createDatabase("lexopen");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already exists/i.test(msg)) {
      console.warn("[lexopen-host] createDatabase: PG_START_UNKNOWN");
    }
  }
  await duringHostPhase("PG_START", () => migrateLegacyPgPassword(pg, dataDir, databaseUrl), () => diagnostic);
  return pg;
}

export function toolUsesShell(command, platform = process.platform) {
  return platform === "win32" && /^(?:npm|npx)(?:\.cmd)?$/i.test(command);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || repoRoot,
      env: { ...process.env, ...opts.env },
      stdio: "inherit",
      shell: opts.shell ?? toolUsesShell(cmd),
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} → exit ${code}`));
    });
  });
}

export function hostResourcesPath() {
  const inferred = path.basename(__dirname) === "app.asar.unpacked" ? path.dirname(__dirname) : null;
  return [process.resourcesPath, inferred, process.env.LEXOPEN_RESOURCES_PATH]
    .filter(Boolean).find(directory => fs.existsSync(path.join(directory, "app.asar"))) || null;
}

function packagedHost() { return process.env.LEXOPEN_PACKAGED === "1" || Boolean(hostResourcesPath()); }

function bundledModuleFile(name, file) {
  const resources = hostResourcesPath();
  const candidates = [
    resources
      ? path.join(resources, "app.asar.unpacked", "node_modules", name, file)
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
    shell: false,
  });
}

export function readPostgresPid(dataDir) {
  try {
    const pid = Number(fs.readFileSync(path.join(pgDataDir(dataDir), "postmaster.pid"), "utf8").split(/\r?\n/)[0]);
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("Identidad de PostgreSQL inválida.");
    return pid;
  } catch (error) { if (error.code === "ENOENT") return null; throw new Error("No se pudo comprobar la identidad de PostgreSQL antes del respaldo."); }
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== "ESRCH"; }
}

async function portListening(port, host) {
  return new Promise(resolve => {
    const socket = net.createConnection({ port, host }); let settled = false;
    const finish = value => { if (settled) return; settled = true; socket.destroy(); resolve(value); };
    socket.setTimeout(700, () => finish(true)); // Unknown state is unsafe to copy.
    socket.once("connect", () => finish(true));
    socket.once("error", error => finish(!["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "EAFNOSUPPORT"].includes(error.code)));
  });
}

/** Read-only PID and TCP checks; no PostgreSQL credentials or protocol queries. */
export async function assertHostStopped({ dataDir, port, pgPort, child, postgresPid }, probes = {}) {
  const isAlive = probes.processAlive || processAlive, listening = probes.portListening || portListening;
  if (child?.pid && isAlive(child.pid)) throw new Error("El proceso del Host sigue activo. No es seguro crear el respaldo.");
  const pids = [postgresPid, readPostgresPid(dataDir)].filter(Boolean);
  if (pids.some(pid => isAlive(pid))) throw new Error("PostgreSQL sigue activo. No se creará un respaldo de sus archivos en uso.");
  for (const value of [...new Set([port, pgPort])]) {
    if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error("No se pudo comprobar el puerto del Host antes del respaldo.");
    for (const host of ["127.0.0.1", "::1"]) if (await listening(value, host)) throw new Error("Un servicio del Host sigue escuchando. El respaldo y la actualización quedan bloqueados.");
  }
}

function signalChild(child, signal) {
  if (signal === "SIGTERM" && child.connected && typeof child.send === "function") {
    child.send({ type: "lexopen:stop" });
  } else if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", shell: false, windowsHide: true });
    killer.on("error", () => {});
  } else child.kill(signal);
}

/** A sent signal is not an exit. Resolve only after exit, or reject after both deadlines. */
export function stopChild(child, { graceMs = 10_000, forceMs = 5_000, signalProcess = signalChild, requireCleanExit = false } = {}) {
  if (!child) return Promise.resolve();
  if (child.exitCode != null || child.signalCode != null) return requireCleanExit && child.exitCode !== 0 ? Promise.reject(new Error("El Host no confirmó una salida limpia.")) : Promise.resolve();
  return new Promise((resolve, reject) => {
    let forceTimer, finished = false;
    const done = error => {
      if (finished) return; finished = true; clearTimeout(graceTimer); clearTimeout(forceTimer);
      child.removeListener("exit", exit); child.removeListener("error", fail);
      if (error) reject(error); else resolve();
    };
    const exit = code => done(requireCleanExit && code !== 0 ? new Error("El Host no confirmó una salida limpia; no se hará el respaldo.") : undefined), fail = () => done(new Error("No se pudo detener y comprobar el proceso del Host."));
    const graceTimer = setTimeout(() => {
      try { signalProcess(child, "SIGKILL"); } catch { /* The exit deadline still decides. */ }
      forceTimer = setTimeout(() => done(new Error("El proceso no confirmó su salida; no se realizará el respaldo.")), forceMs);
    }, graceMs);
    child.once("exit", exit); child.once("error", fail);
    try { signalProcess(child, "SIGTERM"); } catch { fail(); }
  });
}

async function boundedStop(operation, label, timeoutMs = 15_000) {
  let timer;
  try { return await Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} no confirmó su parada dentro del límite.`)), timeoutMs); })]); }
  finally { clearTimeout(timer); }
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
  if (packagedHost()) throw new Error("Falta Prisma en el instalador de LexOpen. Reinstale una versión completa; no se descargará un runtime con npx.");
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
  else {
    if (packagedHost()) throw new Error("Falta TSX en el instalador de LexOpen; no se descargará un runtime con npx.");
    await run("npx", ["tsx", "prisma/seed.ts"]);
  }
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

async function waitForHealth(url, expected = {}, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${url}/api/health`, { redirect: "error" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok === true && body.db === "up" && (!expected.version || body.version === expected.version) && (!expected.buildId || body.buildId === expected.buildId)) {
        return { ok: true, needsSetup: Boolean(body.needsSetup) };
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, needsSetup: false };
}

export function previewAppVersion(version, dataDir) {
  const previous = readAppState(dataDir);
  return { changed: Boolean(version) && previous.lastAppVersion !== null && previous.lastAppVersion !== version, firstRun: !previous.lastAppVersion, previousVersion: previous.lastAppVersion, currentVersion: version };
}

export function readHostBuildIdentity(appRoot = repoRoot) {
  const metadataFile = path.join(appRoot, "lexopen-release.json");
  const metadata = fs.existsSync(metadataFile) ? JSON.parse(fs.readFileSync(metadataFile, "utf8")) : {};
  const buildFile = [path.join(appRoot, ".next", "BUILD_ID"), path.join(appRoot, ".next", "standalone", ".next", "BUILD_ID")].find(file => fs.existsSync(file));
  const buildId = buildFile ? fs.readFileSync(buildFile, "utf8").trim() : null;
  if (buildId && !/^[\w.-]{1,256}$/.test(buildId)) throw new Error("La identidad de compilación de LexOpen no es válida.");
  if (metadata.buildId && metadata.buildId !== buildId) throw new Error("Los recursos del instalador no corresponden a su compilación.");
  let sourceRevision = typeof metadata.sourceRevision === "string" && /^[a-f0-9]{40,64}$/.test(metadata.sourceRevision) ? metadata.sourceRevision : null;
  if (!sourceRevision && !packagedHost()) {
    const revision = spawnSync("git", ["-C", appRoot, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: false });
    if (revision.status === 0 && /^[a-f0-9]{40,64}$/.test(revision.stdout.trim())) sourceRevision = revision.stdout.trim();
  }
  return { buildId, sourceRevision };
}

export function embeddedDatabasePort(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("El Host embebido requiere una base PostgreSQL local; no se iniciarán migraciones contra otra máquina.");
  const port = Number(url.port || 5432);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Puerto inválido para la base PostgreSQL embebida.");
  return port;
}

/** Lifecycle overrides are an internal seam for offline startup/rollback tests. */
export async function startHost(options = {}, overrides = {}) {
  const lifecycle = { assertPortAvailable, startEmbeddedPostgres, migrate, maybeSeed, startNextServer, waitForHealth, stopChild, assertHostStopped, ...overrides };
  const dataDir = options.dataDir || defaultDataDir();
  process.env.LEXOPEN_DATA_DIR = dataDir;

  const cfg = readConfig(dataDir);
  const port = Number(options.port || process.env.PORT || cfg.port || 3000);
  let pgPort = Number(options.pgPort || process.env.LEXOPEN_PG_PORT || cfg.pgPort || 54329);
  validateHostPorts(port, pgPort);
  // seed solo si ya estaba guardado en config; no forzar en cada update
  const seedDemo = Boolean(
    options.seedDemo !== undefined ? options.seedDemo : cfg.seedDemo
  );
  const publicUrl =
    options.publicUrl !== undefined ? options.publicUrl : cfg.publicUrl || "";

  const version = appVersion();
  process.env.LEXOPEN_APP_VERSION = version;

  // Expose the candidate version for health, but commit it only after startup succeeds.
  const recognition = previewAppVersion(version, dataDir);
  process.env.LEXOPEN_APP_VERSION = version;
  process.env.LEXOPEN_UPDATE_RECOGNIZED = recognition.changed ? "1" : "0";
  if (recognition.previousVersion) {
    process.env.LEXOPEN_PREVIOUS_APP_VERSION = recognition.previousVersion;
  }
  if (recognition.changed) {
    console.log(
      `[lexopen-host] Preparando actualización: ${recognition.previousVersion} → ${recognition.currentVersion}`
    );
  } else if (recognition.firstRun) {
    console.log(`[lexopen-host] Preparando primera ejecución · v${version}`);
  } else {
    console.log(`[lexopen-host] Preparando Host v${version} (datos preservados)`);
  }

  const host = ensureHostEnv(dataDir, { port, pgPort, seedDemo, publicUrl });
  loadEnvFile(host.envFile);
  // Data-dir .env owns Host identity (never migrate/serve against a shell DATABASE_URL).
  preferEnvFileKeys(host.envFile, HOST_ENV_FILE_WINS, process.env);
  // Strip CI/shell relaxations that would fail instrumentation in NODE_ENV=production.
  applyHostFailClosedEnv(process.env);
  ensureHostToolPath(process.env);
  const identity = overrides.buildIdentity || readHostBuildIdentity(repoRoot);
  process.env.LEXOPEN_BUILD_ID = identity.buildId || "";
  process.env.LEXOPEN_SOURCE_REVISION = identity.sourceRevision || "";
  if (packagedHost()) {
    const browsers = path.join(repoRoot, "playwright-browsers");
    if (!fs.existsSync(browsers)) throw new Error("Falta Chromium en los recursos del instalador de LexOpen.");
    process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;
  }
  // Reafirmar tras cargar .env (el archivo no debe pisar la versión del binario)
  process.env.LEXOPEN_APP_VERSION = version;
  process.env.LEXOPEN_DATA_DIR = dataDir;
  process.env.DATABASE_URL = host.databaseUrl || process.env.DATABASE_URL;
  process.env.PORT = String(host.port);
  process.env.HOSTNAME = host.bindHost || process.env.HOSTNAME || "127.0.0.1";
  process.env.STORAGE_PATH = host.storagePath || process.env.STORAGE_PATH;
  pgPort = embeddedDatabasePort(host.databaseUrl);
  host.pgPort = pgPort;
  validateHostPorts(host.port, pgPort);
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
  let nextStartupError = null, nextStartupFailure;
  let unwatchNextStartup = () => {};
  try {
    await duringHostPhase("PG_START", () => lifecycle.assertPortAvailable(pgPort, "PostgreSQL"));
    pg = await duringHostPhase("PG_START", () => lifecycle.startEmbeddedPostgres(dataDir, pgPort, host.databaseUrl));
    await duringHostPhase("MIGRATION", () => lifecycle.migrate());
    await duringHostPhase("MIGRATION", () => lifecycle.maybeSeed(seedDemo, dataDir));
    await duringHostPhase("NEXT_START", () => lifecycle.assertPortAvailable(host.port, "LexOpen", bindHost));

    child = await duringHostPhase("NEXT_START", () => {
      const started = lifecycle.startNextServer(host.port, bindHost);
      // spawn errors are emitted asynchronously; observe them before awaiting
      // anything so a failed launch remains NEXT_START rather than a timeout.
      if (typeof started?.once === "function") {
        nextStartupFailure = new Promise((_resolve, reject) => {
          const failed = () => { nextStartupError = lifecycleFailure("NEXT_START"); reject(nextStartupError); };
          started.once("error", failed);
          unwatchNextStartup = () => started.removeListener("error", failed);
        });
        void nextStartupFailure.catch(() => undefined);
      }
      return started;
    });
    const url = localAppUrl(host.port);
    const health = await duringHostPhase("HEALTH", async () => {
      if (nextStartupError) throw nextStartupError;
      const pending = lifecycle.waitForHealth(url, { version, buildId: identity.buildId });
      const result = await (nextStartupFailure ? Promise.race([pending, nextStartupFailure]) : pending);
      if (nextStartupError) throw nextStartupError;
      if (!result?.ok) throw new Error("Host health unavailable");
      return result;
    });
    unwatchNextStartup();
    const needsSetup = health.needsSetup;
    const bootstrapToken = needsSetup
      ? process.env.LEXOPEN_BOOTSTRAP_TOKEN || ""
      : null;
    const recoveryToken = process.env.LEXOPEN_RECOVERY_TOKEN || "";
    if (needsSetup && !bootstrapToken) {
      throw lifecycleFailure("HEALTH");
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
      if (overrides.startSchedulers) {
        hostSchedulers = await overrides.startSchedulers();
      } else if (fs.existsSync(schedulersModule)) {
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
        const errors = [], postgresPid = readPostgresPid(dataDir);
        try { await boundedStop(() => Promise.resolve(hostSchedulers?.stop?.()), "El programador"); } catch (error) { errors.push(error); }
        try { await lifecycle.stopChild(child); } catch (error) { errors.push(error); }
        try { await boundedStop(() => pg.stop(), "PostgreSQL"); } catch (error) { errors.push(error); }
        try { await lifecycle.assertHostStopped({ dataDir, port: host.port, pgPort, child, postgresPid }); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, "No se confirmó una parada completa del Host. El respaldo y la instalación quedan bloqueados.");
      })();
      try { return await stopPromise; } catch (error) { stopPromise = null; throw error; }
    };

    recognizeAppVersion(version, dataDir);
    console.log(`[lexopen-host] Host verificado · versión aplicada v${version}`);
    return {
      url,
      publicUrl: host.publicUrl,
      port: host.port,
      stop,
      child,
      dataDir,
      version,
      buildId: identity.buildId,
      sourceRevision: identity.sourceRevision,
      needsSetup,
      bootstrapToken,
      recoveryToken,
      updateRecognized: recognition.changed,
      previousVersion: recognition.previousVersion,
    };
  } catch (error) {
    unwatchNextStartup();
    // A cleanup error must not replace the safe diagnostic of the failing step.
    try { await lifecycle.stopChild(child); } catch { if (error) error.cleanupFailed = true; }
    if (pg) await pg.stop().catch(() => undefined);
    throw error;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let hostHandle;
  const shutdown = () => Promise.resolve(hostHandle?.stop?.()).then(() => process.exit(0), error => { console.error("[lexopen-host] No se confirmó la parada:", error.message); process.exit(1); });
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  process.on("message", message => { if (message?.type === "lexopen:stop") void shutdown(); });
  if (process.connected) process.once("disconnect", () => void shutdown());
  startHost()
    .then((handle) => {
      hostHandle = handle;
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
