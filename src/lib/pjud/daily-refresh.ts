import { prisma } from "@/lib/db";
import { caseRefreshWindow, nextCaseRefreshAt, CASE_REFRESH_LABEL } from "./daily-schedule.mjs";

export const SCHEDULED_REFRESH_NOTE = `Actualización automática programada para ${CASE_REFRESH_LABEL}. Las actualizaciones manuales siguen disponibles.`;
/** Durable admission: restarts cannot create a missed cycle later, and concurrent workers share it. */
export async function automaticRefreshCycle(now = new Date(), db = prisma): Promise<string | null> {
  const window = caseRefreshWindow(now);
  if (!window) return null;
  if (window.canStart) {
    await db.pjudRefreshReservation.createMany({ data: [{ scope: "cycle", slot: window.key }], skipDuplicates: true });
    return window.key;
  }
  return await db.pjudRefreshReservation.findUnique({ where: { scope_slot: { scope: "cycle", slot: window.key } }, select: { id: true } }) ? window.key : null;
}
/** A failed attempt consumes its slot too. No hidden automatic retry or same-slot recovery. */
export async function claimAutomaticRefresh(scope: string, now = new Date(), db = prisma) {
  const slot = await automaticRefreshCycle(now, db);
  if (!slot) return null;
  const result = await db.pjudRefreshReservation.createMany({ data: [{ scope, slot }], skipDuplicates: true });
  return result.count ? slot : null;
}
export function assertRefreshCycleActive(slot: string, now = new Date()) {
  if (caseRefreshWindow(now)?.key !== slot) throw new Error(SCHEDULED_REFRESH_NOTE);
}
export { nextCaseRefreshAt };
