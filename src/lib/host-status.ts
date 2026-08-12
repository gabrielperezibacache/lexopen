import { prisma } from "@/lib/db";
import { getOcrCapability } from "@/lib/local-ocr";
import { persistentStorageReady, storageMode } from "@/lib/storage";
import {
  getDocumentProcessingQueueStatus,
} from "@/lib/document-processing-queue";
import { getDigestStatus } from "@/lib/pjud/digest";
import { providerStatusPublic } from "@/lib/pjud/sync";
import { getLocalBackupHealth } from "@/lib/backup-health";

export async function getHostStatus() {
  const [
    users,
    sites,
    activeCauses,
    monitoredCauses,
    documents,
    pendingDocuments,
    failedDocuments,
    invoices,
    openInvoices,
    ocr,
    backups,
    failedPjudJobs,
    digest,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.site.count(),
    prisma.causa.count({ where: { estado: "activa" } }),
    prisma.causa.count({
      where: { estado: "activa", pjudMonitoreoActivo: true },
    }),
    prisma.documento.count(),
    prisma.documento.count({
      where: { extractionStatus: { in: ["pending", "processing"] } },
    }),
    prisma.documento.count({ where: { extractionStatus: "failed" } }),
    prisma.invoice.count(),
    prisma.invoice.count({
      where: {
        status: { in: ["emitida", "parcialmente_pagada", "vencida"] },
      },
    }),
    getOcrCapability(),
    getLocalBackupHealth(),
    prisma.pjudSyncJob.count({ where: { status: "failed" } }),
    getDigestStatus().catch(() => ({
      lastAt: null,
      lastStatus: null,
      lastNote: null,
    })),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    app: {
      version: process.env.LEXOPEN_APP_VERSION || null,
      node: process.version,
      environment: process.env.NODE_ENV || "development",
      desktop: process.env.LEXOPEN_DESKTOP === "1",
      dataDirectoryConfigured: Boolean(process.env.LEXOPEN_DATA_DIR),
    },
    storage: {
      mode: storageMode(),
      ready: persistentStorageReady(),
      required: process.env.LEXOPEN_REQUIRE_PERSISTENT_STORAGE === "1",
      pathConfigured: Boolean(process.env.STORAGE_PATH),
    },
    ocr,
    pjud: {
      ...providerStatusPublic(),
      failedJobs: failedPjudJobs,
      digest: {
        lastAt:
          digest.lastAt instanceof Date
            ? digest.lastAt.toISOString()
            : digest.lastAt || null,
        lastStatus: digest.lastStatus,
        lastNote: digest.lastNote,
      },
    },
    backups,
    queue: getDocumentProcessingQueueStatus(),
    counts: {
      users,
      sites,
      activeCauses,
      monitoredCauses,
      documents,
      pendingDocuments,
      failedDocuments,
      invoices,
      openInvoices,
      failedPjudJobs,
    },
  };
}

export type HostStatus = Awaited<ReturnType<typeof getHostStatus>>;
