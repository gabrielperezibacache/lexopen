import type { Prisma } from "@prisma/client";

/** Desktop lifetime is separate from task, control and credential authorizations. */
export function computerSessionExpired(session: { expiresAt: Date | null }, now = Date.now()) {
  return session.expiresAt !== null && session.expiresAt.getTime() <= now;
}
export function activeComputerSessionWhere(now = new Date()): Prisma.AltazorComputerSessionWhereInput {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}
