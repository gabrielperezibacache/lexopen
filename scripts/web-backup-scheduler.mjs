import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createRotatingDataBackup,
  defaultBackupDirectory,
  DEFAULT_BACKUP_RETENTION,
  normalizeBackupRetention,
} = require("../desktop/backup.cjs");

function warning(logger, message, error) {
  logger?.warn?.(
    message,
    error instanceof Error ? error.message : error || ""
  );
}

/**
 * Programa respaldos locales seguros para el Host web.
 *
 * El callback `stopHost` debe detener Next y PostgreSQL antes de copiar
 * `pgdata`. `startHost` debe volver a crear el proceso del Host después.
 */
export function createLocalBackupScheduler({
  dataDir,
  env = {},
  baseUrl,
  getChild,
  stopHost,
  startHost,
  waitForHost,
  backup = createRotatingDataBackup,
  logger = console,
} = {}) {
  const intervalMinutes = Number(env.LEXOPEN_BACKUP_INTERVAL_MINUTES || 0);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    return null;
  }

  let keep;
  try {
    keep = normalizeBackupRetention(
      env.LEXOPEN_BACKUP_KEEP || DEFAULT_BACKUP_RETENTION
    );
  } catch (error) {
    warning(logger, "[web-host] Configuración de retención inválida:", error);
    return null;
  }

  const configuredDirectory = String(env.LEXOPEN_BACKUP_DIR || "").trim();
  const backupDirectory = path.resolve(
    configuredDirectory || defaultBackupDirectory(dataDir)
  );
  let activeRun = null;
  let stopping = false;

  async function runNow() {
    if (activeRun) return activeRun;

    const run = (async () => {
      if (!getChild?.()) return;
      let hostStopped = false;
      try {
        logger.log(
          `[web-host] Respaldo automático iniciado (retención: ${keep}).`
        );
        await stopHost();
        hostStopped = true;
        const result = await backup(dataDir, backupDirectory, {
          appVersion: env.LEXOPEN_APP_VERSION || null,
          keep,
        });
        logger.log(
          `[web-host] Respaldo automático creado: ${result.destination}. ` +
            `Se eliminaron ${result.removed.length} respaldo(s) antiguo(s).`
        );
      } catch (error) {
        warning(logger, "[web-host] Respaldo automático falló:", error);
      } finally {
        if (!stopping && hostStopped && !getChild?.()) {
          try {
            startHost();
            const healthy = await waitForHost(baseUrl);
            if (!healthy) {
              warning(
                logger,
                "[web-host] El Host no respondió después del respaldo automático."
              );
            }
          } catch (error) {
            warning(
              logger,
              "[web-host] No se pudo reanudar el Host después del respaldo:",
              error
            );
          }
        }
      }
    })();

    activeRun = run;
    try {
      return await run;
    } finally {
      if (activeRun === run) activeRun = null;
    }
  }

  const timer = setInterval(() => void runNow(), intervalMinutes * 60_000);
  timer.unref?.();
  logger.log(
    `[web-host] Backups automáticos activos cada ${intervalMinutes} minutos en ${backupDirectory}.`
  );

  return {
    backupDirectory,
    keep,
    timer,
    runNow,
    async stop() {
      stopping = true;
      clearInterval(timer);
      if (activeRun) await activeRun;
    },
  };
}
