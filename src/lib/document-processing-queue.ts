import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";
import {
  processDocumentBytes,
  type DocumentProcessingResult,
} from "@/lib/document-processing";

type DocumentJob = {
  id: string;
  name: string;
  bytes: Buffer;
};

const queue: DocumentJob[] = [];
const queuedIds = new Set<string>();
let activeJobs = 0;
const MAX_CONCURRENCY = 1;
let recoveryStarted = false;

async function saveResult(id: string, result: DocumentProcessingResult) {
  await prisma.documento.update({
    where: { id },
    data: {
      extractedMarkdown: result.markdown,
      extractionStatus: result.status,
      extractionJson: JSON.stringify({
        format: result.format,
        ...result.metadata,
      }),
    },
  });
}

async function runJob(job: DocumentJob) {
  await prisma.documento.update({
    where: { id: job.id },
    data: { extractionStatus: "processing" },
  });
  try {
    const result = await processDocumentBytes(job.name, job.bytes);
    await saveResult(job.id, result);
  } catch (error) {
    await prisma.documento
      .update({
        where: { id: job.id },
        data: {
          extractionStatus: "failed",
          extractionJson: JSON.stringify({
            errorCode: "processing_error",
            message: error instanceof Error ? error.message : "Error de procesamiento",
          }),
        },
      })
      .catch(() => undefined);
  }
}

async function drain() {
  if (activeJobs >= MAX_CONCURRENCY) return;
  const job = queue.shift();
  if (!job) return;
  activeJobs += 1;
  try {
    await runJob(job);
  } finally {
    activeJobs -= 1;
    queuedIds.delete(job.id);
    void drain();
  }
}

export function enqueueDocumentProcessing(job: DocumentJob) {
  if (queuedIds.has(job.id)) return false;
  queuedIds.add(job.id);
  queue.push(job);
  void drain();
  return true;
}

export function getDocumentProcessingQueueStatus() {
  return {
    queued: queue.length,
    active: activeJobs,
    recoveryStarted,
    concurrency: MAX_CONCURRENCY,
  };
}

export async function recoverPendingDocumentProcessing() {
  if (recoveryStarted) return;
  recoveryStarted = true;
  const pending = await prisma.documento.findMany({
    where: {
      extractionStatus: { in: ["pending", "processing"] },
      OR: [{ storageKey: { not: null } }, { contenido: { not: null } }],
    },
    select: {
      id: true,
      nombre: true,
      storageKey: true,
      contenido: true,
    },
    take: 20,
    orderBy: { updatedAt: "asc" },
  });

  for (const document of pending) {
    const bytes = document.storageKey
      ? await getObject(document.storageKey)
      : document.contenido
        ? Buffer.from(document.contenido, "utf8")
        : null;
    if (!bytes) {
      await prisma.documento
        .update({
          where: { id: document.id },
          data: {
            extractionStatus: "failed",
            extractionJson: JSON.stringify({ errorCode: "content_not_found" }),
          },
        })
        .catch(() => undefined);
      continue;
    }
    enqueueDocumentProcessing({
      id: document.id,
      name: document.nombre,
      bytes,
    });
  }
}
