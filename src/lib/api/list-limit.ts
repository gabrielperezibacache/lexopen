/**
 * Server-side list pagination helper.
 * Caps unbounded `findMany` responses while staying backward-compatible
 * with clients that omit `limit` (generous defaults).
 */

export type ListLimitOptions = {
  /** Default when param missing/invalid. */
  default?: number;
  /** Hard ceiling. */
  max?: number;
};

/** Parse `?limit=` into a safe take value. */
export function parseListLimit(
  raw: string | null | undefined,
  opts?: ListLimitOptions
): number {
  const def = opts?.default ?? 100;
  const max = opts?.max ?? 500;
  const n = Number(raw ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}
