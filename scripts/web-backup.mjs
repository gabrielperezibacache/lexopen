import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { defaultDataDir } = require("../desktop/config.cjs");
const {
  createDataBackup,
  createRotatingDataBackup,
  defaultBackupDirectory,
} = require("../desktop/backup.cjs");

function option(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const dataDir = path.resolve(process.env.LEXOPEN_DATA_DIR || defaultDataDir());
const rotating = hasFlag("--rotate");
const outputOption = option("--output");
const backupDirectoryOption = option("--backup-dir");
if (rotating && outputOption) {
  console.error("Use `--backup-dir` con `--rotate`, no `--output`.");
  process.exit(2);
}
if (!rotating && backupDirectoryOption) {
  console.error("`--backup-dir` requiere la opción `--rotate`.");
  process.exit(2);
}

const defaultOutput = path.join(
  path.dirname(dataDir),
  `${path.basename(dataDir)}-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
);
const postmasterPid = path.join(dataDir, "pgdata", "postmaster.pid");

if (fs.existsSync(postmasterPid)) {
  console.error(
    "El Host parece estar activo. Detenga `npm run web:host` antes de respaldar."
  );
  process.exit(1);
}

if (rotating) {
  const backupDirectory = path.resolve(
    backupDirectoryOption ||
      process.env.LEXOPEN_BACKUP_DIR ||
      defaultBackupDirectory(dataDir)
  );
  const result = await createRotatingDataBackup(dataDir, backupDirectory, {
    appVersion: process.env.LEXOPEN_APP_VERSION || null,
    keep: option("--keep") || process.env.LEXOPEN_BACKUP_KEEP,
  });
  console.log(`Respaldo automático creado en: ${result.destination}`);
  console.log(`Respaldos conservados: ${result.retained.length}`);
  console.log(`Respaldos eliminados: ${result.removed.length}`);
} else {
  const output = path.resolve(outputOption || defaultOutput);
  const manifest = await createDataBackup(dataDir, output, {
    appVersion: process.env.LEXOPEN_APP_VERSION || null,
  });
  console.log(`Respaldo creado en: ${output}`);
  console.log(`Componentes: ${manifest.includes.join(", ")}`);
}
console.log("El respaldo contiene .env y debe guardarse en un disco cifrado.");
