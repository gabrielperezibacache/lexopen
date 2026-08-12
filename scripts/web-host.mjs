import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const shell = process.platform === "win32";
const standaloneServer = path.join(root, ".next", "standalone", "server.js");
const desktopRuntime = path.join(
  root,
  "desktop",
  "node_modules",
  "embedded-postgres",
  "package.json"
);

function runSetup(args, label) {
  console.log(`[web-host] ${label}`);
  const result = spawnSync(npm, args, {
    cwd: root,
    env: process.env,
    shell,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!fs.existsSync(desktopRuntime)) {
  runSetup(["run", "desktop:install"], "Instalando runtime local de PostgreSQL");
}
if (!fs.existsSync(standaloneServer)) {
  runSetup(["run", "desktop:build"], "Compilando LexOpen para el Host web");
}

console.log("[web-host] Iniciando Host web local en el navegador");
const child = spawn(npm, ["run", "desktop:host"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    LEXOPEN_DESKTOP: "1",
  },
  shell,
  stdio: "inherit",
});

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));
child.once("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
