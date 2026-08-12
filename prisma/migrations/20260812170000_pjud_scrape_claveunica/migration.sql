-- ClaveÚnica vault + scrape provenance on causas
ALTER TABLE "FirmSettings" ADD COLUMN IF NOT EXISTS "claveUnicaRut" TEXT;
ALTER TABLE "FirmSettings" ADD COLUMN IF NOT EXISTS "claveUnicaPasswordEnc" TEXT;
ALTER TABLE "FirmSettings" ADD COLUMN IF NOT EXISTS "claveUnicaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FirmSettings" ADD COLUMN IF NOT EXISTS "claveUnicaLastSyncAt" TIMESTAMP(3);
ALTER TABLE "FirmSettings" ADD COLUMN IF NOT EXISTS "claveUnicaLastSyncStatus" TEXT;
ALTER TABLE "FirmSettings" ADD COLUMN IF NOT EXISTS "claveUnicaLastSyncNote" TEXT;

ALTER TABLE "Causa" ADD COLUMN IF NOT EXISTS "pjudSource" TEXT;
ALTER TABLE "Causa" ADD COLUMN IF NOT EXISTS "pjudFromMisCausas" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Causa_pjudFromMisCausas_idx" ON "Causa"("pjudFromMisCausas");
