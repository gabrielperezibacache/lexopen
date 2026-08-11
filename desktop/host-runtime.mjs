/**
 * Arranca Postgres embebido + migraciones + servidor Next en 0.0.0.0.
 * Datos/config del usuario viven en LEXOPEN_DATA_DIR (fuera del instalador).
 */
import { createRequire } from "module";
import { spawn } from "child_process";
import fs from "fs";
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
} = require("./config.cjs");

const repoRoot = process.env.LEXOPEN_APP_ROOT
  ? path.resolve(process.env.LEXOPEN_APP_ROOT)
  : path.resolve(__dirname, "..");
const prismaRoot = process.env.LEXOPEN_PRISMA_ROOT
  ? path.resolve(process.env.LEXOPEN_PRISMA_ROOT)
  : path.join(repoRoot, "prisma");

function appVersion() {
  const fromEnv = process.env.LEXOPEN_APP_VERSION;
  if (fromEnv) return fromEnv;
  const desktopPkg = path.join(__dirname, "package.json");
  const rootPkg = path.join(repoRoot, "package.json");
  if (fs.existsSync(desktopPkg)) return readPackageVersion(desktopPkg);
  return readPackageVersion(rootPkg);
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i);
    const value = trimmed.slice(i + 1);
    process.env[key] = value;
  }
}

async function startEmbeddedPostgres(dataDir, pgPort) {
  const modPath = require.resolve("embedded-postgres");
  const EmbeddedPostgres = (await import(pathToFileURL(modPath).href)).default;
  const databaseDir = pgDataDir(dataDir);
  const alreadyInitialized = fs.existsSync(path.join(databaseDir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "lexopen",
    password: "lexopen",
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
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} → exit ${code}`));
    });
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

function resolvePrismaCli() {
  const resources =
    process.resourcesPath ||
    process.env.LEXOPEN_RESOURCES ||
    path.dirname(prismaRoot);
  const candidates = [
    process.env.LEXOPEN_PRISMA_CLI,
    path.join(resources, "prisma-cli", "build", "index.js"),
    path.join(repoRoot, "node_modules", "prisma", "build", "index.js"),
    path.join(
      path.dirname(__dirname),
      "node_modules",
      "prisma",
      "build",
      "index.js"
    ),
  ].filter(Boolean);
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

async function migrate() {
  const schema = path.join(prismaRoot, "schema.prisma");
  const prismaCli = resolvePrismaCli();
  if (prismaCli) {
    await run(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schema], {
      cwd: repoRoot,
      env: { DATABASE_URL: process.env.DATABASE_URL },
    });
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
  await run("npx", ["tsx", "prisma/seed.ts"]);
  fs.writeFileSync(marker, new Date().toISOString(), "utf8");
}

function resolveServerEntry() {
  const packaged = path.join(repoRoot, "server.js");
  if (fs.existsSync(packaged)) return { type: "standalone", entry: packaged };
  const standalone = path.join(repoRoot, ".next", "standalone", "server.js");
  if (fs.existsSync(standalone)) return { type: "standalone", entry: standalone };
  return { type: "next", entry: null };
}

function startNextServer(port) {
  const resolved = resolveServerEntry();
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "0.0.0.0",
    NODE_ENV: "production",
  };

  if (resolved.type === "standalone") {
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
  return spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", String(port)], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

async function waitForHealth(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function startHost(options = {}) {
  const dataDir = options.dataDir || defaultDataDir();
  process.env.LEXOPEN_DATA_DIR = dataDir;

  const cfg = readConfig(dataDir);
  const port = Number(options.port || cfg.port || 3000);
  const pgPort = Number(options.pgPort || cfg.pgPort || 54329);
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
  // Reafirmar tras cargar .env (el archivo no debe pisar la versión del binario)
  process.env.LEXOPEN_APP_VERSION = version;
  process.env.LEXOPEN_UPDATE_RECOGNIZED = recognition.changed ? "1" : "0";
  if (host.envPreserved) {
    console.log(
      "[lexopen-host] .env existente preservado (solo se completaron claves faltantes:",
      host.addedKeys.length ? host.addedKeys.join(", ") : "ninguna",
      ")"
    );
  }

  console.log("[lexopen-host] Datos en", dataDir);
  console.log("[lexopen-host] Postgres :", host.pgPort, "·", pgDataDir(dataDir));
  console.log("[lexopen-host] Storage  :", host.storagePath);
  console.log("[lexopen-host] App      :", localAppUrl(host.port), "(bind 0.0.0.0)");
  if (host.publicUrl) {
    console.log("[lexopen-host] URL pública:", host.publicUrl);
  }

  const pg = await startEmbeddedPostgres(dataDir, pgPort);
  await migrate();
  await maybeSeed(seedDemo, dataDir);

  const child = startNextServer(host.port);
  const url = localAppUrl(host.port);
  const ok = await waitForHealth(url);
  if (!ok) {
    console.warn("[lexopen-host] Health check lento; la ventana puede reintentar.");
  }

  const stop = async () => {
    killChild(child);
    try {
      await pg.stop();
    } catch (e) {
      console.warn("[lexopen-host] pg.stop:", e);
    }
  };

  process.on("SIGINT", () => void stop().then(() => process.exit(0)));
  process.on("SIGTERM", () => void stop().then(() => process.exit(0)));

  return {
    url,
    publicUrl: host.publicUrl,
    port: host.port,
    stop,
    child,
    dataDir,
    version,
    updateRecognized: recognition.changed,
    previousVersion: recognition.previousVersion,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startHost().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
