ALTER TABLE "AltazorCallSubscription"
  ADD COLUMN "automatic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "failureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "newCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "changedCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "AltazorCallSubscription_sourceId_automatic_nextAttemptAt_idx"
  ON "AltazorCallSubscription"("sourceId", "automatic", "nextAttemptAt");
