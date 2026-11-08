import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const shell = process.platform === "win32";
const port = Number(process.env.E2E_PORT || 3100);

function fail(message) {
  console.error(`[e2e] ${message}`);
  process.exit(2);
}

function databaseForE2e() {
  try {
    return assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Base E2E inválida");
  }
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
const compiled = process.env.E2E_SERVER_MODE === "production";
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  E2E_DATABASE_URL: databaseUrl,
  NODE_ENV: compiled ? "production" : "test",
  LEXOPEN_E2E: "1",
  SESSION_SECRET: process.env.SESSION_SECRET || "e2e-session-secret-32-chars",
  HERMES_ALLOW_DEMO: compiled ? "0" : "1",
  LEXOPEN_DEMO_SWITCHER: "0",
  LEXOPEN_RELAX_CSRF: compiled ? "0" : "1",
  // The fixture binds HTTP loopback; production CSRF checks still apply.
  LEXOPEN_COOKIE_SECURE: "0",
  LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE: compiled ? "1" : process.env.LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE,
  PORT: String(port),
  HOSTNAME: "127.0.0.1",
};

await run(
  "npx",
  ["--no-install", "prisma", "migrate", "reset", "--force", "--skip-seed"],
  env
);
await run("npx", ["--no-install", "tsx", "prisma/seed.ts"], { ...env, NODE_ENV: "test" });

const server = spawn(
  npm,
  compiled
    ? ["exec", "--", "next", "start", "--hostname", "127.0.0.1", "--port", String(port)]
    : process.env.E2E_BUNDLER === "webpack"
    ? ["exec", "--", "next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)]
    : ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
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
