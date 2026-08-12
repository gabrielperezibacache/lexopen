-- CausaMonitor-parity: sync schedule, fail count, rich movimientos, job queue
ALTER TABLE "Causa" ADD COLUMN IF NOT EXISTS "pjudNextSyncAt" TIMESTAMP(3);
ALTER TABLE "Causa" ADD COLUMN IF NOT EXISTS "pjudFailCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Causa_pjudNextSyncAt_idx" ON "Causa"("pjudNextSyncAt");
CREATE INDEX IF NOT EXISTS "Causa_pjudLastSyncStatus_idx" ON "Causa"("pjudLastSyncStatus");

ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "cuaderno" TEXT;
ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "folio" TEXT;
ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "etapa" TEXT;
ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "tramite" TEXT;
ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "esReceptor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "documentoRef" TEXT;

CREATE INDEX IF NOT EXISTS "CausaMovimiento_causaId_cuaderno_idx" ON "CausaMovimiento"("causaId", "cuaderno");
CREATE INDEX IF NOT EXISTS "CausaMovimiento_causaId_esReceptor_idx" ON "CausaMovimiento"("causaId", "esReceptor");

CREATE TABLE IF NOT EXISTS "PjudSyncJob" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "note" TEXT,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PjudSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PjudSyncJob_status_createdAt_idx" ON "PjudSyncJob"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PjudSyncJob_causaId_createdAt_idx" ON "PjudSyncJob"("causaId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PjudSyncJob_causaId_fkey'
  ) THEN
    ALTER TABLE "PjudSyncJob"
      ADD CONSTRAINT "PjudSyncJob_causaId_fkey"
      FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
