-- Private case writings, immutable full snapshots and idempotent mutation receipts.
CREATE TABLE "CaseWritingDraft" (
  "id" TEXT NOT NULL,
  "causaId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createInputSha256" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "referencesJson" TEXT NOT NULL DEFAULT '[]',
  "nextReferenceNumber" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CaseWritingDraft_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CaseWritingRevision" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "referencesJson" TEXT NOT NULL,
  "change" TEXT NOT NULL,
  "restoredFrom" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseWritingRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CaseWritingRequest" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "resultingRevision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseWritingRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CaseWritingDraft_ownerId_causaId_requestId_key" ON "CaseWritingDraft"("ownerId", "causaId", "requestId");
CREATE INDEX "CaseWritingDraft_ownerId_causaId_updatedAt_idx" ON "CaseWritingDraft"("ownerId", "causaId", "updatedAt");
CREATE UNIQUE INDEX "CaseWritingRevision_draftId_revision_key" ON "CaseWritingRevision"("draftId", "revision");
CREATE UNIQUE INDEX "CaseWritingRequest_draftId_requestId_key" ON "CaseWritingRequest"("draftId", "requestId");
ALTER TABLE "CaseWritingDraft" ADD CONSTRAINT "CaseWritingDraft_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CaseWritingDraft" ADD CONSTRAINT "CaseWritingDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CaseWritingRevision" ADD CONSTRAINT "CaseWritingRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CaseWritingDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseWritingRequest" ADD CONSTRAINT "CaseWritingRequest_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CaseWritingDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
