import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { defaultDataDir } = require("../desktop/config.cjs");
const { createDataBackup } = require("../desktop/backup.cjs");

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const dataDir = path.resolve(process.env.LEXOPEN_DATA_DIR || defaultDataDir());
const defaultOutput = path.join(
  path.dirname(dataDir),
  `${path.basename(dataDir)}-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
);
const output = path.resolve(option("--output") || defaultOutput);
const postmasterPid = path.join(dataDir, "pgdata", "postmaster.pid");

if (fs.existsSync(postmasterPid)) {
  console.error(
    "El Host parece estar activo. Detenga `npm run web:host` antes de respaldar."
  );
  process.exit(1);
}

const manifest = await createDataBackup(dataDir, output, {
  appVersion: process.env.LEXOPEN_APP_VERSION || null,
});
console.log(`Respaldo creado en: ${output}`);
console.log(`Componentes: ${manifest.includes.join(", ")}`);
console.log("El respaldo contiene .env y debe guardarse en un disco cifrado.");
