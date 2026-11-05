import { Prisma } from "@prisma/client";

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

type SearchClient = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => Promise<T>;
};

/** Use the same current Prisma read policy as the final result query. */
export type AuthorizeSearchIds = (ids: string[]) => Promise<Array<{ id: string }>>;

const FTS_BATCH_SIZE = 100;

/**
 * Scan stable candidate batches until the authorized result limit is reached.
 * A global FTS LIMIT must never let inaccessible matches displace visible ones.
 * Keep authorization in Prisma so matter walls, document flags and private audio
 * use their shared policies rather than a second, incomplete SQL translation.
 */
async function authorizedFtsIds(
  prismaClient: SearchClient,
  q: string,
  authorize: AuthorizeSearchIds,
  limit: number,
  table: Prisma.Sql,
  text: Prisma.Sql,
): Promise<string[] | null> {
  const needle = q.trim();
  if (!needle || limit === 0) return [];
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new RangeError("Invalid search result limit");
  const result: string[] = [];
  let cursor: string | null = null;
  while (result.length < limit) {
    let rows: Array<{ id: string }>;
    try {
      rows = await prismaClient.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM ${table}
         WHERE to_tsvector('spanish', unaccent(${text}))
               @@ plainto_tsquery('spanish', unaccent(${needle}))
           ${cursor === null ? Prisma.empty : Prisma.sql`AND id > ${cursor}`}
         ORDER BY id ASC
         LIMIT ${FTS_BATCH_SIZE}
      `);
    } catch {
      // Only unavailable FTS falls back to ILIKE. Authorization errors propagate.
      return null;
    }
    if (rows.length === 0) break;
    const allowed = new Set((await authorize(rows.map(row => row.id))).map(row => row.id));
    for (const row of rows) {
      if (allowed.has(row.id)) result.push(row.id);
      if (result.length === limit) break;
    }
    if (rows.length < FTS_BATCH_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }
  return result;
}

/** Postgres Spanish FTS; null means the caller should use its scoped ILIKE fallback. */
export async function ftsCausaIds(
  prismaClient: SearchClient,
  q: string,
  authorize: AuthorizeSearchIds,
  limit = 20,
): Promise<string[] | null> {
  return authorizedFtsIds(prismaClient, q, authorize, limit, Prisma.sql`"Causa"`,
    Prisma.sql`coalesce(titulo,'') || ' ' || coalesce(caratula,'') || ' ' || coalesce(rit,'')`);
}

export async function ftsDocumentoIds(
  prismaClient: SearchClient,
  q: string,
  authorize: AuthorizeSearchIds,
  limit = 20,
): Promise<string[] | null> {
  return authorizedFtsIds(prismaClient, q, authorize, limit, Prisma.sql`"Documento"`,
    Prisma.sql`coalesce(nombre,'') || ' ' || coalesce("extractedMarkdown",'') || ' ' || coalesce(contenido,'')`);
}

export async function ftsWikiIds(
  prismaClient: SearchClient,
  q: string,
  authorize: AuthorizeSearchIds,
  limit = 20,
): Promise<string[] | null> {
  return authorizedFtsIds(prismaClient, q, authorize, limit, Prisma.sql`"WikiPage"`,
    Prisma.sql`coalesce(title,'') || ' ' || coalesce(content,'')`);
}
