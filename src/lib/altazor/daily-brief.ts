import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { addCivilDays, santiagoDateKey, SANTIAGO_TZ } from "@/lib/chile-time";
import { prisma } from "@/lib/db";
import { zonedTime } from "@/lib/notify/time";
import { altazorActor, altazorTransaction } from "./access";

export const dailyBriefActionSchema = z.object({ action: z.enum(["enable", "pause", "run"]) }).strict();

const stateSelect = {
  dailyBriefNextAt: true,
  backgroundEnabled: true,
  dailyBriefs: { orderBy: { day: "desc" as const }, take: 1, select: { day: true } },
} as const;

function state(row: Prisma.AltazorCompanionGetPayload<{ select: typeof stateSelect }> | null) {
  return {
    enabled: Boolean(row?.dailyBriefNextAt),
    backgroundEnabled: row?.backgroundEnabled ?? true,
    lastDay: row?.dailyBriefs[0]?.day ?? null,
  };
}

export type DailyBriefState = ReturnType<typeof state>;

export async function readDailyBriefState(user: CausaAccessUser, client: PrismaClient = prisma) {
  const actor = await altazorActor(user, client);
  return state(await client.altazorCompanion.findUnique({ where: { ownerId: actor.id }, select: stateSelect }));
}

function nextDay(day: string) {
  return zonedTime(addCivilDays(day, 1), "00:00", SANTIAGO_TZ);
}

function recordBrief(tx: Prisma.TransactionClient, ownerId: string, day: string, now: Date) {
  return tx.altazorDailyBrief.upsert({
    where: { ownerId_day: { ownerId, day } },
    create: { ownerId, day, createdAt: now },
    update: {},
  });
}

export async function changeDailyBrief(
  action: z.infer<typeof dailyBriefActionSchema>["action"],
  user: CausaAccessUser,
  client: PrismaClient = prisma,
  now = new Date(),
): Promise<DailyBriefState> {
  return altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx);
    const ownerId = actor.id;
    const day = santiagoDateKey(now);
    const row = await tx.altazorCompanion.findUnique({ where: { ownerId }, select: stateSelect });
    let dailyBriefNextAt = row?.dailyBriefNextAt ?? null;
    if (action === "pause") dailyBriefNextAt = null;
    if (action === "enable" && !dailyBriefNextAt) dailyBriefNextAt = row?.dailyBriefs[0]?.day === day ? nextDay(day) : now;
    if (action === "run" && dailyBriefNextAt) dailyBriefNextAt = nextDay(day);
    await tx.altazorCompanion.upsert({
      where: { ownerId },
      create: { ownerId, dailyBriefNextAt },
      update: { dailyBriefNextAt },
    });
    if (action === "run") await recordBrief(tx, ownerId, day, now);
    return state(await tx.altazorCompanion.findUniqueOrThrow({ where: { ownerId }, select: stateSelect }));
  });
}

/** Creates at most one marker per opted-in user and civil day. The marker stores no source material. */
export async function processDueDailyBriefs({ client = prisma, now = new Date() }: { client?: PrismaClient; now?: Date } = {}) {
  const day = santiagoDateKey(now);
  const due = await client.altazorCompanion.findMany({
    where: { dailyBriefNextAt: { lte: now }, backgroundEnabled: true, owner: { role: { in: [...STAFF_ROLES] } } },
    select: { owner: { select: { id: true, role: true } } },
    orderBy: [{ dailyBriefNextAt: "asc" }, { ownerId: "asc" }],
    take: 20,
  });
  const next = nextDay(day);
  let failed = false;
  for (const { owner } of due) {
    try {
      await altazorTransaction(client, async tx => {
        const moved = await tx.altazorCompanion.updateMany({
          where: { ownerId: owner.id, dailyBriefNextAt: { lte: now }, backgroundEnabled: true },
          data: { dailyBriefNextAt: next },
        });
        if (!moved.count) return;
        // Move past ineligible accounts so a batch of revoked users cannot starve others.
        try {
          await altazorActor(owner, tx);
        } catch (error) {
          if ((error as { status?: number }).status === 403) return;
          throw error;
        }
        await recordBrief(tx, owner.id, day, now);
      });
    } catch {
      failed = true;
    }
  }
  if (failed) throw new Error("Algunos resúmenes diarios siguen pendientes.");
}
