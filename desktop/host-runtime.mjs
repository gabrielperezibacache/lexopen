/**
 * Arranca Postgres embebido + migraciones + servidor Next en 0.0.0.0.
 * Usado por Electron (modo host) o `npm run desktop:host`.
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
  writeConfig,
  localAppUrl,
} = require("./config.cjs");

const repoRoot = process.env.LEXOPEN_APP_ROOT
  ? path.resolve(process.env.LEXOPEN_APP_ROOT)
  : path.resolve(__dirname, "..");
const prismaRoot = process.env.LEXOPEN_PRISMA_ROOT
  ? path.resolve(process.env.LEXOPEN_PRISMA_ROOT)
  : path.join(repoRoot, "prisma");

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
  const databaseDir = path.join(dataDir, "pgdata");
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "lexopen",
    password: "lexopen",
    port: pgPort,
    persistent: true,
  });
  await pg.initialise();
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

async function migrate() {
  const schema = path.join(prismaRoot, "schema.prisma");
  await run("npx", ["prisma", "migrate", "deploy", "--schema", schema], {
    cwd: repoRoot,
    env: { DATABASE_URL: process.env.DATABASE_URL },
  });
}

async function maybeSeed(seedDemo) {
  if (!seedDemo) return;
  const marker = path.join(process.env.LEXOPEN_DATA_DIR || defaultDataDir(), ".seeded");
  if (fs.existsSync(marker)) {
    console.log("[lexopen-host] Seed demo ya aplicado (marker presente).");
    return;
  }
  await run("npx", ["tsx", "prisma/seed.ts"]);
  fs.writeFileSync(marker, new Date().toISOString(), "utf8");
}

function resolveServerEntry() {
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

  console.log("[lexopen-host] Usando `next start` (ejecute LEXOPEN_STANDALONE=1 npm run build para empaquetado).");
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
  const seedDemo = Boolean(options.seedDemo ?? cfg.seedDemo);
  const publicUrl = options.publicUrl || cfg.publicUrl || "";

  writeConfig({ mode: "host", port, pgPort, seedDemo, publicUrl }, dataDir);
  const host = ensureHostEnv(dataDir, { port, pgPort, seedDemo, publicUrl });
  loadEnvFile(host.envFile);

  console.log("[lexopen-host] Datos en", dataDir);
  console.log("[lexopen-host] Postgres :", host.pgPort);
  console.log("[lexopen-host] App      :", localAppUrl(port), "(bind 0.0.0.0)");
  if (publicUrl) {
    console.log("[lexopen-host] URL pública (Tailscale):", publicUrl);
  } else {
    console.log(
      "[lexopen-host] Tip Tailscale: instale Tailscale y use http://<hostname>:PORT o `tailscale serve --bg",
      port,
      "`"
    );
  }

  const pg = await startEmbeddedPostgres(dataDir, pgPort);
  await migrate();
  await maybeSeed(seedDemo);

  const child = startNextServer(port);
  const url = localAppUrl(port);
  const ok = await waitForHealth(url);
  if (!ok) {
    console.warn("[lexopen-host] Health check lento; la ventana puede reintentar.");
  }

  const stop = async () => {
    if (child && !child.killed) child.kill("SIGTERM");
    try {
      await pg.stop();
    } catch (e) {
      console.warn("[lexopen-host] pg.stop:", e);
    }
  };

  process.on("SIGINT", () => void stop().then(() => process.exit(0)));
  process.on("SIGTERM", () => void stop().then(() => process.exit(0)));

  return { url, publicUrl: host.publicUrl, port, stop, child, dataDir };
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
