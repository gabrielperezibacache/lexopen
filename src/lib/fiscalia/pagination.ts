import type { Prisma } from "@prisma/client";
type Row = { id: string; followUpDate: Date | null; updatedAt: Date };
export function fiscaliaCursor(row: Row) {
  return Buffer.from(JSON.stringify([row.followUpDate?.toISOString() ?? null, row.updatedAt.toISOString(), row.id])).toString("base64url");
}
export function fiscaliaCursorWhere(raw?: string): Prisma.FiscaliaRequestWhereInput {
  if (!raw || raw.length > 512 || !/^[\w-]+$/.test(raw)) return {};
  try {
    const [follow, updated, id] = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id) || typeof updated !== "string" || !(follow === null || typeof follow === "string")) return {};
    const at = new Date(updated), date = follow === null ? null : new Date(follow);
    if (!Number.isFinite(at.getTime()) || at.toISOString() !== updated || date && (!Number.isFinite(date.getTime()) || date.toISOString() !== follow)) return {};
    const tail: Prisma.FiscaliaRequestWhereInput[] = [{ followUpDate: date, updatedAt: { lt: at } }, { followUpDate: date, updatedAt: at, id: { gt: id } }];
    return { OR: date ? [{ followUpDate: { gt: date } }, { followUpDate: null }, ...tail] : tail };
  } catch { return {}; }
}
