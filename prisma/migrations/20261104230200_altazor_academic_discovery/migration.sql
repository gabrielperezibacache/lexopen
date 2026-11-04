-- CreateTable
CREATE TABLE "AltazorAcademicSearch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "providersJson" TEXT NOT NULL DEFAULT '["crossref","openalex"]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "resultsJson" TEXT NOT NULL DEFAULT '[]',
    "seenKeysJson" TEXT NOT NULL DEFAULT '[]',
    "newKeysJson" TEXT NOT NULL DEFAULT '[]',
    "checkedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorAcademicSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorBibliographyEntry" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "identifierKey" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "checkedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorBibliographyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AltazorAcademicSearch_ownerId_status_updatedAt_idx" ON "AltazorAcademicSearch"("ownerId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorAcademicSearch_ownerId_requestId_key" ON "AltazorAcademicSearch"("ownerId", "requestId");

-- CreateIndex
CREATE INDEX "AltazorBibliographyEntry_ownerId_updatedAt_idx" ON "AltazorBibliographyEntry"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorBibliographyEntry_ownerId_requestId_key" ON "AltazorBibliographyEntry"("ownerId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorBibliographyEntry_ownerId_identifierKey_key" ON "AltazorBibliographyEntry"("ownerId", "identifierKey");

-- AddForeignKey
ALTER TABLE "AltazorAcademicSearch" ADD CONSTRAINT "AltazorAcademicSearch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorBibliographyEntry" ADD CONSTRAINT "AltazorBibliographyEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
