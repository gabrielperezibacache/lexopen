-- DropIndex
DROP INDEX "EvidenceVersion_content_key";

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceVersion_content_key" ON "DocumentEvidenceVersion"("resourceId", "sourceSha256", "textSha256", "extractorVersion", "sourceRevision");

