import { prisma } from "@/lib/db";
import { mapWithConcurrency } from "@/lib/pjud/concurrency";
import { syncCausaPjud, type SyncCausaResult } from "@/lib/pjud/sync";

const DEFAULT_BATCH = 40;
/**
 * Concurrency del worker de sync — CausaMonitor API usa worker.concurrency=5
 * (`GET https://api.causamonitor.com/api/health`).
 */
export function pjudSyncConcurrency() {
  const n = Number(process.env.PJUD_SYNC_CONCURRENCY || 5);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(Math.floor(n), 10);
}
/** Jobs stuck in `running` longer than this are reclaimed to pending. */
const STUCK_RUNNING_MS = Number(
  process.env.PJUD_SYNC_STUCK_MS || 30 * 60_000
);

export function dueSyncWhere(opts?: {
  causaIds?: string[];
  now?: Date;
}) {
  const now = opts?.now || new Date();
  if (opts?.causaIds !== undefined) {
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

export async function reclaimStuckRunningJobs(opts?: { olderThanMs?: number }) {
  const cutoff = new Date(
    Date.now() - (opts?.olderThanMs || STUCK_RUNNING_MS)
  );
  const result = await prisma.pjudSyncJob.updateMany({
    where: {
      status: "running",
      OR: [{ startedAt: { lt: cutoff } }, { startedAt: null, createdAt: { lt: cutoff } }],
    },
    data: {
      status: "pending",
      lastError: "Reclamado: job stuck en running",
      note: "Reclaim stuck running → pending",
      startedAt: null,
    },
  });
  return result.count;
}

async function causaIdsWithActiveJobs(causaIds: string[]) {
  if (!causaIds.length) return new Set<string>();
  const active = await prisma.pjudSyncJob.findMany({
    where: {
      causaId: { in: causaIds },
      status: { in: ["pending", "running"] },
    },
    select: { causaId: true },
    distinct: ["causaId"],
  });
  return new Set(active.map((j) => j.causaId));
}

export async function enqueueDueSyncJobs(opts?: {
  causaIds?: string[];
  trigger?: "cron" | "manual" | "retry";
  limit?: number;
}) {
  if (opts?.causaIds !== undefined && opts.causaIds.length === 0) return [];
  const trigger = opts?.trigger || "cron";
  const limit = Math.min(Math.max(opts?.limit || DEFAULT_BATCH, 1), 200);

  await reclaimStuckRunningJobs();

  const causas = await prisma.causa.findMany({
    where: dueSyncWhere({ causaIds: opts?.causaIds }),
    select: { id: true },
    orderBy: [{ pjudNextSyncAt: "asc" }, { updatedAt: "asc" }],
    take: limit * 2, // over-fetch to allow dedupe
  });

  const busy = await causaIdsWithActiveJobs(causas.map((c) => c.id));
  const jobsData = [];
  for (const c of causas) {
    if (jobsData.length >= limit) break;
    if (busy.has(c.id)) continue;
    jobsData.push({
      causaId: c.id,
      status: "pending",
      trigger,
      attempts: 0,
    });
    busy.add(c.id);
  }

  if (jobsData.length === 0) return [];

  const jobs = await prisma.pjudSyncJob.createManyAndReturn({
    data: jobsData,
  });
  return jobs;
}

export async function processPendingSyncJobs(opts?: {
  actorId?: string | null;
  concurrency?: number;
  limit?: number;
  jobIds?: string[];
}) {
  // An explicitly empty selection must never expand to the entire queue.
  if (opts?.jobIds !== undefined && opts.jobIds.length === 0) return [];
  const limit = Math.min(Math.max(opts?.limit || DEFAULT_BATCH, 1), 100);
  await reclaimStuckRunningJobs();

  const pending = await prisma.pjudSyncJob.findMany({
    where: {
      status: "pending",
      ...(opts?.jobIds?.length ? { id: { in: opts.jobIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const results: SyncCausaResult[] = [];
  const concurrency = opts?.concurrency ?? pjudSyncConcurrency();
  await mapWithConcurrency(pending, concurrency, async (job) => {
    const claimed = await prisma.pjudSyncJob.updateMany({
      where: { id: job.id, status: "pending" },
      data: {
        status: "running",
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    });
    if (claimed.count === 0) return; // another worker already claimed it
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
    // Cron drains the oldest pending jobs; manual runs stay within their selection.
    jobIds: opts?.causaIds !== undefined ? enqueued.map((j) => j.id) : undefined,
  });
  return { enqueued: enqueued.length, synced: results.length, results };
}

export async function requeueFailedJobs(opts?: {
  causaIds?: string[];
  limit?: number;
}) {
  if (opts?.causaIds !== undefined && opts.causaIds.length === 0) return [];
  await reclaimStuckRunningJobs();

  const failed = await prisma.pjudSyncJob.findMany({
    where: {
      status: "failed",
      ...(opts?.causaIds?.length ? { causaId: { in: opts.causaIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit || 50,
    distinct: ["causaId"],
  });

  const busy = await causaIdsWithActiveJobs(failed.map((j) => j.causaId));
  const toCreate = [];
  for (const job of failed) {
    if (busy.has(job.causaId)) continue;
    toCreate.push({
      causaId: job.causaId,
      status: "pending",
      trigger: "retry",
      attempts: 0,
    });
    busy.add(job.causaId);
  }

  if (toCreate.length === 0) return [];
  return await prisma.pjudSyncJob.createManyAndReturn({
    data: toCreate,
  });
}

/**
 * Estado de cola durable `PjudSyncJob`.
 * Shape compatible con CausaMonitor `GET /api/queue/stats`
 * (`waiting` / `active` / `completed` / `failed` / `delayed`) más aliases LexOpen.
 */
export async function getPjudQueueStatus() {
  const [waiting, active, completed, failed, okToday] = await Promise.all([
    prisma.pjudSyncJob.count({ where: { status: "pending" } }),
    prisma.pjudSyncJob.count({ where: { status: "running" } }),
    prisma.pjudSyncJob.count({ where: { status: "ok" } }),
    prisma.pjudSyncJob.count({ where: { status: "failed" } }),
    prisma.pjudSyncJob.count({
      where: {
        status: "ok",
        finishedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);
  return {
    // CausaMonitor / Bull-style
    waiting,
    active,
    completed,
    failed,
    delayed: 0,
    // LexOpen aliases (Host status UI)
    pending: waiting,
    running: active,
    okToday,
    workerConcurrency: pjudSyncConcurrency(),
  };
}
