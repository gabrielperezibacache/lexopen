-- CreateTable
CREATE TABLE "DriveDocumentImport" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "driveVersion" TEXT NOT NULL,
    "exportMimeType" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveDocumentImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveDocumentImport_documentoId_key" ON "DriveDocumentImport"("documentoId");

-- CreateIndex
CREATE INDEX "DriveDocumentImport_causaId_importedAt_idx" ON "DriveDocumentImport"("causaId", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriveDocumentImport_causaId_driveFileId_driveVersion_export_key" ON "DriveDocumentImport"("causaId", "driveFileId", "driveVersion", "exportMimeType");

-- AddForeignKey
ALTER TABLE "DriveDocumentImport" ADD CONSTRAINT "DriveDocumentImport_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveDocumentImport" ADD CONSTRAINT "DriveDocumentImport_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

