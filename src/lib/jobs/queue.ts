/** Durable PostgreSQL queue. A claim is a lease; every terminal write compares its token. */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { randomBytes } from "node:crypto";
export const JOB_LEASE_MS = 5 * 60_000;
export type EnqueueJobOpts = { tipo: string; payload?: Record<string, unknown>; runAt?: Date; dedupeKey?: string | null; maxIntentos?: number };
export type JobLease = { workerId: string; lockedAt: Date };
export async function enqueueJob(opts: EnqueueJobOpts, client: PrismaClient = prisma) {
  const id = newWorkerId();
  await client.job.createMany({ data: [{ id, tipo: opts.tipo, payloadJson: JSON.stringify(opts.payload || {}),
    runAt: opts.runAt || new Date(), dedupeKey: opts.dedupeKey || null, maxIntentos: opts.maxIntentos ?? 5 }], skipDuplicates: true });
  return opts.dedupeKey ? client.job.findUnique({ where: { dedupeKey: opts.dedupeKey } }) : client.job.findUnique({ where: { id } });
}
export function newWorkerId() { return `w_${randomBytes(16).toString("hex")}`; }
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];
export function backoffMs(intentos: number) { return BACKOFF_MS[Math.min(Math.max(0, intentos - 1), BACKOFF_MS.length - 1)]!; }

export async function recoverJobs(now = new Date(), client: PrismaClient = prisma, tipos?: string[]) {
  const cutoff = new Date(now.getTime() - JOB_LEASE_MS);
  return client.$executeRaw(Prisma.sql`
    UPDATE "Job" SET estado = CASE WHEN intentos >= "maxIntentos" THEN 'muerto' ELSE 'pendiente' END,
      "lockedAt" = NULL, "lockedBy" = NULL, "runAt" = (${now}::timestamptz AT TIME ZONE 'UTC'),
      "finishedAt" = CASE WHEN intentos >= "maxIntentos" THEN (${now}::timestamptz AT TIME ZONE 'UTC') ELSE NULL END,
      "lastError" = 'Lease vencida; ejecución recuperada'
    WHERE estado = 'corriendo' AND ("lockedAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC') OR "lockedAt" IS NULL)
      ${tipos?.length ? Prisma.sql`AND tipo IN (${Prisma.join(tipos)})` : Prisma.empty}
  `);
}

export async function claimJobs(opts: { tipos?: string[]; limit?: number; workerId?: string; now?: Date; client?: PrismaClient }) {
  const client = opts.client || prisma;
  const now = opts.now || new Date();
  await recoverJobs(now, client, opts.tipos);
  const limit = Math.min(Math.max(opts.limit || 10, 1), 50);
  const workerId = opts.workerId || newWorkerId();
  const tipoFilter = opts.tipos?.length ? Prisma.sql`AND tipo IN (${Prisma.join(opts.tipos)})` : Prisma.empty;
  return client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; tipo: string; payloadJson: string; intentos: number; maxIntentos: number }>>(Prisma.sql`
      SELECT id, tipo, "payloadJson", intentos, "maxIntentos" FROM "Job"
      WHERE estado = 'pendiente' AND "runAt" <= (${now}::timestamptz AT TIME ZONE 'UTC') AND intentos < "maxIntentos" ${tipoFilter}
      ORDER BY "runAt", id FOR UPDATE SKIP LOCKED LIMIT ${limit}
    `);
    if (rows.length) await tx.job.updateMany({ where: { id: { in: rows.map(r => r.id) }, estado: "pendiente" },
      data: { estado: "corriendo", lockedAt: now, lockedBy: workerId, intentos: { increment: 1 } } });
    return rows.map(row => ({ ...row, intentos: row.intentos + 1, workerId, lockedAt: now }));
  });
}

export async function completeJob(id: string, lease: JobLease, client: PrismaClient = prisma) {
  return client.job.updateMany({ where: { id, estado: "corriendo", lockedBy: lease.workerId, lockedAt: lease.lockedAt },
    data: { estado: "ok", finishedAt: new Date(), lastError: null, lockedAt: null, lockedBy: null } });
}
export async function failJob(opts: { id: string; error: string; intentos: number; maxIntentos: number } & JobLease, client: PrismaClient = prisma) {
  const dead = opts.intentos >= opts.maxIntentos;
  const result = await client.job.updateMany({
    where: { id: opts.id, estado: "corriendo", lockedBy: opts.workerId, lockedAt: opts.lockedAt },
    data: { estado: dead ? "muerto" : "pendiente", finishedAt: dead ? new Date() : null,
      runAt: new Date(Date.now() + backoffMs(opts.intentos)), lastError: opts.error.slice(0, 500), lockedAt: null, lockedBy: null },
  });
  return { dead, updated: result.count };
}
