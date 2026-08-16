/**
 * Búsqueda con normalización de acentos + FTS Postgres cuando esté disponible.
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

/** Build a plainto_tsquery-safe fragment for ILIKE fallback. */
export function likePattern(q: string) {
  return `%${q.replace(/[%_]/g, "\\$&")}%`;
}

/**
 * Postgres FTS over Causa titulo/caratula/rit using unaccent + plainto_tsquery.
 * Falls back to null when extension/query fails so callers use Prisma ILIKE.
 */
export async function ftsCausaIds(
  prismaClient: { $queryRawUnsafe: (sql: string, ...values: unknown[]) => Promise<unknown> },
  q: string,
  limit = 20
): Promise<string[] | null> {
  const needle = q.trim();
  if (!needle) return [];
  try {
    const rows = (await prismaClient.$queryRawUnsafe(
      `SELECT id FROM "Causa"
       WHERE to_tsvector('spanish', unaccent(coalesce(titulo,'') || ' ' || coalesce(caratula,'') || ' ' || coalesce(rit,'')))
             @@ plainto_tsquery('spanish', unaccent($1))
       LIMIT $2`,
      needle,
      limit
    )) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  } catch {
    return null;
  }
}

export async function ftsDocumentoIds(
  prismaClient: { $queryRawUnsafe: (sql: string, ...values: unknown[]) => Promise<unknown> },
  q: string,
  limit = 20
): Promise<string[] | null> {
  const needle = q.trim();
  if (!needle) return [];
  try {
    const rows = (await prismaClient.$queryRawUnsafe(
      `SELECT id FROM "Documento"
       WHERE to_tsvector('spanish', unaccent(coalesce(nombre,'') || ' ' || coalesce("extractedMarkdown",'') || ' ' || coalesce(contenido,'')))
             @@ plainto_tsquery('spanish', unaccent($1))
       LIMIT $2`,
      needle,
      limit
    )) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  } catch {
    return null;
  }
}

export async function ftsWikiIds(
  prismaClient: { $queryRawUnsafe: (sql: string, ...values: unknown[]) => Promise<unknown> },
  q: string,
  limit = 20
): Promise<string[] | null> {
  const needle = q.trim();
  if (!needle) return [];
  try {
    const rows = (await prismaClient.$queryRawUnsafe(
      `SELECT id FROM "WikiPage"
       WHERE to_tsvector('spanish', unaccent(coalesce(title,'') || ' ' || coalesce(content,'')))
             @@ plainto_tsquery('spanish', unaccent($1))
       LIMIT $2`,
      needle,
      limit
    )) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  } catch {
    return null;
  }
}
