import { prisma } from "@/lib/db";
import { getOcrCapability } from "@/lib/local-ocr";
import { persistentStorageReady, storageMode } from "@/lib/storage";
import {
  getDocumentProcessingQueueStatus,
} from "@/lib/document-processing-queue";
import { providerStatusPublic } from "@/lib/pjud/sync";

function backupConfiguration() {
  const intervalMinutes = Number(
    process.env.LEXOPEN_BACKUP_INTERVAL_MINUTES || 0
  );
  const retention = Number(process.env.LEXOPEN_BACKUP_KEEP || 7);
  return {
    enabled: Number.isFinite(intervalMinutes) && intervalMinutes > 0,
    intervalMinutes:
      Number.isFinite(intervalMinutes) && intervalMinutes > 0
        ? intervalMinutes
        : 0,
    retention:
      Number.isInteger(retention) && retention >= 1 && retention <= 365
        ? retention
        : null,
    directoryConfigured: Boolean(process.env.LEXOPEN_BACKUP_DIR?.trim()),
  };
}

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
    pjud: providerStatusPublic(),
    backups: backupConfiguration(),
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
    },
  };
}

export type HostStatus = Awaited<ReturnType<typeof getHostStatus>>;
