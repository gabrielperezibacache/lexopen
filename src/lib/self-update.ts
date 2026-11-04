/**
 * In-app Host self-update (admin): owned request/status for the web-host coordinator.
 * Unmanaged HTTP processes cannot safely stop, back up and verify themselves.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getAppVersion } from "@/lib/app-version";
import { httpError } from "@/lib/auth/access";

export type SelfUpdatePhase =
  | "idle"
  | "queued"
  | "preflight"
  | "backing_up"
  | "applying"
  | "pulling"
  | "installing"
  | "migrating"
  | "building"
  | "restarting"
  | "awaiting_restart"
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
  requestId?: string | null;
  recoveryRequired?: boolean;
  backupDirectory?: string | null;
  fromRevision?: string | null;
  targetRevision?: string | null;
  expectedBuildId?: string | null;
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
  if (process.env.LEXOPEN_WEB_HOST !== "1") {
    return { available: false, reason: "Para actualizar desde la aplicación, inicie este clon mediante npm run web:host. Ese coordinador detiene, respalda y comprueba el reinicio del Host.", webHostManaged: false };
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
    requestId?: string;
    recoveryRequired?: boolean;
    backupDirectory?: string;
    fromRevision?: string;
    targetRevision?: string;
    expectedBuildId?: string;
  }>(selfUpdateStatusPath());
  const request = readJsonFile<{ requestedAt?: string }>(selfUpdateRequestPath());
  const phase: SelfUpdatePhase =
    stored?.phase || (request ? "queued" : "idle");

  return {
    phase,
    ok: phase === "done" && Boolean(stored?.ok),
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
    requestId: stored?.requestId || null,
    recoveryRequired: Boolean(stored?.recoveryRequired),
    backupDirectory: stored?.backupDirectory || null,
    fromRevision: stored?.fromRevision || null,
    targetRevision: stored?.targetRevision || null,
    expectedBuildId: stored?.expectedBuildId || null,
  };
}

let ownedRequestId: string | undefined;
function acquireLock(requestId: string): boolean {
  const lock = selfUpdateLockPath();
  try {
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    const fd = fs.openSync(lock, "wx");
    fs.writeFileSync(
      fd,
      JSON.stringify({ pid: process.pid, requestId, at: new Date().toISOString() })
    );
    fs.closeSync(fd);
    ownedRequestId = requestId;
    return true;
  } catch {
    // Age alone never authorizes deleting a live owner's lock or pending job.
    try {
      const owner = readJsonFile<{ pid?: number; requestId?: string }>(lock);
      let alive = true;
      try { if (owner?.pid && Number.isSafeInteger(owner.pid) && owner.pid > 0) process.kill(owner.pid, 0); }
      catch (error) { alive = (error as NodeJS.ErrnoException).code !== "ESRCH"; }
      const pending = readJsonFile<{ requestId?: string }>(selfUpdateRequestPath());
      if (owner?.requestId && !alive && pending?.requestId !== owner.requestId) {
        fs.unlinkSync(lock);
        return acquireLock(requestId);
      }
    } catch {
      // ignore
    }
    return false;
  }
}

export function releaseSelfUpdateLock(requestId = ownedRequestId) {
  try {
    const owner = readJsonFile<{ pid?: number; requestId?: string }>(selfUpdateLockPath());
    if (!requestId || requestId !== ownedRequestId || owner?.requestId !== requestId || owner.pid !== process.pid) return;
    fs.unlinkSync(selfUpdateLockPath());
    ownedRequestId = undefined;
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
  if (current.recoveryRequired) throw httpError("La actualización anterior requiere recuperación supervisada antes de volver a actualizar", 409);
  if (
    current.phase === "queued" ||
    current.phase === "preflight" ||
    current.phase === "backing_up" ||
    current.phase === "applying" ||
    current.phase === "pulling" ||
    current.phase === "installing" ||
    current.phase === "migrating" ||
    current.phase === "building" ||
    current.phase === "restarting" ||
    current.phase === "awaiting_restart"
  ) {
    throw httpError("Ya hay una actualización en curso.", 409);
  }

  const requestId = randomUUID();
  if (!acquireLock(requestId)) {
    throw httpError("Ya hay una actualización en curso.", 409);
  }

  const requestedAt = new Date().toISOString();
  const payload = {
    requestId,
    requestedAt,
    actorId: opts.actorId,
    targetVersion: opts.targetVersion || null,
    currentVersion: getAppVersion(),
    pid: process.pid,
  };

  try {
    writeJsonFile(selfUpdateRequestPath(), payload);
    writeJsonFile(selfUpdateStatusPath(), {
      requestId,
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
    releaseSelfUpdateLock(requestId);
    throw error;
  }

  return readSelfUpdateStatus();
}
