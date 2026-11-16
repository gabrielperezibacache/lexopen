import type { Prisma } from "@prisma/client";
import { readListCursor } from "@/lib/api/list-window";
import { addCivilDays, isValidYmd, santiagoMidnight } from "@/lib/chile-time";
import { httpError } from "@/lib/auth/access";
export function deadlineCursorWhere(after?: string): Prisma.PlazoWhereInput {
  const cursor = readListCursor(after);
  return cursor
    ? {
        OR: [
          { fechaLimite: { gt: cursor.at } },
          { fechaLimite: cursor.at, id: { gt: cursor.id } },
        ],
      }
    : {};
}
export function deadlineWindow<T extends { id: string; fechaLimite: Date }>(
  rows: T[],
  limit: number,
) {
  const items = rows.slice(0, limit),
    last = items.at(-1);
  return {
    items,
    next:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify([last.fechaLimite.toISOString(), last.id]),
          ).toString("base64url")
        : null,
  };
}
/** Date-only UTC records and legacy instants share civilDateKey semantics. */
export function deadlineBefore(today: string): Prisma.PlazoWhereInput {
  return {
    fechaLimite: { lt: santiagoMidnight(today) },
    NOT: { fechaLimite: new Date(today + "T00:00:00.000Z") },
  };
}
export function deadlineMonth(month: string): Prisma.PlazoWhereInput {
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !isValidYmd(month + "-01") ||
    Number(month.slice(0, 4)) < 1900 ||
    Number(month.slice(0, 4)) > 2200
  )
    throw httpError("Mes inválido", 400);
  const first = month + "-01",
    [year, m] = month.split("-").map(Number);
  const last = `${month}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}`,
    next = addCivilDays(last, 1);
  return {
    OR: [
      { fechaLimite: new Date(first + "T00:00:00.000Z") },
      {
        fechaLimite: {
          gte: santiagoMidnight(first),
          lt: santiagoMidnight(next),
        },
        NOT: { fechaLimite: new Date(next + "T00:00:00.000Z") },
      },
    ],
  };
}
