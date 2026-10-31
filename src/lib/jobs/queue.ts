/**
 * Cola genérica Postgres con claim FOR UPDATE SKIP LOCKED (§7.2).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

export type EnqueueJobOpts = {
  tipo: string;
  payload?: Record<string, unknown>;
  runAt?: Date;
  dedupeKey?: string | null;
  maxIntentos?: number;
};

export async function enqueueJob(opts: EnqueueJobOpts) {
  try {
    return await prisma.job.create({
      data: {
        tipo: opts.tipo,
        payloadJson: JSON.stringify(opts.payload || {}),
        runAt: opts.runAt || new Date(),
        dedupeKey: opts.dedupeKey || null,
        maxIntentos: opts.maxIntentos ?? 5,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      opts.dedupeKey
    ) {
      return prisma.job.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    }
    throw error;
  }
}

export function newWorkerId() {
  return `w_${randomBytes(6).toString("hex")}`;
}

const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];

export function backoffMs(intentos: number) {
  return BACKOFF_MS[Math.min(intentos, BACKOFF_MS.length - 1)]!;
}

/** Reclama hasta `limit` jobs pendientes listos. */
export async function claimJobs(opts: {
  tipos?: string[];
  limit?: number;
  workerId?: string;
  now?: Date;
}) {
  const limit = Math.min(Math.max(opts.limit || 10, 1), 50);
  const workerId = opts.workerId || newWorkerId();
  const now = opts.now || new Date();
  const tipoFilter = opts.tipos?.length
    ? Prisma.sql`AND tipo IN (${Prisma.join(opts.tipos)})`
    : Prisma.empty;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        tipo: string;
        payloadJson: string;
        intentos: number;
        maxIntentos: number;
      }>
    >(Prisma.sql`
      SELECT id, tipo, "payloadJson", intentos, "maxIntentos"
      FROM "Job"
      WHERE estado = 'pendiente'
        AND "runAt" <= ${now}
        ${tipoFilter}
      ORDER BY "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `);

    if (!rows.length) return [] as typeof rows;

    const ids = rows.map((r) => r.id);
    await tx.job.updateMany({
      where: { id: { in: ids } },
      data: {
        estado: "corriendo",
        lockedAt: now,
        lockedBy: workerId,
        intentos: { increment: 1 },
      },
    });
    return rows;
  });
}

export async function completeJob(id: string) {
  await prisma.job.update({
    where: { id },
    data: { estado: "ok", finishedAt: new Date(), lastError: null },
  });
}

export async function failJob(opts: {
  id: string;
  error: string;
  intentos: number;
  maxIntentos: number;
}) {
  const dead = opts.intentos >= opts.maxIntentos;
  await prisma.job.update({
    where: { id: opts.id },
    data: dead
      ? {
          estado: "muerto",
          finishedAt: new Date(),
          lastError: opts.error.slice(0, 500),
          lockedAt: null,
          lockedBy: null,
        }
      : {
          estado: "pendiente",
          runAt: new Date(Date.now() + backoffMs(opts.intentos)),
          lastError: opts.error.slice(0, 500),
          lockedAt: null,
          lockedBy: null,
        },
  });
  return { dead };
}
