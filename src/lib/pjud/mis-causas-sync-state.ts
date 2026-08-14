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
