import { promises as fs } from "node:fs";
import path from "node:path";

const BACKUP_FORMAT_VERSION = 1;
const BACKUP_PREFIX = "lexopen-backup-";
const MAX_RETENTION = 365;

export type BackupHealthStatus =
  | "disabled"
  | "healthy"
  | "missing"
  | "stale"
  | "unavailable";

export type BackupHealth = {
  enabled: boolean;
  intervalMinutes: number;
  retention: number | null;
  directoryConfigured: boolean;
  directoryState: "ready" | "missing" | "unavailable" | "not_configured";
  status: BackupHealthStatus;
  lastBackup: { name: string; createdAt: string; ageMinutes: number } | null;
};

function defaultBackupDirectory(dataDir: string) {
  const resolved = path.resolve(dataDir);
  const base = path.basename(resolved) || "lexopen-data";
  return path.join(path.dirname(resolved), `${base}-backups`);
}

async function latestBackup(directory: string) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "")
        : "";
    return {
      directoryState: code === "ENOENT" ? "missing" as const : "unavailable" as const,
      latest: null,
    };
  }

  let latest: { name: string; createdAt: string; timestamp: number } | null = null;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(BACKUP_PREFIX)) continue;
    try {
      const manifest = JSON.parse(
        await fs.readFile(path.join(directory, entry.name, "manifest.json"), "utf8")
      );
      if (
        manifest.formatVersion !== BACKUP_FORMAT_VERSION ||
        manifest.type !== "lexopen-host-data"
      ) {
        continue;
      }
      const timestamp = Date.parse(manifest.createdAt);
      if (!Number.isFinite(timestamp)) continue;
      if (!latest || timestamp > latest.timestamp) {
        latest = {
          name: entry.name,
          createdAt: new Date(timestamp).toISOString(),
          timestamp,
        };
      }
    } catch {
      // Ignore incomplete or foreign directories; never report them as valid backups.
    }
  }

  return { directoryState: "ready" as const, latest };
}

export async function getLocalBackupHealth(
  env: Record<string, string | undefined> = process.env
): Promise<BackupHealth> {
  const intervalMinutes = Number(env.LEXOPEN_BACKUP_INTERVAL_MINUTES || 0);
  const enabled = Number.isFinite(intervalMinutes) && intervalMinutes > 0;
  const retentionValue = Number(env.LEXOPEN_BACKUP_KEEP || 7);
  const retention =
    Number.isInteger(retentionValue) &&
    retentionValue >= 1 &&
    retentionValue <= MAX_RETENTION
      ? retentionValue
      : null;
  const directoryConfigured = Boolean(env.LEXOPEN_BACKUP_DIR?.trim());
  const dataDir = env.LEXOPEN_DATA_DIR?.trim();
  const directory = directoryConfigured
    ? path.resolve(env.LEXOPEN_BACKUP_DIR!)
    : dataDir
      ? defaultBackupDirectory(dataDir)
      : null;

  if (!directory) {
    return {
      enabled,
      intervalMinutes: enabled ? intervalMinutes : 0,
      retention,
      directoryConfigured,
      directoryState: "not_configured",
      status: enabled ? "unavailable" : "disabled",
      lastBackup: null,
    };
  }

  const scan = await latestBackup(directory);
  const lastBackup = scan.latest
    ? {
        name: scan.latest.name,
        createdAt: scan.latest.createdAt,
        ageMinutes: Math.max(
          0,
          Math.round((Date.now() - scan.latest.timestamp) / 60_000)
        ),
      }
    : null;
  let status: BackupHealthStatus = "disabled";
  if (enabled) {
    if (scan.directoryState === "unavailable") status = "unavailable";
    else if (scan.directoryState === "missing" || !lastBackup) status = "missing";
    else status = lastBackup.ageMinutes <= Math.max(intervalMinutes * 2, 60) ? "healthy" : "stale";
  }

  return {
    enabled,
    intervalMinutes: enabled ? intervalMinutes : 0,
    retention,
    directoryConfigured,
    directoryState: scan.directoryState,
    status,
    lastBackup,
  };
}
