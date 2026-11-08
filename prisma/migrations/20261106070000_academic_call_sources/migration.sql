ALTER TABLE "AltazorAcademicWorkspace"
  ADD COLUMN "callOriginKey" TEXT,
  ADD COLUMN "callOriginJson" TEXT;

CREATE UNIQUE INDEX "AltazorAcademicWorkspace_ownerId_callOriginKey_key"
  ON "AltazorAcademicWorkspace"("ownerId", "callOriginKey");

CREATE TABLE "AltazorCallSubscription" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "itemsJson" TEXT NOT NULL DEFAULT '[]',
  "checkedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "refreshKey" TEXT,
  "refreshStartedAt" TIMESTAMP(3),
  CONSTRAINT "AltazorCallSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AltazorCallSubscription_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AltazorCallSubscription_ownerId_sourceId_key"
  ON "AltazorCallSubscription"("ownerId", "sourceId");
