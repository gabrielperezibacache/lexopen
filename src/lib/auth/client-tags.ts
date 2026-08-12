/**
 * Shared helpers for “shared with client portal” file tags.
 * Tokens are comma/semicolon separated (spaces trimmed), case-insensitive.
 * Exact token `cliente` only — avoids substring false positives like `no_cliente`.
 */

export function parseTagTokens(tags: string | null | undefined): string[] {
  return (tags || "")
    .split(/[,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function isClientSharedTag(tags: string | null | undefined): boolean {
  return parseTagTokens(tags).includes("cliente");
}

/**
 * Prisma where approximating exact token `cliente` without substring traps.
 * Still apply `isClientSharedTag` as a post-filter when returning rows.
 */
export function clientSharedTagPrismaWhere() {
  return {
    OR: [
      { tags: "cliente" },
      { tags: { startsWith: "cliente," } },
      { tags: { startsWith: "cliente;" } },
      { tags: { endsWith: ",cliente" } },
      { tags: { endsWith: ";cliente" } },
      { tags: { contains: ",cliente," } },
      { tags: { contains: ";cliente;" } },
      { tags: { contains: ",cliente;" } },
      { tags: { contains: ";cliente," } },
    ],
  };
}
