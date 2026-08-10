-- AlterTable Causa: monitoreo PJUD / CaseTracking-style
ALTER TABLE "Causa" ADD COLUMN IF NOT EXISTS "pjudMonitoreoActivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Causa" ADD COLUMN IF NOT EXISTS "pjudLastSyncAt" TIMESTAMP(3);
ALTER TABLE "Causa" ADD COLUMN IF NOT EXISTS "pjudLastSyncStatus" TEXT;
ALTER TABLE "Causa" ADD COLUMN IF NOT EXISTS "pjudLastSyncNote" TEXT;
ALTER TABLE "Causa" ADD COLUMN IF NOT EXISTS "pjudExternalKey" TEXT;

CREATE INDEX IF NOT EXISTS "Causa_pjudMonitoreoActivo_idx" ON "Causa"("pjudMonitoreoActivo");
CREATE INDEX IF NOT EXISTS "Causa_pjudLastSyncAt_idx" ON "Causa"("pjudLastSyncAt");

-- AlterTable CausaMovimiento
ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'otro';
ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "referencia" TEXT;
ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "relevante" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "CausaMovimiento_causaId_fecha_idx" ON "CausaMovimiento"("causaId", "fecha");
CREATE INDEX IF NOT EXISTS "CausaMovimiento_externalId_idx" ON "CausaMovimiento"("externalId");
CREATE INDEX IF NOT EXISTS "CausaMovimiento_tipo_idx" ON "CausaMovimiento"("tipo");
