const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const BACKUP_FORMAT_VERSION = 1;
const AUTO_BACKUP_PREFIX = "lexopen-backup-";
const BACKUP_LOCK_NAME = ".lexopen-backup.lock";
const DEFAULT_BACKUP_RETENTION = 7;
const MAX_BACKUP_RETENTION = 365;
const STALE_LOCK_AFTER_MS = 24 * 60 * 60 * 1000;

function absolute(file) {
  return path.resolve(String(file || ""));
}

function isWithin(parent, child) {
  const parentPath = absolute(parent);
  const childPath = absolute(child);
  return (
    childPath === parentPath ||
    childPath.startsWith(`${parentPath}${path.sep}`)
  );
}

function defaultBackupDirectory(dataDir) {
  const source = absolute(dataDir);
  const base = path.basename(source) || "lexopen-data";
  return path.join(path.dirname(source), `${base}-backups`);
}

function normalizeBackupRetention(value = DEFAULT_BACKUP_RETENTION) {
  const retention = typeof value === "number" ? value : Number(String(value).trim());
  if (
    !Number.isInteger(retention) ||
    retention < 1 ||
    retention > MAX_BACKUP_RETENTION
  ) {
    throw new Error(
      `La retención de respaldos debe ser un entero entre 1 y ${MAX_BACKUP_RETENTION}.`
    );
  }
  return retention;
}

function formatBackupTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Fecha inválida para el nombre del respaldo.");
  }
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.(\d{3})Z$/, "-$1Z");
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && typeof error === "object" && error.code === "EPERM";
  }
}

async function lockIsStale(lockDirectory) {
  try {
    const owner = JSON.parse(
      await fs.readFile(path.join(lockDirectory, "owner.json"), "utf8")
    );
    if (Number.isInteger(Number(owner.pid)) && Number(owner.pid) > 0) {
      return !processIsAlive(Number(owner.pid));
    }
  } catch {
    // A process can crash after creating the directory and before writing owner.json.
  }

  try {
    const stats = await fs.stat(lockDirectory);
    return Date.now() - stats.mtimeMs > STALE_LOCK_AFTER_MS;
  } catch {
    return false;
  }
}

async function acquireBackupLock(lockDirectory) {
  const lock = absolute(lockDirectory);
  const token = crypto.randomBytes(16).toString("hex");
  const owner = {
    pid: process.pid,
    token,
    startedAt: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.mkdir(lock);
      await fs.chmod(lock, 0o700);
      await fs.writeFile(
        path.join(lock, "owner.json"),
        `${JSON.stringify(owner)}\n`,
        { encoding: "utf8", mode: 0o600 }
      );
      return async () => {
        try {
          const current = JSON.parse(
            await fs.readFile(path.join(lock, "owner.json"), "utf8")
          );
          if (current.token !== token) return;
        } catch {
          return;
        }
        await fs.rm(lock, { recursive: true, force: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST" || attempt > 0) {
        if (error?.code === "EEXIST") {
          throw new Error("Ya existe otro respaldo automático en curso.");
        }
        throw error;
      }
      if (!(await lockIsStale(lock))) {
        throw new Error("Ya existe otro respaldo automático en curso.");
      }
      await fs.rm(lock, { recursive: true, force: true });
    }
  }

  throw new Error("No se pudo adquirir el bloqueo de respaldos.");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function assertEmptyOrMissingDirectory(directory) {
  if (!(await exists(directory))) return;
  const entries = await fs.readdir(directory);
  if (entries.length > 0) {
    throw new Error(`El destino de respaldo no está vacío: ${directory}`);
  }
}

async function validateBackupDirectory(backupDir) {
  const root = absolute(backupDir);
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (
    manifest.formatVersion !== BACKUP_FORMAT_VERSION ||
    manifest.type !== "lexopen-host-data"
  ) {
    throw new Error("Formato de respaldo LexOpen no compatible");
  }
  if (
    manifest.databaseDirectory !== "pgdata" ||
    manifest.storageDirectory !== "storage"
  ) {
    throw new Error("El respaldo no contiene sus directorios requeridos");
  }
  const required = [
    path.join(root, manifest.databaseDirectory, "PG_VERSION"),
    path.join(root, manifest.storageDirectory),
  ];
  for (const requiredPath of required) {
    if (!(await exists(requiredPath))) {
      throw new Error(`Respaldo incompleto: falta ${requiredPath}`);
    }
  }
  return { root, manifest };
}

async function createDataBackup(dataDir, destination, metadata = {}) {
  const source = absolute(dataDir);
  const output = absolute(destination);
  if (!source || !output || source === output || isWithin(source, output)) {
    throw new Error("El respaldo debe estar fuera del directorio de datos del Host");
  }
  if (!(await exists(source))) {
    throw new Error("El directorio de datos del Host no existe");
  }
  await assertEmptyOrMissingDirectory(output);

  const parent = path.dirname(output);
  await fs.mkdir(parent, { recursive: true });
  const temporary = path.join(
    parent,
    `.${path.basename(output)}.tmp-${process.pid}-${Date.now()}`
  );
  await fs.rm(temporary, { recursive: true, force: true });

  try {
    await fs.cp(source, temporary, { recursive: true, force: false });
    if (await exists(path.join(temporary, ".env"))) {
      await fs.chmod(path.join(temporary, ".env"), 0o600);
    }
    const manifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      type: "lexopen-host-data",
      createdAt: metadata.createdAt || new Date().toISOString(),
      sourceDataDir: source,
      appVersion: metadata.appVersion || null,
      databaseDirectory: "pgdata",
      storageDirectory: "storage",
      backupMode: metadata.backupMode || "manual",
      includes: [
        "pgdata",
        "storage",
        "obsidian-vault",
        "desktop-config.json",
        ".env",
        "app-state.json",
      ],
      sensitive: true,
    };
    await fs.writeFile(
      path.join(temporary, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
    await fs.rm(output, { recursive: true, force: true });
    await fs.rename(temporary, output);
    return manifest;
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function restoreDataDirectory(dataDir, backupDir) {
  const target = absolute(dataDir);
  const { root, manifest } = await validateBackupDirectory(backupDir);
  if (target === root || isWithin(target, root) || isWithin(root, target)) {
    throw new Error("El respaldo no puede estar dentro del directorio de datos del Host");
  }

  const parent = path.dirname(target);
  const rollback = path.join(
    parent,
    `.${path.basename(target)}.before-restore-${Date.now()}`
  );
  await fs.rename(target, rollback);
  try {
    await fs.cp(root, target, { recursive: true, force: false });
    await fs.rm(path.join(target, "manifest.json"), { force: true });
    if (await exists(path.join(target, ".env"))) {
      await fs.chmod(path.join(target, ".env"), 0o600);
    }
    return { rollback, manifest };
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(rollback, target);
    throw error;
  }
}

async function finalizeRestore(rollback) {
  await fs.rm(rollback, { recursive: true, force: true });
}

async function rollbackRestore(dataDir, rollback) {
  const target = absolute(dataDir);
  await fs.rm(target, { recursive: true, force: true });
  await fs.rename(rollback, target);
}

async function listRotatingBackups(backupDirectory) {
  const root = absolute(backupDirectory);
  if (!(await exists(root))) return [];

  const entries = await fs.readdir(root, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      !entry.name.startsWith(AUTO_BACKUP_PREFIX) ||
      entry.name === BACKUP_LOCK_NAME
    ) {
      continue;
    }
    const directory = path.join(root, entry.name);
    try {
      const manifest = JSON.parse(
        await fs.readFile(path.join(directory, "manifest.json"), "utf8")
      );
      const createdAt = Date.parse(manifest.createdAt);
      if (
        manifest.formatVersion !== BACKUP_FORMAT_VERSION ||
        manifest.type !== "lexopen-host-data" ||
        !Number.isFinite(createdAt)
      ) {
        continue;
      }
      backups.push({
        name: entry.name,
        path: directory,
        manifest,
        createdAt,
      });
    } catch {
      // Preserve unknown/incomplete directories instead of deleting user data.
    }
  }
  return backups.sort(
    (left, right) =>
      right.createdAt - left.createdAt ||
      right.name.localeCompare(left.name)
  );
}

async function nextRotatingBackupPath(backupDirectory, timestamp) {
  const base = `${AUTO_BACKUP_PREFIX}${formatBackupTimestamp(timestamp)}`;
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const name = suffix === 0 ? base : `${base}-${suffix}`;
    const candidate = path.join(absolute(backupDirectory), name);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error("No se encontró un nombre libre para el respaldo automático.");
}

async function createRotatingDataBackup(
  dataDir,
  backupDirectory = defaultBackupDirectory(dataDir),
  options = {}
) {
  const source = absolute(dataDir);
  const root = absolute(backupDirectory);
  if (
    source === root ||
    isWithin(source, root) ||
    isWithin(root, source)
  ) {
    throw new Error(
      "El directorio de respaldos debe estar separado del directorio de datos del Host."
    );
  }
  if (!(await exists(source))) {
    throw new Error("El directorio de datos del Host no existe");
  }

  const retention = normalizeBackupRetention(
    options.keep ?? DEFAULT_BACKUP_RETENTION
  );
  await fs.mkdir(root, { recursive: true });
  const releaseLock = await acquireBackupLock(path.join(root, BACKUP_LOCK_NAME));
  try {
    const createdAt = options.now ? new Date(options.now) : new Date();
    if (!Number.isFinite(createdAt.getTime())) {
      throw new Error("Fecha inválida para el respaldo automático.");
    }
    const destination = await nextRotatingBackupPath(root, createdAt);
    const manifest = await createDataBackup(source, destination, {
      ...options,
      createdAt: createdAt.toISOString(),
      backupMode: "automatic",
    });
    const allBackups = await listRotatingBackups(root);
    const removed = [];
    for (const backup of allBackups.slice(retention)) {
      await fs.rm(backup.path, { recursive: true, force: true });
      removed.push(backup.name);
    }
    return {
      backupDirectory: root,
      destination,
      manifest,
      removed,
      retained: (await listRotatingBackups(root)).map((backup) => backup.name),
    };
  } finally {
    await releaseLock();
  }
}

module.exports = {
  AUTO_BACKUP_PREFIX,
  BACKUP_FORMAT_VERSION,
  BACKUP_LOCK_NAME,
  DEFAULT_BACKUP_RETENTION,
  createDataBackup,
  createRotatingDataBackup,
  defaultBackupDirectory,
  finalizeRestore,
  listRotatingBackups,
  normalizeBackupRetention,
  restoreDataDirectory,
  rollbackRestore,
  validateBackupDirectory,
};
