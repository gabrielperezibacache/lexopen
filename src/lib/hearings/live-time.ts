export const HEARING_LIVE_MAX_SECONDS = 7 * 24 * 60 * 60;
export function hearingElapsedSeconds(state: { elapsedSeconds: number; phase: string; runningSince: Date | null }, now: Date): number {
  const base = Math.max(0, Math.min(HEARING_LIVE_MAX_SECONDS, state.elapsedSeconds));
  const running = state.phase === "running" && state.runningSince ? Math.max(0, Math.floor((now.getTime() - state.runningSince.getTime()) / 1000)) : 0;
  return Math.min(HEARING_LIVE_MAX_SECONDS, base + running);
}
