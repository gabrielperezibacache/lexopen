-- CreateTable
CREATE TABLE "CaseWritingReview" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputSha256" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "referencesSha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseWritingReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseWritingExport" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "reviewId" TEXT,
    "format" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseWritingExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseWritingReview_draftId_revision_key" ON "CaseWritingReview"("draftId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "CaseWritingReview_draftId_requestId_key" ON "CaseWritingReview"("draftId", "requestId");

-- CreateIndex
CREATE INDEX "CaseWritingExport_draftId_createdAt_idx" ON "CaseWritingExport"("draftId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaseWritingReview" ADD CONSTRAINT "CaseWritingReview_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CaseWritingDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseWritingExport" ADD CONSTRAINT "CaseWritingExport_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CaseWritingDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseWritingExport" ADD CONSTRAINT "CaseWritingExport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "CaseWritingReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

