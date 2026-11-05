-- Additive receipts: originals, existing folder links and judicial histories remain intact.
ALTER TABLE "Causa" ADD COLUMN "pjudDocumentDownloadsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Causa" ADD COLUMN "pjudSyncIntervalMinutes" INTEGER;
ALTER TABLE "Causa" ADD COLUMN "pjudDocumentDownloadOwnerId" TEXT;
ALTER TABLE "Causa" ADD CONSTRAINT "Causa_pjudDocumentDownloadOwnerId_fkey" FOREIGN KEY ("pjudDocumentDownloadOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- A deliberate local deletion retains its immutable import receipt (no silent re-import into RAG).
ALTER TABLE "DriveDocumentImport" DROP CONSTRAINT "DriveDocumentImport_documentoId_fkey";
ALTER TABLE "DriveDocumentImport" ALTER COLUMN "documentoId" DROP NOT NULL;
ALTER TABLE "DriveDocumentImport" ADD CONSTRAINT "DriveDocumentImport_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DriveSyncSubscription" (
  "id" TEXT NOT NULL, "causaId" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
  "folderId" TEXT NOT NULL, "account" TEXT NOT NULL DEFAULT 'study', "connectionId" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "intervalMinutes" INTEGER NOT NULL DEFAULT 60, "nextRunAt" TIMESTAMP(3),
  "lastRunAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'idle', "note" TEXT,
  "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3), "generation" INTEGER NOT NULL DEFAULT 1, "scanCursor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriveSyncSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriveSyncSubscription_interval_check" CHECK ("intervalMinutes" BETWEEN 15 AND 1440)
);
CREATE UNIQUE INDEX "DriveSyncSubscription_causaId_key" ON "DriveSyncSubscription"("causaId");
CREATE INDEX "DriveSyncSubscription_enabled_nextRunAt_idx" ON "DriveSyncSubscription"("enabled", "nextRunAt");
CREATE INDEX "DriveSyncSubscription_ownerId_idx" ON "DriveSyncSubscription"("ownerId");
ALTER TABLE "DriveSyncSubscription" ADD CONSTRAINT "DriveSyncSubscription_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriveSyncSubscription" ADD CONSTRAINT "DriveSyncSubscription_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PjudDocumentJob" (
  "id" TEXT NOT NULL, "causaId" TEXT NOT NULL, "movimientoId" TEXT NOT NULL, "actorId" TEXT,
  "sourceRefHash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3), "documentoId" TEXT, "sourceSha256" TEXT,
  "lastErrorCode" TEXT, "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PjudDocumentJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PjudDocumentJob_movimientoId_key" ON "PjudDocumentJob"("movimientoId");
CREATE INDEX "PjudDocumentJob_status_nextAttemptAt_idx" ON "PjudDocumentJob"("status", "nextAttemptAt");
CREATE INDEX "PjudDocumentJob_causaId_idx" ON "PjudDocumentJob"("causaId");
ALTER TABLE "PjudDocumentJob" ADD CONSTRAINT "PjudDocumentJob_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PjudDocumentJob" ADD CONSTRAINT "PjudDocumentJob_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "CausaMovimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PjudDocumentJob" ADD CONSTRAINT "PjudDocumentJob_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PjudDocumentJob" ADD CONSTRAINT "PjudDocumentJob_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
