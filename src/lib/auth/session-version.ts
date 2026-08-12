/**
 * Resolve whether a signed session token version is still current.
 * Used by proxy (Node runtime) after HMAC verification.
 */

export type SessionVersionRow = {
  sessionVersion: number;
  role: string;
};

export function sessionVersionMatches(
  row: SessionVersionRow | null | undefined,
  tokenVersion: number,
  validRoles: Set<string>
): { ok: true; role: string } | { ok: false } {
  if (!row) return { ok: false };
  if (row.sessionVersion !== tokenVersion) return { ok: false };
  if (!validRoles.has(row.role)) return { ok: false };
  return { ok: true, role: row.role };
}
