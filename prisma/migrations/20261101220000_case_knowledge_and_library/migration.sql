-- CreateTable
CREATE TABLE "CaseFact" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "dateLiteral" TEXT,
    "dateStart" TIMESTAMP(3),
    "dateEnd" TIMESTAMP(3),
    "datePrecision" TEXT NOT NULL DEFAULT 'unknown',
    "dateInferred" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "highlighted" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "fingerprint" TEXT NOT NULL,
    "comparisonKey" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseFactCitation" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "citationJson" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,

    CONSTRAINT "CaseFactCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseFactReview" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromRevision" INTEGER NOT NULL,
    "toRevision" INTEGER NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseFactReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseConflict" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "leftFactId" TEXT NOT NULL,
    "rightFactId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "fingerprint" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseConflictReview" (
    "id" TEXT NOT NULL,
    "conflictId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromRevision" INTEGER NOT NULL,
    "toRevision" INTEGER NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseConflictReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAnalysisSource" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "afterOrdinal" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAnalysisSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCollection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "causaId" TEXT,
    "siteId" TEXT,
    "name" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "versionKey" TEXT NOT NULL,
    "citationJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeCollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseFact_causaId_dateStart_idx" ON "CaseFact"("causaId", "dateStart");

-- CreateIndex
CREATE UNIQUE INDEX "CaseFact_causaId_fingerprint_key" ON "CaseFact"("causaId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "CaseFactCitation_factId_sourceKey_key" ON "CaseFactCitation"("factId", "sourceKey");

-- CreateIndex
CREATE INDEX "CaseFactReview_factId_createdAt_idx" ON "CaseFactReview"("factId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseConflict_causaId_createdAt_idx" ON "CaseConflict"("causaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaseConflict_causaId_fingerprint_key" ON "CaseConflict"("causaId", "fingerprint");

-- CreateIndex
CREATE INDEX "CaseConflictReview_conflictId_createdAt_idx" ON "CaseConflictReview"("conflictId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAnalysisSource_causaId_versionId_extractorVersion_key" ON "CaseAnalysisSource"("causaId", "versionId", "extractorVersion");

-- CreateIndex
CREATE INDEX "KnowledgeCollection_ownerId_updatedAt_idx" ON "KnowledgeCollection"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCollectionItem_collectionId_versionKey_key" ON "KnowledgeCollectionItem"("collectionId", "versionKey");

-- AddForeignKey
ALTER TABLE "CaseFact" ADD CONSTRAINT "CaseFact_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFact" ADD CONSTRAINT "CaseFact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFactCitation" ADD CONSTRAINT "CaseFactCitation_factId_fkey" FOREIGN KEY ("factId") REFERENCES "CaseFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFactReview" ADD CONSTRAINT "CaseFactReview_factId_fkey" FOREIGN KEY ("factId") REFERENCES "CaseFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFactReview" ADD CONSTRAINT "CaseFactReview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseConflict" ADD CONSTRAINT "CaseConflict_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseConflict" ADD CONSTRAINT "CaseConflict_leftFactId_fkey" FOREIGN KEY ("leftFactId") REFERENCES "CaseFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseConflict" ADD CONSTRAINT "CaseConflict_rightFactId_fkey" FOREIGN KEY ("rightFactId") REFERENCES "CaseFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseConflict" ADD CONSTRAINT "CaseConflict_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseConflictReview" ADD CONSTRAINT "CaseConflictReview_conflictId_fkey" FOREIGN KEY ("conflictId") REFERENCES "CaseConflict"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseConflictReview" ADD CONSTRAINT "CaseConflictReview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAnalysisSource" ADD CONSTRAINT "CaseAnalysisSource_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCollection" ADD CONSTRAINT "KnowledgeCollection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCollection" ADD CONSTRAINT "KnowledgeCollection_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCollection" ADD CONSTRAINT "KnowledgeCollection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCollectionItem" ADD CONSTRAINT "KnowledgeCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "KnowledgeCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

