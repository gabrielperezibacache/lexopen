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

function writeFileAtomic(file: string, contents: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, contents);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function writeJsonFile(file: string, value: unknown) {
  writeFileAtomic(file, JSON.stringify(value, null, 2));
}

type SelfUpdateLockOwner = { pid?: number; requestId?: string };

function hasConfirmedDeadOwner(owner: SelfUpdateLockOwner | null): boolean {
  const pid = owner?.pid;
  if (typeof owner?.requestId !== "string" || !owner.requestId || typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
  return false;
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
  // Publishing a request is the commit point. An abandoned queued receipt alone
  // must not prevent another attempt after a failed publication/rollback.
  const lockOwner = readJsonFile<SelfUpdateLockOwner>(selfUpdateLockPath());
  const publisherGone = !fs.existsSync(selfUpdateLockPath()) || (stored?.requestId === lockOwner?.requestId && hasConfirmedDeadOwner(lockOwner));
  const orphanedQueue = stored?.phase === "queued" && !fs.existsSync(selfUpdateRequestPath()) && publisherGone;
  const phase: SelfUpdatePhase =
    orphanedQueue ? "failed" : stored?.phase || (request ? "queued" : "idle");

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
    message: orphanedQueue ? "No se publicó la solicitud de actualización. Puede volver a intentarlo." : stored?.message ?? null,
    error: orphanedQueue ? "La solicitud de actualización no llegó al coordinador." : stored?.error ?? null,
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
  let descriptor: number | undefined;
  let created: fs.Stats | undefined;
  try {
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    descriptor = fs.openSync(lock, "wx", 0o600);
    created = fs.fstatSync(descriptor);
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, requestId, at: new Date().toISOString() }));
    fs.closeSync(descriptor);
    descriptor = undefined;
    ownedRequestId = requestId;
    return true;
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* Preserve the original storage error. */ }
    }
    // A failed write after exclusive creation must not leave an ownerless lock.
    // Only remove the exact inode opened by this attempt, never a replacement.
    if (created) {
      try {
        const current = fs.lstatSync(lock);
        if (current.dev === created.dev && current.ino === created.ino) fs.unlinkSync(lock);
      } catch { /* Storage recovery may be required before another attempt. */ }
    }
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // Age alone never authorizes deleting a live owner's lock or pending job.
    try {
      const identity = fs.lstatSync(lock);
      const owner = readJsonFile<SelfUpdateLockOwner>(lock);
      if (hasConfirmedDeadOwner(owner) && !fs.existsSync(selfUpdateRequestPath())) {
        const currentIdentity = fs.lstatSync(lock);
        const currentOwner = readJsonFile<SelfUpdateLockOwner>(lock);
        if (identity.dev === currentIdentity.dev && identity.ino === currentIdentity.ino && currentOwner?.requestId === owner?.requestId && currentOwner?.pid === owner?.pid && hasConfirmedDeadOwner(currentOwner) && !fs.existsSync(selfUpdateRequestPath())) {
          fs.unlinkSync(lock);
          return acquireLock(requestId);
        }
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

  const statusFile = selfUpdateStatusPath();
  let previousStatus: string | null = null;
  let queuedWritten = false;
  try {
    previousStatus = fs.existsSync(statusFile) ? fs.readFileSync(statusFile, "utf8") : null;
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
    queuedWritten = true;
    // The coordinator only consumes requests. Validate/persist its status first
    // so a failed API call cannot leave an executable request behind.
    writeJsonFile(selfUpdateRequestPath(), payload);
  } catch (error) {
    const pending = readJsonFile<{ requestId?: string }>(selfUpdateRequestPath());
    if (pending?.requestId === requestId) return readSelfUpdateStatus();
    if (queuedWritten && readJsonFile<{ requestId?: string }>(statusFile)?.requestId === requestId) {
      try {
        if (previousStatus === null) fs.unlinkSync(statusFile);
        else writeFileAtomic(statusFile, previousStatus);
      } catch {
        try {
          writeJsonFile(statusFile, {
            requestId, phase: "failed", ok: false, recoveryRequired: false,
            startedAt: requestedAt, updatedAt: new Date().toISOString(),
            error: "No se pudo publicar la solicitud de actualización. Puede volver a intentarlo.",
          });
        } catch {
          // readSelfUpdateStatus also recognizes an orphaned queued receipt.
        }
      }
    }
    releaseSelfUpdateLock(requestId);
    throw error;
  }

  return readSelfUpdateStatus();
}
