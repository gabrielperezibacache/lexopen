/**
 * API routes invoked by local Host schedulers with `x-cron-secret`.
 * Must stay in sync with scripts/local-host-schedulers.mjs.
 */
export const CRON_API_PATHS = [
  "/api/causas/monitoreo",
  "/api/pjud/mis-causas",
  "/api/pjud/digest",
  "/api/plazos/alertas",
  "/api/uf/sync",
  "/api/mail/sync",
] as const;

export function isCronApiPath(pathname: string): boolean {
  return (CRON_API_PATHS as readonly string[]).includes(pathname);
}

/** Edge/Node-safe constant-time compare for cron header vs CRON_SECRET. */
export function cronSecretMatches(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  const exp = expected?.trim();
  if (!exp || provided == null || provided === "") return false;
  const a = provided;
  const b = exp;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Same gate used by `src/proxy.ts` before allowing session-less cron POSTs. */
export function isAuthorizedCronRequest(
  pathname: string,
  providedSecret: string | null | undefined,
  expectedSecret: string | null | undefined = process.env.CRON_SECRET
): boolean {
  return (
    isCronApiPath(pathname) && cronSecretMatches(providedSecret, expectedSecret)
  );
}
