/** Keyset windows retain bounded reads without hiding the rest of the history. */
export type ListCursor = { at: Date; id: string };
export function readListCursor(raw?: string): ListCursor | null {
  if (!raw || raw.length > 512 || !/^[\w-]+$/.test(raw)) return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof at !== "string" || typeof id !== "string" || !/^[\w-]{1,128}$/.test(id)) return null;
    const date = new Date(at);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== at) return null;
    return { at: date, id };
  } catch { return null; }
}
export function listCursorWhere(raw: string | undefined, field: "updatedAt" | "createdAt") {
  const cursor = readListCursor(raw);
  return cursor ? { OR: [{ [field]: { lt: cursor.at } }, { [field]: cursor.at, id: { lt: cursor.id } }] } : {};
}
export function listWindow<T extends { id: string; updatedAt?: Date; createdAt?: Date }>(rows: T[], size: number, field: "updatedAt" | "createdAt") {
  const items = rows.slice(0, size), last = items.at(-1);
  return { items, next: rows.length > size && last ? Buffer.from(JSON.stringify([last[field]!.toISOString(), last.id])).toString("base64url") : null };
}
export function listPageHref(path: string, filters: Record<string, string | undefined>, after?: string | null) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value && key !== "after") query.set(key, value);
  if (after) query.set("after", after);
  return path + (query.size ? `?${query}` : "");
}
