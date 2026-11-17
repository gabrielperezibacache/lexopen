import type { Prisma } from "@prisma/client";
import {
  plazoAccessWhere,
  type CausaAccessUser,
} from "@/lib/auth/causa-access";
import { addCivilDays, santiagoDateKey } from "@/lib/chile-time";
import { deadlineBefore, deadlineSpan } from "./pagination";
export type PersonalDeadlineView = "mis-vencidos" | "proximos";
export function upcomingDeadlinePeriod(now = new Date()) {
  const first = santiagoDateKey(now);
  return { first, through: addCivilDays(first, 7) };
}
/** One predicate for the workday counter, the list and its API. */
export function personalDeadlineWhere(
  user: CausaAccessUser,
  view: PersonalDeadlineView,
  now = new Date(),
): Prisma.PlazoWhereInput {
  const { first, through } = upcomingDeadlinePeriod(now);
  return {
    AND: [
      plazoAccessWhere(user),
      { estado: "pendiente", responsableId: user.id },
      view === "mis-vencidos"
        ? deadlineBefore(first)
        : deadlineSpan(first, through),
    ],
  };
}
