import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { processDocumentBytes, type DocumentProcessingResult } from "@/lib/document-processing";

type DocumentJob = { id: string; name: string; bytes: Buffer };
const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 4;

/** The database is the queue. Only the currently processed file enters memory. */
export function createDocumentProcessor(options: {
  client: PrismaClient;
  process?: typeof processDocumentBytes;
  read?: typeof getObject;
  documentIds?: string[];
  now?: () => Date;
  leaseMs?: number;
}) {
  const client = options.client;
  const process = options.process || processDocumentBytes;
  const read = options.read || getObject;
  const now = options.now || (() => new Date());
  const leaseMs = options.leaseMs || LEASE_MS;
  const hints = new Set<string>();
  let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = 0;
  let lastError: string | null = null;
  let wakeGeneration = 0;

  function eligible(at: Date): Prisma.DocumentoWhereInput {
    return {
      ...(options.documentIds ? { id: { in: options.documentIds } } : {}),
      AND: [
        { OR: [{ storageKey: { not: null } }, { contenido: { not: null } }] },
        { OR: [
          { extractionStatus: "pending", OR: [{ extractionNextAttemptAt: null }, { extractionNextAttemptAt: { lte: at } }] },
          { extractionStatus: "processing", OR: [{ extractionLockedAt: null }, { extractionLockedAt: { lt: new Date(at.getTime() - leaseMs) } }] },
        ] },
      ],
    };
  }

  async function claimNext() {
    for (;;) {
      const at = now();
      const doc = await client.documento.findFirst({
        where: eligible(at),
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        select: { id: true, nombre: true, contenido: true, storageKey: true, updatedAt: true, extractionAttempts: true },
      });
      if (!doc) return null;
      const token = randomUUID();
      const claim = await client.documento.updateMany({
        where: { AND: [{ id: doc.id, updatedAt: doc.updatedAt }, eligible(at)] },
        data: { extractionStatus: "processing", extractionLockedAt: at, extractionLockToken: token, extractionNextAttemptAt: null, extractionAttempts: { increment: 1 } },
      });
      if (claim.count) return { ...doc, token, attempts: doc.extractionAttempts + 1 };
    }
  }

  async function run() {
    if (timer) { clearTimeout(timer); timer = null; }
    lastError = null;
    for (;;) {
      const job = await claimNext();
      if (!job) break;
      hints.delete(job.id);
      active = 1;
      const owned = { id: job.id, extractionStatus: "processing", extractionLockToken: job.token };
      const heartbeat = setInterval(() => {
        void client.documento.updateMany({ where: owned, data: { extractionLockedAt: now() } }).catch(() => undefined);
      }, Math.max(100, Math.floor(leaseMs / 3)));
      heartbeat.unref?.();
      try {
        const bytes = job.storageKey ? await read(job.storageKey) : Buffer.from(job.contenido || "", "utf8");
        if (!bytes) throw new Error("No se encontró el archivo original");
        const result: DocumentProcessingResult = await process(job.nombre, bytes);
        await client.documento.updateMany({
          where: owned,
          data: { extractedMarkdown: result.markdown, extractionStatus: result.status, extractionJson: JSON.stringify({ format: result.format, ...result.metadata }), extractionLockedAt: null, extractionLockToken: null, extractionNextAttemptAt: null },
        });
      } catch (error) {
        const retry = job.attempts < MAX_ATTEMPTS;
        lastError = error instanceof Error ? error.message : "Error de procesamiento";
        await client.documento.updateMany({
          where: owned,
          data: { extractionStatus: retry ? "pending" : "failed", extractionLockedAt: null, extractionLockToken: null, extractionNextAttemptAt: retry ? new Date(now().getTime() + Math.min(30_000 * 2 ** (job.attempts - 1), 300_000)) : null, extractionJson: JSON.stringify({ errorCode: "processing_error", message: lastError, retryScheduled: retry }) },
        });
      } finally {
        clearInterval(heartbeat);
        active = 0;
      }
    }
    const next = await client.documento.findFirst({
      where: { ...(options.documentIds ? { id: { in: options.documentIds } } : {}), extractionStatus: { in: ["pending", "processing"] }, OR: [{ storageKey: { not: null } }, { contenido: { not: null } }] },
      select: { id: true },
    });
    if (next && !options.documentIds) {
      timer = setTimeout(() => { void recover().catch(() => undefined); }, 30_000);
      timer.unref?.();
    }
  }

  function recover(): Promise<void> {
    if (running) return running;
    const generation = wakeGeneration;
    running = run().catch((error) => {
      lastError = error instanceof Error ? error.message : "Error de recuperación";
      if (!options.documentIds && !timer) {
        timer = setTimeout(() => { void recover().catch(() => undefined); }, 30_000);
        timer.unref?.();
      }
      throw error;
    }).finally(() => {
      running = null;
      hints.clear();
      if (generation !== wakeGeneration) void recover().catch(() => undefined);
    });
    return running;
  }

  return {
    recover,
    enqueue(job: DocumentJob) {
      const fresh = !hints.has(job.id);
      hints.add(job.id);
      wakeGeneration += 1;
      void recover().catch(() => undefined);
      return fresh;
    },
    status: () => ({ queued: hints.size, active, recoveryStarted: running !== null, concurrency: 1, lastError }),
    stop: () => { if (timer) clearTimeout(timer); timer = null; },
  };
}

const worker = createDocumentProcessor({ client: prisma });
export const enqueueDocumentProcessing = worker.enqueue;
export const recoverPendingDocumentProcessing = worker.recover;
export const getDocumentProcessingQueueStatus = worker.status;

/** Use after persisting the requested original; invalidates any older lease. */
export const documentProcessingReset = {
  extractionStatus: "pending",
  extractionAttempts: 0,
  extractionLockedAt: null,
  extractionLockToken: null,
  extractionNextAttemptAt: null,
} as const;
