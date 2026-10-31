/** After this, a stuck `running` status can be reclaimed (Playwright + cola). */
export const MIS_CAUSAS_SYNC_STUCK_MS = 20 * 60_000;

/** True while a Mis Causas sync is in progress and not stuck. */
export function isMisCausasSyncInFlight(opts: {
  status: string | null | undefined;
  lastSyncAt: Date | string | null | undefined;
  now?: Date;
  stuckMs?: number;
}): boolean {
  if (opts.status !== "running") return false;
  const at = opts.lastSyncAt ? new Date(opts.lastSyncAt).getTime() : NaN;
  if (!Number.isFinite(at)) return true;
  const age = (opts.now ?? new Date()).getTime() - at;
  return age < (opts.stuckMs ?? MIS_CAUSAS_SYNC_STUCK_MS);
}

/**
 * Where clause for atomic claim (updateMany count===1).
 * Allows claim when not running, or when running but stuck past stuckMs.
 */
export function misCausasClaimableWhere(opts: {
  settingsId: string;
  now?: Date;
  stuckMs?: number;
}) {
  const now = opts.now ?? new Date();
  const stuckCutoff = new Date(
    now.getTime() - (opts.stuckMs ?? MIS_CAUSAS_SYNC_STUCK_MS)
  );
  return {
    id: opts.settingsId,
    OR: [
      { claveUnicaLastSyncStatus: { not: "running" } },
      { claveUnicaLastSyncStatus: null },
      {
        AND: [
          { claveUnicaLastSyncStatus: "running" },
          {
            OR: [
              { claveUnicaLastSyncAt: { lt: stuckCutoff } },
              { claveUnicaLastSyncAt: null },
            ],
          },
        ],
      },
    ],
  };
}
