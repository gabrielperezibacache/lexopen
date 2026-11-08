ALTER TABLE "FileVersion" ADD COLUMN "storageKey" TEXT, ADD COLUMN "mimeType" TEXT, ADD COLUMN "sizeBytes" INTEGER, ADD COLUMN "snapshotJson" TEXT;
CREATE TABLE "OfflineDocumentRevision" (
  "id" TEXT NOT NULL,
  "documentoId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "contenido" TEXT,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "nombre" TEXT NOT NULL,
  "confidencial" BOOLEAN NOT NULL,
  "privilegio" BOOLEAN NOT NULL,
  "causaId" TEXT,
  "snapshotJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineDocumentRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfflineDocumentRevision_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OfflineDocumentRevision_documentoId_version_key" ON "OfflineDocumentRevision"("documentoId", "version");
