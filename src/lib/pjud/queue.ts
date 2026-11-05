import { causaAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCaseManagementMode, pausePjudManagementJobs } from "@/lib/causas/management-mode";
import { mapWithConcurrency } from "@/lib/pjud/concurrency";
import { syncCausaPjud, type PjudMovimientosFetcher, type SyncCausaResult } from "@/lib/pjud/sync";

/** True when insert hit the partial unique (already pending/running for causa). */
export function isActiveJobUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const DEFAULT_BATCH = 40;
/** Durable reservation: these jobs are usable only by their in-memory session provider. */
export const PJUD_MANUAL_SESSION_TRIGGER = "manual-session" as const;
export const PJUD_MANUAL_SESSION_JOB_TTL_MS = 30 * 60_000;
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
    // Selección explícita (Mis Causas / UI): incluir terminadas para el sync
    // inicial de movimientos; el cron automático sigue limitado a activas.
    return {
      id: { in: opts.causaIds },
      pjudMonitoreoActivo: true,
    };
  }
  return {
    pjudMonitoreoActivo: true,
    estado: "activa" as const,
    OR: [{ pjudNextSyncAt: null }, { pjudNextSyncAt: { lte: now } }],
  };
}

export async function reclaimStuckRunningJobs(opts?: { olderThanMs?: number; jobIds?: string[]; causaIds?: string[] }) {
  if (opts?.jobIds?.length === 0 || opts?.causaIds?.length === 0) return 0;
  const cutoff = new Date(
    Date.now() - (opts?.olderThanMs || STUCK_RUNNING_MS)
  );
  const result = await prisma.pjudSyncJob.updateMany({
    where: {
      status: "running",
      trigger: { not: PJUD_MANUAL_SESSION_TRIGGER },
      ...(opts?.jobIds ? { id: { in: opts.jobIds } } : {}),
      ...(opts?.causaIds ? { causaId: { in: opts.causaIds } } : {}),
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

/** An expired browser reservation fails in place; it must never become a generic pending job. */
export async function expireManualSessionSyncJobs(opts?: { jobIds?: string[]; causaIds?: string[]; now?: Date }) {
  if (opts?.jobIds?.length === 0 || opts?.causaIds?.length === 0) return 0;
  const now = opts?.now ?? new Date();
  const note = "La sesión temporal terminó antes de completar la actualización. Inicie sesión de nuevo para reintentar.";
  const expired = await prisma.pjudSyncJob.updateMany({
    where: {
      trigger: PJUD_MANUAL_SESSION_TRIGGER,
      status: { in: ["pending", "running"] },
      createdAt: { lte: new Date(now.getTime() - PJUD_MANUAL_SESSION_JOB_TTL_MS) },
      ...(opts?.jobIds ? { id: { in: opts.jobIds } } : {}),
      ...(opts?.causaIds ? { causaId: { in: opts.causaIds } } : {}),
    },
    data: { status: "failed", note, lastError: note, finishedAt: now },
  });
  return expired.count;
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

async function causaIdsAwaitingManualRecovery(causaIds?: string[]) {
  if (causaIds?.length === 0) return new Set<string>();
  // A failed/cancelled browser attempt must not silently acquire a different
  // provider on the next cron. An explicit successful refresh clears this hold.
  // Dismissing the warning alone does not prove that the source was recovered.
  const held = await prisma.$queryRaw<Array<{ causaId: string }>>(Prisma.sql`
    SELECT "causaId" FROM (
      SELECT DISTINCT ON ("causaId") "causaId", "trigger", "status"
      FROM "PjudSyncJob"
      WHERE ("trigger" = ${PJUD_MANUAL_SESSION_TRIGGER} OR "status" = 'ok')
      ${causaIds ? Prisma.sql`AND "causaId" IN (${Prisma.join(causaIds)})` : Prisma.empty}
      ORDER BY "causaId", "createdAt" DESC, "id" DESC
    ) AS latest
    WHERE "trigger" = ${PJUD_MANUAL_SESSION_TRIGGER} AND "status" <> 'ok'
  `);
  return new Set(held.map(job => job.causaId));
}

export async function enqueueDueSyncJobs(opts?: {
  causaIds?: string[];
  trigger?: "cron" | "manual" | "retry" | typeof PJUD_MANUAL_SESSION_TRIGGER;
  limit?: number;
  /** Ephemeral providers must not take over jobs owned by another session. */
  reclaimStuckRunning?: boolean;
  /** Internal synchronous observer, notified after every successful individual insert. */
  onJobEnqueued?: (jobId: string) => void;
}) {
  if (opts?.causaIds !== undefined && opts.causaIds.length === 0) return [];
  if (await getCaseManagementMode() !== "pjud_cl") return [];
  const trigger = opts?.trigger || "cron";
  const limit = Math.min(Math.max(opts?.limit || DEFAULT_BATCH, 1), 200);

  await expireManualSessionSyncJobs({ causaIds: opts?.causaIds });
  if (opts?.reclaimStuckRunning !== false) {
    await reclaimStuckRunningJobs({ causaIds: opts?.causaIds });
  }

  const awaitingRecovery = trigger === "cron"
    ? await causaIdsAwaitingManualRecovery(opts?.causaIds)
    : new Set<string>();
  const causas = await prisma.causa.findMany({
    where: {
      ...dueSyncWhere({ causaIds: opts?.causaIds }),
      ...(awaitingRecovery.size ? { NOT: { id: { in: [...awaitingRecovery] } } } : {}),
    },
    select: { id: true },
    orderBy: [{ pjudNextSyncAt: "asc" }, { updatedAt: "asc" }],
    take: limit * 2, // over-fetch to allow dedupe
  });

  const busy = await causaIdsWithActiveJobs(causas.map((c) => c.id));
  const jobsData = [];
  for (const c of causas) {
    if (jobsData.length >= limit) break;
    if (busy.has(c.id) || awaitingRecovery.has(c.id)) continue;
    jobsData.push({
      causaId: c.id,
      status: "pending",
      trigger,
      attempts: 0,
    });
    busy.add(c.id);
  }

  if (jobsData.length === 0) return [];

  // Crear uno a uno: el índice parcial UNIQUE (causaId) WHERE pending|running
  // hace atómica la carrera entre crons concurrentes (P2002 = ya en cola).
  const jobs = [];
  for (const data of jobsData) {
    try {
      const job = await prisma.pjudSyncJob.create({ data });
      opts?.onJobEnqueued?.(job.id);
      jobs.push(job);
    } catch (error) {
      if (isActiveJobUniqueViolation(error)) continue;
      throw error;
    }
  }
  return jobs;
}

export async function processPendingSyncJobs(opts?: {
  actorId?: string | null;
  concurrency?: number;
  limit?: number;
  jobIds?: string[];
  /** Internal provider held only for this call; requires explicit job IDs. */
  fetchMovimientos?: PjudMovimientosFetcher;
  assertActive?: () => Promise<void>;
  downloadDocuments?: boolean;
}) {
  // An explicitly empty selection must never expand to the entire queue.
  if (opts?.jobIds !== undefined && opts.jobIds.length === 0) return [];
  if (opts?.fetchMovimientos !== undefined &&
      (typeof opts.fetchMovimientos !== "function" || !opts.jobIds?.length)) {
    throw new Error("El proveedor de sesión requiere una función interna y trabajos explícitos.");
  }
  if (await getCaseManagementMode() !== "pjud_cl") return [];
  const limit = Math.min(Math.max(opts?.limit || DEFAULT_BATCH, 1), 100);
  await expireManualSessionSyncJobs({ jobIds: opts?.jobIds });
  await reclaimStuckRunningJobs({ jobIds: opts?.jobIds });

  const pending = await prisma.pjudSyncJob.findMany({
    where: {
      status: "pending",
      // A cron, retry or explicit ordinary drain cannot use an ephemeral browser's reservation.
      ...(!opts?.fetchMovimientos ? { trigger: { not: PJUD_MANUAL_SESSION_TRIGGER } } : {}),
      ...(opts?.jobIds?.length ? { id: { in: opts.jobIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const results: SyncCausaResult[] = [];
  // A Page-backed provider has a single mutable navigation context.
  const concurrency = opts?.fetchMovimientos ? 1 : opts?.concurrency ?? pjudSyncConcurrency();
  await mapWithConcurrency(pending, concurrency, async (job) => {
    if (await getCaseManagementMode() !== "pjud_cl") return;
    await opts?.assertActive?.();
    const claimed = await prisma.pjudSyncJob.updateMany({
      where: {
        id: job.id, status: "pending",
        ...(!opts?.fetchMovimientos ? { trigger: { not: PJUD_MANUAL_SESSION_TRIGGER } } : {}),
      },
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
        force: job.trigger !== "cron",
        trigger: (job.trigger as "cron" | "manual" | "retry" | typeof PJUD_MANUAL_SESSION_TRIGGER) || "cron",
        existingJobId: job.id,
        fetchMovimientos: opts?.fetchMovimientos,
        assertActive: opts?.assertActive,
        downloadDocuments: opts?.downloadDocuments,
      });
      if (result.status === "disabled") await prisma.pjudSyncJob.updateMany({ where: { id: job.id, status: "running" }, data: { status: "dismissed", note: result.note, finishedAt: new Date() } });
      results.push(result);
    } catch (error) {
      if (await getCaseManagementMode() !== "pjud_cl") { await pausePjudManagementJobs(); return; }
      const note = error instanceof Error ? error.message : "Error";
      await prisma.pjudSyncJob.updateMany({
        where: { id: job.id, status: "running" },
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
  if (await getCaseManagementMode() !== "pjud_cl") return [];
  await reclaimStuckRunningJobs({ causaIds: opts?.causaIds });

  const failed = await prisma.pjudSyncJob.findMany({
    where: {
      status: { in: ["failed", "partial"] },
      trigger: { not: PJUD_MANUAL_SESSION_TRIGGER },
      ...(opts?.causaIds?.length ? { causaId: { in: opts.causaIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit || 50,
    distinct: ["causaId"],
  });

  const busy = await causaIdsWithActiveJobs(failed.map((j) => j.causaId));
  const toCreate = [];
  const dismissIds: string[] = [];
  for (const job of failed) {
    if (busy.has(job.causaId)) continue;
    toCreate.push({
      causaId: job.causaId,
      status: "pending",
      trigger: "retry",
      attempts: 0,
    });
    dismissIds.push(job.id);
    busy.add(job.causaId);
  }

  if (toCreate.length === 0) return [];
  // Descartar el failed histórico para que la lista de fallidos no quede zombie
  // tras un reintento (el nuevo job pending/ok es la fuente de verdad).
  await prisma.pjudSyncJob.updateMany({
    where: { id: { in: dismissIds }, status: { in: ["failed", "partial"] } },
    data: {
      status: "dismissed",
      note: "Reencolado: fallido anterior descartado",
      finishedAt: new Date(),
    },
  });
  const created = [];
  for (const data of toCreate) {
    try {
      created.push(await prisma.pjudSyncJob.create({ data }));
    } catch (error) {
      if (isActiveJobUniqueViolation(error)) continue;
      throw error;
    }
  }
  return created;
}

/**
 * Estado de cola durable `PjudSyncJob`.
 * Shape compatible con CausaMonitor `GET /api/queue/stats`
 * (`waiting` / `active` / `completed` / `failed` / `delayed`) más aliases LexOpen.
 */
export async function getPjudQueueStatus(user?: CausaAccessUser) {
  const scope = user ? { causa: causaAccessWhere(user) } : {};
  const [waiting, active, completed, failed, partial, okToday] = await Promise.all([
    prisma.pjudSyncJob.count({ where: { ...scope, status: "pending" } }),
    prisma.pjudSyncJob.count({ where: { ...scope, status: "running" } }),
    prisma.pjudSyncJob.count({ where: { ...scope, status: "ok" } }),
    prisma.pjudSyncJob.count({ where: { ...scope, status: "failed" } }),
    prisma.pjudSyncJob.count({ where: { ...scope, status: "partial" } }),
    prisma.pjudSyncJob.count({
      where: {
        ...scope,
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
    partial,
    delayed: 0,
    // LexOpen aliases (Host status UI)
    pending: waiting,
    running: active,
    okToday,
    workerConcurrency: pjudSyncConcurrency(),
  };
}
