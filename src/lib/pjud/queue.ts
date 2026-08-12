import { prisma } from "@/lib/db";
import { mapWithConcurrency } from "@/lib/pjud/concurrency";
import { syncCausaPjud, type SyncCausaResult } from "@/lib/pjud/sync";

const DEFAULT_BATCH = 40;

export function dueSyncWhere(opts?: {
  causaIds?: string[];
  now?: Date;
}) {
  const now = opts?.now || new Date();
  if (opts?.causaIds?.length) {
    return {
      id: { in: opts.causaIds },
      pjudMonitoreoActivo: true,
      estado: "activa" as const,
    };
  }
  return {
    pjudMonitoreoActivo: true,
    estado: "activa" as const,
    OR: [{ pjudNextSyncAt: null }, { pjudNextSyncAt: { lte: now } }],
  };
}

export async function enqueueDueSyncJobs(opts?: {
  causaIds?: string[];
  trigger?: "cron" | "manual" | "retry";
  limit?: number;
}) {
  const trigger = opts?.trigger || "cron";
  const limit = Math.min(Math.max(opts?.limit || DEFAULT_BATCH, 1), 200);

  const causas = await prisma.causa.findMany({
    where: dueSyncWhere({ causaIds: opts?.causaIds }),
    select: { id: true },
    orderBy: [{ pjudNextSyncAt: "asc" }, { updatedAt: "asc" }],
    take: limit,
  });

  const jobs = [];
  for (const c of causas) {
    const job = await prisma.pjudSyncJob.create({
      data: {
        causaId: c.id,
        status: "pending",
        trigger,
        attempts: 0,
      },
    });
    jobs.push(job);
  }
  return jobs;
}

export async function processPendingSyncJobs(opts?: {
  actorId?: string | null;
  concurrency?: number;
  limit?: number;
}) {
  const limit = Math.min(Math.max(opts?.limit || DEFAULT_BATCH, 1), 100);
  const pending = await prisma.pjudSyncJob.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const results: SyncCausaResult[] = [];
  await mapWithConcurrency(pending, opts?.concurrency || 2, async (job) => {
    await prisma.pjudSyncJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    });
    try {
      const result = await syncCausaPjud(job.causaId, {
        actorId: opts?.actorId,
        force: true,
        trigger: (job.trigger as "cron" | "manual" | "retry") || "cron",
        existingJobId: job.id,
      });
      results.push(result);
    } catch (error) {
      const note = error instanceof Error ? error.message : "Error";
      await prisma.pjudSyncJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          lastError: note,
          note,
          finishedAt: new Date(),
        },
      });
      results.push({
        causaId: job.causaId,
        inserted: 0,
        skipped: 0,
        provider: "none",
        demo: false,
        note,
        status: "failed",
        jobId: job.id,
        lastMovimientoAt: null,
        nextSyncAt: null,
        diasSinMovimiento: null,
        semaforo: "gris",
      });
    }
  });

  return results;
}

/** Enqueue due causas and process pending queue (cron path). */
export async function runDueSyncPipeline(opts?: {
  actorId?: string | null;
  causaIds?: string[];
  limit?: number;
}) {
  const enqueued = await enqueueDueSyncJobs({
    causaIds: opts?.causaIds,
    trigger: opts?.causaIds?.length ? "manual" : "cron",
    limit: opts?.limit,
  });
  const results = await processPendingSyncJobs({
    actorId: opts?.actorId,
    limit: opts?.limit,
  });
  return { enqueued: enqueued.length, synced: results.length, results };
}

export async function requeueFailedJobs(opts?: {
  causaIds?: string[];
  limit?: number;
}) {
  const failed = await prisma.pjudSyncJob.findMany({
    where: {
      status: "failed",
      ...(opts?.causaIds?.length ? { causaId: { in: opts.causaIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit || 50,
    distinct: ["causaId"],
  });

  const created = [];
  for (const job of failed) {
    created.push(
      await prisma.pjudSyncJob.create({
        data: {
          causaId: job.causaId,
          status: "pending",
          trigger: "retry",
          attempts: 0,
        },
      })
    );
  }
  return created;
}
