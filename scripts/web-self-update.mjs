/**
 * LexOpen Host self-update (git pull + npm ci + migrate + build).
 *
 * Modes:
 * - --apply: run the update steps (used by web-host after stopping Next)
 * - --watch-request: unused; web-host polls the request file itself
 *
 * Status / request files live under LEXOPEN_DATA_DIR (or cwd/.lexopen-runtime).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { defaultDataDir } = require("../desktop/config.cjs");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const shell = process.platform === "win32";

export function resolveDataDir(env = process.env) {
  const fromEnv = env.LEXOPEN_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  try {
    return path.resolve(defaultDataDir());
  } catch {
    return path.join(root, ".lexopen-runtime");
  }
}

export function statusPath(dataDir) {
  return path.join(dataDir, "self-update-status.json");
}

export function requestPath(dataDir) {
  return path.join(dataDir, "self-update.request.json");
}

export function lockPath(dataDir) {
  return path.join(dataDir, "self-update.lock");
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function run(cmd, args, label, onPhase) {
  onPhase?.(label);
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: process.env,
    shell,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const errOut = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      `${label} falló (código ${result.status})${errOut ? `: ${errOut.slice(-800)}` : ""}`
    );
  }
  return result;
}

function isGitRepo() {
  return fs.existsSync(path.join(root, ".git"));
}

function currentVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8")
    );
    return String(pkg.version || "0.0.0").replace(/^v/i, "");
  } catch {
    return "0.0.0";
  }
}

/**
 * Apply code update. Caller should stop the Host HTTP process first when possible.
 */
export function applySelfUpdate({
  dataDir = resolveDataDir(),
  branch = "main",
  onPhase,
} = {}) {
  if (!isGitRepo()) {
    throw new Error(
      "Este Host no es un clon git; la actualización automática no está disponible."
    );
  }

  const startedAt = new Date().toISOString();
  const fromVersion = currentVersion();
  const statusFile = statusPath(dataDir);

  const setStatus = (phase, extra = {}) => {
    writeJson(statusFile, {
      phase,
      ok: phase === "done",
      fromVersion,
      toVersion: phase === "done" ? currentVersion() : null,
      startedAt,
      updatedAt: new Date().toISOString(),
      message: extra.message || null,
      error: extra.error || null,
      logTail: extra.logTail || null,
    });
    onPhase?.(phase, extra);
  };

  try {
    setStatus("pulling", { message: "Descargando código nuevo…" });
    run("git", ["fetch", "origin", branch], "git fetch", () =>
      setStatus("pulling", { message: "Descargando código nuevo…" })
    );
    run(
      "git",
      ["checkout", branch],
      "git checkout",
      () => setStatus("pulling", { message: "Cambiando a la rama principal…" })
    );
    run(
      "git",
      ["pull", "--ff-only", "origin", branch],
      "git pull",
      () => setStatus("pulling", { message: "Aplicando cambios…" })
    );

    setStatus("installing", { message: "Instalando dependencias…" });
    run(npm, ["ci"], "npm ci");

    setStatus("migrating", { message: "Aplicando migraciones de base de datos…" });
    run(npm, ["run", "db:migrate"], "db:migrate");

    setStatus("building", { message: "Compilando LexOpen…" });
    // Prefer standalone Host build when that entry exists or LEXOPEN_DESKTOP=1.
    const useDesktopBuild =
      process.env.LEXOPEN_DESKTOP === "1" ||
      fs.existsSync(path.join(root, ".next", "standalone", "server.js"));
    if (useDesktopBuild) {
      run(npm, ["run", "desktop:build"], "desktop:build");
    } else {
      run(npm, ["run", "build"], "build");
    }

    setStatus("done", {
      message: `Actualización lista (v${fromVersion} → v${currentVersion()}). Reinicie o recargue cuando el Host vuelva.`,
    });
    return readJson(statusFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus("failed", { error: message, message: "La actualización falló." });
    throw error;
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: node scripts/web-self-update.mjs --apply [--branch main] [--restart-after]
Environment: LEXOPEN_DATA_DIR, LEXOPEN_SELF_UPDATE_PARENT_PID, LEXOPEN_SELF_UPDATE_RESTART_CMD`);
    process.exit(0);
  }
  if (!args.includes("--apply")) {
    console.error("Use --apply para ejecutar la actualización.");
    process.exit(2);
  }
  const branchIdx = args.indexOf("--branch");
  const branch =
    branchIdx >= 0 && args[branchIdx + 1] ? args[branchIdx + 1] : "main";
  const restartAfter = args.includes("--restart-after");
  const dataDir = resolveDataDir();
  console.log(`[self-update] dataDir=${dataDir} branch=${branch}`);
  try {
    const result = applySelfUpdate({
      dataDir,
      branch,
      onPhase: (phase, extra) => {
        console.log(`[self-update] ${phase}${extra?.message ? `: ${extra.message}` : ""}`);
      },
    });
    console.log(`[self-update] done → v${result?.toVersion || currentVersion()}`);

    try {
      const req = requestPath(dataDir);
      if (fs.existsSync(req)) fs.unlinkSync(req);
      const lock = lockPath(dataDir);
      if (fs.existsSync(lock)) fs.unlinkSync(lock);
    } catch {
      // ignore cleanup errors
    }

    if (restartAfter) {
      const parentPid = Number(process.env.LEXOPEN_SELF_UPDATE_PARENT_PID || 0);
      writeJson(statusPath(dataDir), {
        ...(result || {}),
        phase: "restarting",
        message:
          "Código actualizado. Reiniciando el Host… Recargue el navegador en unos segundos.",
        updatedAt: new Date().toISOString(),
      });
      if (parentPid > 0) {
        try {
          process.kill(parentPid, "SIGTERM");
        } catch {
          // Parent may already be gone.
        }
      }
      const restartCmd = process.env.LEXOPEN_SELF_UPDATE_RESTART_CMD?.trim();
      if (restartCmd) {
        const child = spawn(restartCmd, {
          cwd: root,
          env: process.env,
          shell: true,
          detached: true,
          stdio: "ignore",
        });
        child.unref();
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("[self-update]", error instanceof Error ? error.message : error);
    try {
      const lock = lockPath(dataDir);
      if (fs.existsSync(lock)) fs.unlinkSync(lock);
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) main();
