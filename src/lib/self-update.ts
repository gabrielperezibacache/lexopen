/**
 * In-app Host self-update (admin): request file + status for web-host coordinator,
 * or direct spawn when LEXOPEN_WEB_HOST is not managing the process.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { getAppVersion } from "@/lib/app-version";
import { httpError } from "@/lib/auth/access";

export type SelfUpdatePhase =
  | "idle"
  | "queued"
  | "pulling"
  | "installing"
  | "migrating"
  | "building"
  | "restarting"
  | "done"
  | "failed";

export type SelfUpdateStatus = {
  phase: SelfUpdatePhase;
  ok: boolean;
  available: boolean;
  reason?: string;
  currentVersion: string;
  fromVersion?: string | null;
  toVersion?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  message?: string | null;
  error?: string | null;
  webHostManaged: boolean;
};

function resolveDataDir() {
  const fromEnv = process.env.LEXOPEN_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), ".lexopen-runtime");
}

export function selfUpdateStatusPath() {
  return path.join(resolveDataDir(), "self-update-status.json");
}

export function selfUpdateRequestPath() {
  return path.join(resolveDataDir(), "self-update.request.json");
}

export function selfUpdateLockPath() {
  return path.join(resolveDataDir(), "self-update.lock");
}

function selfUpdateDisabled() {
  const v = process.env.LEXOPEN_SELF_UPDATE?.trim().toLowerCase();
  return v === "0" || v === "off" || v === "false";
}

function isGitCheckout() {
  try {
    return fs.existsSync(path.join(process.cwd(), ".git"));
  } catch {
    return false;
  }
}

function isPackagedDesktop() {
  return (
    process.env.LEXOPEN_PACKAGED === "1" ||
    process.env.LEXOPEN_ELECTRON_PACKAGED === "1"
  );
}

export function getSelfUpdateCapability() {
  if (selfUpdateDisabled()) {
    return {
      available: false,
      reason:
        "La actualización automática está desactivada en este Host (LEXOPEN_SELF_UPDATE=0).",
      webHostManaged: process.env.LEXOPEN_WEB_HOST === "1",
    };
  }
  if (isPackagedDesktop()) {
    return {
      available: false,
      reason:
        "La app de escritorio empaquetada se actualiza con el instalador / actualizador del sistema.",
      webHostManaged: false,
    };
  }
  if (!isGitCheckout()) {
    return {
      available: false,
      reason:
        "Este Host no es un clon del repositorio; use la instalación desde git para actualizar desde la app.",
      webHostManaged: process.env.LEXOPEN_WEB_HOST === "1",
    };
  }
  return {
    available: true,
    reason: undefined,
    webHostManaged: process.env.LEXOPEN_WEB_HOST === "1",
  };
}

function readJsonFile<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export function readSelfUpdateStatus(): SelfUpdateStatus {
  const capability = getSelfUpdateCapability();
  const stored = readJsonFile<{
    phase?: SelfUpdatePhase;
    ok?: boolean;
    fromVersion?: string | null;
    toVersion?: string | null;
    startedAt?: string | null;
    updatedAt?: string | null;
    message?: string | null;
    error?: string | null;
  }>(selfUpdateStatusPath());
  const request = readJsonFile<{ requestedAt?: string }>(selfUpdateRequestPath());
  const phase: SelfUpdatePhase =
    stored?.phase || (request ? "queued" : "idle");

  return {
    phase,
    ok: Boolean(stored?.ok),
    available: capability.available,
    reason: capability.reason,
    currentVersion: getAppVersion(),
    fromVersion: stored?.fromVersion ?? null,
    toVersion: stored?.toVersion ?? null,
    startedAt: stored?.startedAt ?? request?.requestedAt ?? null,
    updatedAt: stored?.updatedAt ?? null,
    message: stored?.message ?? null,
    error: stored?.error ?? null,
    webHostManaged: capability.webHostManaged,
  };
}

function acquireLock(): boolean {
  const lock = selfUpdateLockPath();
  try {
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    const fd = fs.openSync(lock, "wx");
    fs.writeFileSync(
      fd,
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() })
    );
    fs.closeSync(fd);
    return true;
  } catch {
    // Stale lock (> 45 min) can be cleared.
    try {
      const st = fs.statSync(lock);
      if (Date.now() - st.mtimeMs > 45 * 60_000) {
        fs.unlinkSync(lock);
        return acquireLock();
      }
    } catch {
      // ignore
    }
    return false;
  }
}

export function releaseSelfUpdateLock() {
  try {
    fs.unlinkSync(selfUpdateLockPath());
  } catch {
    // ignore
  }
}

export function requestSelfUpdate(opts: {
  actorId: string;
  targetVersion?: string | null;
}) {
  const capability = getSelfUpdateCapability();
  if (!capability.available) {
    throw httpError(capability.reason || "Actualización automática no disponible.", 409);
  }

  const current = readSelfUpdateStatus();
  if (
    current.phase === "queued" ||
    current.phase === "pulling" ||
    current.phase === "installing" ||
    current.phase === "migrating" ||
    current.phase === "building" ||
    current.phase === "restarting"
  ) {
    throw httpError("Ya hay una actualización en curso.", 409);
  }

  if (!acquireLock()) {
    throw httpError("Ya hay una actualización en curso.", 409);
  }

  const requestedAt = new Date().toISOString();
  const payload = {
    requestedAt,
    actorId: opts.actorId,
    targetVersion: opts.targetVersion || null,
    currentVersion: getAppVersion(),
    pid: process.pid,
  };

  try {
    writeJsonFile(selfUpdateRequestPath(), payload);
    writeJsonFile(selfUpdateStatusPath(), {
      phase: "queued",
      ok: false,
      fromVersion: getAppVersion(),
      toVersion: opts.targetVersion || null,
      startedAt: requestedAt,
      updatedAt: requestedAt,
      message:
        capability.webHostManaged
          ? "Actualización en cola. El Host se reiniciará solo en unos minutos."
          : "Actualización en cola. LexOpen aplicará los cambios y reiniciará el proceso.",
      error: null,
    });
  } catch (error) {
    releaseSelfUpdateLock();
    throw error;
  }

  // When web-host is not coordinating, spawn the updater detached.
  if (!capability.webHostManaged) {
    spawnDirectUpdater();
  }

  return readSelfUpdateStatus();
}

function spawnDirectUpdater() {
  const script = path.join(process.cwd(), "scripts", "web-self-update.mjs");
  const logFile = path.join(resolveDataDir(), "self-update.log");
  const out = fs.openSync(logFile, "a");
  const child = spawn(
    process.execPath,
    [script, "--apply", "--branch", "main", "--restart-after"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LEXOPEN_SELF_UPDATE_PARENT_PID: String(process.pid),
      },
      detached: true,
      stdio: ["ignore", out, out],
    }
  );
  child.unref();
}
