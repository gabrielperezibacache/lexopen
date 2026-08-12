-- AlterTable
ALTER TABLE "CausaMovimiento" ADD COLUMN IF NOT EXISTS "pendienteResolucion" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CausaMovimiento_causaId_pendienteResolucion_idx" ON "CausaMovimiento"("causaId", "pendienteResolucion");
