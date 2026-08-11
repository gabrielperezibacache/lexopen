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
    child.kill("SIGTERM");
  });
}

async function migrate() {
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
  if (process.versions.electron) {
    throw new Error("Falta .next/standalone/server.js en el instalador de LexOpen.");
  }
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
  const health = await waitForHealth(url);
  if (!health.ok) {
    await stopChild(child);
    await pg.stop().catch(() => undefined);
    throw new Error("[lexopen-host] Health check falló; el servidor no está listo.");
  }
  const needsSetup = health.needsSetup;
  const bootstrapToken = needsSetup
    ? process.env.LEXOPEN_BOOTSTRAP_TOKEN || ""
    : null;
  if (needsSetup && !bootstrapToken) {
    await stopChild(child);
    await pg.stop().catch(() => undefined);
    throw new Error(
      "[lexopen-host] No hay token de configuración inicial; revise el archivo .env del Host."
    );
  }
  if (needsSetup) {
    console.log(
      "[lexopen-host] Configuración inicial:",
      `${url}/setup?token=${bootstrapToken}`
    );
  }

  let stopPromise = null;
  const stop = async () => {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
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
    updateRecognized: recognition.changed,
    previousVersion: recognition.previousVersion,
  };
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
