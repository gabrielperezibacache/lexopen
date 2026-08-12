import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const shell = process.platform === "win32";
const port = Number(process.env.E2E_PORT || 3100);

function fail(message) {
  console.error(`[e2e] ${message}`);
  process.exit(2);
}

function databaseForE2e() {
  const value = process.env.E2E_DATABASE_URL;
  if (!value) {
    fail(
      "Defina E2E_DATABASE_URL apuntando a una base PostgreSQL local " +
        "dedicada, por ejemplo lexopen_e2e."
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("E2E_DATABASE_URL no es una URL válida.");
  }
  if (!url || !["postgresql:", "postgres:"].includes(url.protocol)) {
    fail("E2E_DATABASE_URL debe usar PostgreSQL.");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    fail("E2E_DATABASE_URL solo puede apuntar a PostgreSQL local.");
  }
  if (!/(e2e|test)/i.test(url.pathname)) {
    fail(
      "La base E2E debe tener un nombre que incluya `e2e` o `test`; " +
        "no se permite usar una base de producción."
    );
  }
  return value;
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      shell,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${command} ${args.join(" ")} terminó con ${
              signal ? `señal ${signal}` : `código ${code}`
            }`
          )
        );
      }
    });
  });
}

const databaseUrl = databaseForE2e();
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  E2E_DATABASE_URL: databaseUrl,
  NODE_ENV: "test",
  SESSION_SECRET: process.env.SESSION_SECRET || "e2e-session-secret-32-chars",
  HERMES_ALLOW_DEMO: "1",
  LEXOPEN_DEMO_SWITCHER: "0",
  LEXOPEN_RELAX_CSRF: "1",
  PORT: String(port),
  HOSTNAME: "127.0.0.1",
};

await run(
  "npx",
  ["--no-install", "prisma", "migrate", "reset", "--force", "--skip-seed"],
  env
);
await run("npx", ["--no-install", "tsx", "prisma/seed.ts"], env);

const server = spawn(
  npm,
  ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: root,
    env,
    shell,
    stdio: "inherit",
  }
);

let shuttingDown = false;
async function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (server.exitCode === null && !server.killed) {
    server.kill(signal);
  }
  process.exitCode = code;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
server.once("error", (error) => {
  console.error("[e2e] No se pudo iniciar Next.js:", error);
  void shutdown("SIGTERM", 1);
});
server.once("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(
      `[e2e] Next.js terminó inesperadamente (code=${code}, signal=${signal || "none"}).`
    );
    process.exitCode = code || 1;
  }
});
