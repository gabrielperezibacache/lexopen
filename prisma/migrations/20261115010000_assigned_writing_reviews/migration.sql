ALTER TABLE "CaseWritingDraft" ADD COLUMN "reviewerId" TEXT, ADD COLUMN "reviewAssignedRevision" INTEGER, ADD COLUMN "reviewAssignmentVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CaseWritingDraft" ADD CONSTRAINT "CaseWritingDraft_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CaseWritingDraft_reviewerId_reviewAssignedRevision_idx" ON "CaseWritingDraft"("reviewerId", "reviewAssignedRevision");
