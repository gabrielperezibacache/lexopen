import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { defaultDataDir } = require("../desktop/config.cjs");
const { restoreDataDirectory } = require("../desktop/backup.cjs");

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const dataDir = path.resolve(process.env.LEXOPEN_DATA_DIR || defaultDataDir());
const source = option("--source");
if (!source) {
  console.error("Uso: npm run web:restore -- --source /ruta/al/respaldo");
  process.exit(2);
}

const postmasterPid = path.join(dataDir, "pgdata", "postmaster.pid");
if (fs.existsSync(postmasterPid)) {
  console.error(
    "El Host parece estar activo. Detenga `npm run web:host` antes de restaurar."
  );
  process.exit(1);
}

const replacement = await restoreDataDirectory(dataDir, path.resolve(source));
console.log("Restauración aplicada.");
console.log(`Rollback temporal conservado en: ${replacement.rollback}`);
console.log("Inicie `npm run web:host` para validar el arranque.");
