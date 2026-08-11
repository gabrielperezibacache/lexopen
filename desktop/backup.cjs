const fs = require("fs/promises");
const path = require("path");

const BACKUP_FORMAT_VERSION = 1;

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
    const manifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      type: "lexopen-host-data",
      createdAt: new Date().toISOString(),
      sourceDataDir: source,
      appVersion: metadata.appVersion || null,
      databaseDirectory: "pgdata",
      storageDirectory: "storage",
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

module.exports = {
  BACKUP_FORMAT_VERSION,
  createDataBackup,
  finalizeRestore,
  restoreDataDirectory,
  rollbackRestore,
  validateBackupDirectory,
};
