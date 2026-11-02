ALTER TABLE "Documento" ADD COLUMN "extractionAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "extractionLockedAt" TIMESTAMP(3), ADD COLUMN "extractionLockToken" TEXT,
  ADD COLUMN "extractionNextAttemptAt" TIMESTAMP(3);
CREATE INDEX "Documento_extractionStatus_extractionNextAttemptAt_idx" ON "Documento"("extractionStatus", "extractionNextAttemptAt");
CREATE TABLE "DocumentResource" (
  "id" TEXT NOT NULL, "documentoId" TEXT, "siteFileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentResource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentResource_one_origin" CHECK (num_nonnulls("documentoId", "siteFileId") = 1)
);
CREATE UNIQUE INDEX "DocumentResource_documentoId_key" ON "DocumentResource"("documentoId");
CREATE UNIQUE INDEX "DocumentResource_siteFileId_key" ON "DocumentResource"("siteFileId");
ALTER TABLE "DocumentResource" ADD CONSTRAINT "DocumentResource_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentResource" ADD CONSTRAINT "DocumentResource_siteFileId_fkey" FOREIGN KEY ("siteFileId") REFERENCES "SiteFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "DocumentEvidenceVersion" (
  "id" TEXT NOT NULL, "resourceId" TEXT NOT NULL, "sourceSha256" TEXT NOT NULL,
  "textSha256" TEXT NOT NULL, "extractorVersion" TEXT NOT NULL, "sourceName" TEXT NOT NULL,
  "sourceMimeType" TEXT, "sourceStorageKey" TEXT, "extractedText" TEXT NOT NULL,
  "extractionStatus" TEXT NOT NULL, "metadataJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentEvidenceVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvidenceVersion_content_key" ON "DocumentEvidenceVersion"("resourceId", "sourceSha256", "textSha256", "extractorVersion");
CREATE INDEX "DocumentEvidenceVersion_resourceId_createdAt_idx" ON "DocumentEvidenceVersion"("resourceId", "createdAt");
ALTER TABLE "DocumentEvidenceVersion" ADD CONSTRAINT "DocumentEvidenceVersion_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "DocumentResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "DocumentEvidenceFragment" (
  "id" TEXT NOT NULL, "versionId" TEXT NOT NULL, "ordinal" INTEGER NOT NULL,
  "text" TEXT NOT NULL, "textSha256" TEXT NOT NULL, "startOffset" INTEGER NOT NULL, "endOffset" INTEGER NOT NULL,
  CONSTRAINT "DocumentEvidenceFragment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentEvidenceFragment_versionId_ordinal_key" ON "DocumentEvidenceFragment"("versionId", "ordinal");
ALTER TABLE "DocumentEvidenceFragment" ADD CONSTRAINT "DocumentEvidenceFragment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentEvidenceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
