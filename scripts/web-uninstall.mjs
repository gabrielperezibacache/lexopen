/**
 * Desinstala los datos del Host LexOpen (Postgres embebido, .env, documentos).
 *
 *   npm run web:uninstall -- --yes
 *   LEXOPEN_DATA_DIR=/ruta npm run web:uninstall -- --yes
 *
 * No borra el clon del repositorio ni Chromium de Playwright; vea el README.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { defaultDataDir } = require("../desktop/config.cjs");

function hasFlag(name) {
  return process.argv.includes(name);
}

function option(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

export function resolveUninstallDataDir({
  env = process.env,
  dataDirOption = null,
} = {}) {
  return path.resolve(dataDirOption || env.LEXOPEN_DATA_DIR || defaultDataDir());
}

export function assertHostStopped(dataDir) {
  const postmasterPid = path.join(dataDir, "pgdata", "postmaster.pid");
  if (fs.existsSync(postmasterPid)) {
    throw new Error(
      "El Host parece estar activo. Detenga `npm run web:host` (o Desktop) antes de desinstalar."
    );
  }
}

export function uninstallDataDirectory(dataDir, { dryRun = false } = {}) {
  const resolved = path.resolve(dataDir);
  if (!fs.existsSync(resolved)) {
    return { removed: false, path: resolved, reason: "missing" };
  }
  if (!dryRun) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  return { removed: true, path: resolved, reason: "deleted" };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const yes = hasFlag("--yes") || hasFlag("-y");
  const dryRun = hasFlag("--dry-run");
  const dataDir = resolveUninstallDataDir({
    dataDirOption: option("--data-dir"),
  });

  if (!yes && !dryRun) {
    console.error(`Esto borrará de forma permanente los datos del Host:

  ${dataDir}

Incluye PostgreSQL embebido, documentos, vault Obsidian y .env (secretos).
Si necesita conservar algo, cree antes un respaldo:

  npm run web:backup -- --output /ruta/externa/lexopen-backup

Luego confirme con:

  npm run web:uninstall -- --yes

Opciones: --data-dir <ruta>  ·  --dry-run  ·  LEXOPEN_DATA_DIR`);
    process.exit(2);
  }

  try {
    assertHostStopped(dataDir);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const result = uninstallDataDirectory(dataDir, { dryRun });
  if (result.reason === "missing") {
    console.log(`No había carpeta de datos en: ${result.path}`);
  } else if (dryRun) {
    console.log(`[dry-run] Se eliminaría: ${result.path}`);
  } else {
    console.log(`Datos del Host eliminados: ${result.path}`);
  }

  console.log(`
El clon del repositorio no se borró. Para quitar también el código:

  cd .. && rm -rf lexopen          # macOS / Linux
  # Windows: Remove-Item -Recurse -Force .\\lexopen

Si instaló un servicio automático, deshabilítelo (systemctl / launchctl /
tarea programada). Chromium de Playwright queda en la caché del usuario;
opcional: npx playwright uninstall
`);
}
