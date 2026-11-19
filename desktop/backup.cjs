const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { createReadStream } = require("node:fs");

const BACKUP_FORMAT_VERSION = 2;
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

// Resolve existing ancestors before creating any directories. An alias must
// not turn an apparently external destination into a copy inside the source.
async function resolvedDestination(file) {
  let current = absolute(file);
  const missing = [];
  for (;;) {
    try { return path.join(await fs.realpath(current), ...missing); }
    catch (error) {
      if (error?.code !== "ENOENT" || path.dirname(current) === current) throw error;
      missing.unshift(path.basename(current)); current = path.dirname(current);
    }
  }
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

// Read actual paths, never paths supplied by the manifest. Links cannot escape
// the backup or silently substitute another installation's files.
async function backupInventory(root) {
  const entries = [];
  async function visit(directory) {
    const children = await fs.readdir(directory, { withFileTypes: true });
    children.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const child of children) {
      const file = path.join(directory, child.name);
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (relative === "manifest.json") continue;
      if (child.isSymbolicLink()) throw new Error("El respaldo contiene enlaces; prepare una copia local independiente.");
      if (child.isDirectory()) {
        entries.push({ path: relative, type: "directory" });
        await visit(file);
      } else if (child.isFile()) {
        const hash = crypto.createHash("sha256"); let size = 0;
        for await (const chunk of createReadStream(file)) { hash.update(chunk); size += chunk.length; }
        entries.push({ path: relative, type: "file", size, sha256: hash.digest("hex") });
      } else throw new Error("El respaldo contiene un archivo especial no compatible.");
    }
  }
  await visit(root);
  return entries;
}

async function verifyBackupIntegrity(root, manifest) {
  if (manifest.integrity === undefined && manifest.formatVersion === 1) return false;
  if (manifest.integrity?.algorithm !== "sha256" || !Array.isArray(manifest.integrity.entries)) throw new Error("Índice de integridad del respaldo inválido.");
  if (JSON.stringify(await backupInventory(root)) !== JSON.stringify(manifest.integrity.entries)) throw new Error("Integridad del respaldo inválida: hay archivos alterados, ausentes o adicionales.");
  return true;
}

async function validateBackupDirectory(backupDir) {
  const root = absolute(backupDir);
  const manifestPath = path.join(root, "manifest.json");
  if ((await fs.lstat(root)).isSymbolicLink() || !(await fs.lstat(manifestPath)).isFile() || (await fs.lstat(manifestPath)).isSymbolicLink()) throw new Error("El respaldo y su manifiesto deben ser archivos locales independientes.");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (
    ![1, BACKUP_FORMAT_VERSION].includes(manifest.formatVersion) ||
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
  const integrityVerified = await verifyBackupIntegrity(root, manifest);
  return { root, manifest, integrityVerified };
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
  if ((await fs.lstat(source)).isSymbolicLink()) throw new Error("El directorio de datos no puede ser un enlace para este respaldo.");
  const realSource = await fs.realpath(source), realOutput = await resolvedDestination(output);
  if (isWithin(realSource, realOutput) || isWithin(realOutput, realSource)) throw new Error("El respaldo debe quedar fuera y separado del directorio de datos, incluidos sus enlaces.");
  if ((await fs.lstat(output).catch(() => null))?.isSymbolicLink()) throw new Error("El destino del respaldo no puede ser un enlace.");
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
    const entries = await backupInventory(source);
    await fs.chmod(temporary, 0o700);
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
      integrity: { algorithm: "sha256", entries },
    };
    await fs.writeFile(
      path.join(temporary, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
    // Compare the finished copy against the stopped Host before publishing it.
    await validateBackupDirectory(temporary);
    await fs.rmdir(output).catch(error => { if (error.code !== "ENOENT") throw error; });
    await fs.rename(temporary, output);
    return manifest;
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

// Older, unmanaged backups can be restored as before. The normal desktop/CLI
// path must rebase an embedded Host when its destination differs from its origin.
async function needsManagedRelocation(root, target, manifest) {
  const file = path.join(root, ".env");
  const stat = await fs.lstat(file).catch(error => { if (error.code !== "ENOENT") throw error; });
  if (!stat) return false;
  if (!stat.isFile()) throw new Error("La configuración del respaldo debe ser un archivo local.");
  const { parseEnvFile } = require("./config.cjs");
  const { map } = parseEnvFile(await fs.readFile(file, "utf8"));
  if (map.LEXOPEN_DESKTOP !== "1") return false;
  const original = manifest.sourceDataDir || map.LEXOPEN_DATA_DIR;
  if (!original || !path.isAbsolute(original) || map.LEXOPEN_DATA_DIR && path.relative(original, map.LEXOPEN_DATA_DIR) !== "") {
    throw new Error("El origen del Host no coincide con su configuración o utiliza rutas de otra plataforma.");
  }
  return path.relative(original, target) !== "";
}

/** Relocate only a declared managed embedded Host, never external storage/databases. */
async function relocateRestoredHost(target, manifest) {
  const { parseEnvFile, serializeEnv } = require("./config.cjs");
  const file = path.join(target, ".env");
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("La configuración restaurada no es un archivo local.");
  const parsed = parseEnvFile(await fs.readFile(file, "utf8")), oldRoot = absolute(manifest.sourceDataDir);
  if (parsed.map.LEXOPEN_DESKTOP !== "1" || !manifest.sourceDataDir || absolute(parsed.map.LEXOPEN_DATA_DIR) !== oldRoot) throw new Error("La reubicación requiere un respaldo de Host embebido identificado.");
  if (isWithin(oldRoot,target) || isWithin(target,oldRoot)) throw new Error("La reubicación necesita un destino separado del origen.");
  const db = new URL(parsed.map.DATABASE_URL);
  if (!["postgres:","postgresql:"].includes(db.protocol) || !["127.0.0.1","localhost","[::1]"].includes(db.hostname) || db.search || db.hash) throw new Error("No se reubicó una base externa o con opciones no administradas.");
  if (["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].some(key => parsed.map[key])) throw new Error("El respaldo usa almacenamiento S3 externo; requiere una recuperación preparada.");
  for (const key of ["STORAGE_PATH", "OBSIDIAN_VAULT_PATH", "LEXOPEN_DATA_DIR", "CODEX_DATA_DIR"]) {
    if (!parsed.map[key]) continue;
    const previous = absolute(parsed.map[key]);
    if (!isWithin(oldRoot, previous)) throw new Error("El respaldo usa rutas externas; requiere una recuperación preparada.");
    parsed.map[key] = path.join(target, path.relative(oldRoot, previous));
  }
  // PostgreSQL tablespace/config links must not point back into the original installation.
  async function localTree(dir) { for (const entry of await fs.readdir(dir,{withFileTypes:true})) { const item=path.join(dir,entry.name); if(entry.isSymbolicLink())throw new Error("La base restaurada incluye enlaces externos.");if(entry.isDirectory())await localTree(item); } }
  for (const name of ["pgdata", "storage", "obsidian-vault"]) {
    const item=path.join(target,name);if(!await exists(item))continue;
    if((await fs.lstat(item)).isSymbolicLink())throw new Error("La restauración incluye una carpeta enlazada.");
    await localTree(item);
  }
  const configFile = path.join(target, "desktop-config.json");
  if (await exists(configFile)) {
    if (!(await fs.lstat(configFile)).isFile()) throw new Error("La configuración de escritorio restaurada no es un archivo local.");
    const config = JSON.parse(await fs.readFile(configFile, "utf8"));
    if (config.hostDataDir) {
      if (path.relative(oldRoot, config.hostDataDir) !== "") throw new Error("La carpeta de datos seleccionada en el respaldo pertenece a otra instalación.");
      config.hostDataDir = target;
      await fs.writeFile(configFile, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    }
  }
  await fs.writeFile(file, serializeEnv(parsed.map, parsed.order), {mode:0o600});
}

async function restoreDataDirectory(dataDir, backupDir, { relocateManagedHost } = {}) {
  const target = absolute(dataDir);
  const { root, manifest, integrityVerified } = await validateBackupDirectory(backupDir);
  const realRoot = await fs.realpath(root), realTarget = await resolvedDestination(target);
  if (isWithin(realRoot, realTarget) || isWithin(realTarget, realRoot)) throw new Error("El respaldo y el destino deben permanecer separados, incluidos sus enlaces.");
  const relocate = relocateManagedHost ?? await needsManagedRelocation(root, target, manifest);
  if (relocate && typeof manifest.sourceDataDir === "string") {
    const original = await fs.realpath(manifest.sourceDataDir).catch(() => null);
    if (original && (isWithin(original, realTarget) || isWithin(realTarget, original))) throw new Error("La reubicación necesita un destino separado del origen, incluidos sus enlaces.");
  }
  if (target === root || isWithin(target, root) || isWithin(root, target)) {
    throw new Error("El respaldo no puede estar dentro del directorio de datos del Host");
  }

  const parent = path.dirname(target);
  const rollback = path.join(
    parent,
    `.${path.basename(target)}.before-restore-${Date.now()}`
  );
  if (!await exists(target)) await fs.mkdir(target,{recursive:true,mode:0o700});
  if ((await fs.lstat(target)).isSymbolicLink()) throw new Error("El destino no puede ser un enlace.");
  await fs.rename(target, rollback);
  try {
    await fs.cp(root, target, { recursive: true, force: false });
    await verifyBackupIntegrity(target, manifest);
    await fs.rm(path.join(target, "manifest.json"), { force: true });
    if (relocate) await relocateRestoredHost(target, manifest);
    if (await exists(path.join(target, ".env"))) {
      await fs.chmod(path.join(target, ".env"), 0o600);
    }
    return { rollback, manifest, integrityVerified, relocated: relocate };
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
        ![1, BACKUP_FORMAT_VERSION].includes(manifest.formatVersion) ||
        manifest.formatVersion === 2 && (manifest.integrity?.algorithm !== "sha256" || !Array.isArray(manifest.integrity?.entries)) ||
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
