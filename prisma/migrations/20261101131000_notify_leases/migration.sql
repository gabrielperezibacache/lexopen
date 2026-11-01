ALTER TABLE "MensajeSaliente" ADD COLUMN "lockedBy" TEXT,
  ADD COLUMN "envioIniciadoAt" TIMESTAMP(3), ADD COLUMN "digestMode" TEXT;
CREATE INDEX "MensajeSaliente_estado_lockedAt_idx" ON "MensajeSaliente"("estado", "lockedAt");
