/**
 * Búsqueda con normalización de acentos (Postgres FTS-ready).
 * En SQLite usa contains case-insensitive aproximado.
 */

export function normalizeSearch(q: string) {
  return q
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesNormalized(haystack: string | null | undefined, needle: string) {
  if (!haystack) return false;
  return normalizeSearch(haystack).includes(normalizeSearch(needle));
}
