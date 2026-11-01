-- AlterTable
ALTER TABLE "DocumentEvidenceVersion" ADD COLUMN     "locatorKind" TEXT NOT NULL DEFAULT 'text-offset',
ADD COLUMN     "pageCount" INTEGER;

-- AlterTable
ALTER TABLE "DocumentEvidenceFragment" ADD COLUMN     "pageEndOffset" INTEGER,
ADD COLUMN     "pageId" TEXT,
ADD COLUMN     "pageStartOffset" INTEGER;

-- CreateTable
CREATE TABLE "DocumentEvidencePage" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "DocumentEvidencePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalSource" (
    "id" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organism" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalSourceVersion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceStorageKey" TEXT,
    "title" TEXT NOT NULL,
    "organism" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT,
    "mimeType" TEXT,
    "publishedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "acquisitionMethod" TEXT NOT NULL DEFAULT 'retrieved',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalSourceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalSourceFragment" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,

    CONSTRAINT "LegalSourceFragment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "causaId" TEXT,
    "query" TEXT NOT NULL,
    "scopeJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentEvidencePage_versionId_pageNumber_key" ON "DocumentEvidencePage"("versionId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LegalSource_canonicalUrl_key" ON "LegalSource"("canonicalUrl");

-- CreateIndex
CREATE INDEX "LegalSourceVersion_sourceId_createdAt_idx" ON "LegalSourceVersion"("sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "LegalSourceVersion_kind_publishedAt_idx" ON "LegalSourceVersion"("kind", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalSourceVersion_sourceId_sourceSha256_textSha256_key" ON "LegalSourceVersion"("sourceId", "sourceSha256", "textSha256");

-- CreateIndex
CREATE UNIQUE INDEX "LegalSourceFragment_versionId_ordinal_key" ON "LegalSourceFragment"("versionId", "ordinal");

-- CreateIndex
CREATE INDEX "ResearchRun_ownerId_createdAt_idx" ON "ResearchRun"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchRun_causaId_idx" ON "ResearchRun"("causaId");

-- AddForeignKey
ALTER TABLE "DocumentEvidenceFragment" ADD CONSTRAINT "DocumentEvidenceFragment_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentEvidencePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEvidencePage" ADD CONSTRAINT "DocumentEvidencePage_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentEvidenceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalSourceVersion" ADD CONSTRAINT "LegalSourceVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LegalSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalSourceFragment" ADD CONSTRAINT "LegalSourceFragment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LegalSourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

