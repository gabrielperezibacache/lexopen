CREATE TABLE "PjudManualImport" (
    "id" TEXT PRIMARY KEY,
    "causaId" TEXT NOT NULL REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "activeSlot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "phase" TEXT NOT NULL DEFAULT 'scrape',
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "savedIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "skippedIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "failedIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "total" INTEGER NOT NULL DEFAULT 0,
    "maxPerRun" INTEGER NOT NULL,
    "delayMs" INTEGER NOT NULL,
    "currentLabel" TEXT,
    "note" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "PjudManualImport_activeSlot_key" ON "PjudManualImport"("activeSlot");
CREATE INDEX "PjudManualImport_causaId_startedAt_idx" ON "PjudManualImport"("causaId", "startedAt");
