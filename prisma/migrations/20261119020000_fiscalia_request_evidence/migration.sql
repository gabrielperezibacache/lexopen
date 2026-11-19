ALTER TABLE "FiscaliaRequestEvent"
  ADD COLUMN "correctionReason" TEXT,
  ADD COLUMN "previousFolio" TEXT,
  ADD COLUMN "correctedFolio" TEXT,
  ADD COLUMN "previousSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "correctedSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "evidenceKind" TEXT,
  ADD COLUMN "documentoId" TEXT,
  ADD COLUMN "documentVersion" INTEGER,
  ADD COLUMN "documentSha256" TEXT;
