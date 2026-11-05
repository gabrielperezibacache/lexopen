CREATE TABLE "CaseDocumentFolder" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseDocumentFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CaseDocumentPlacement" (
    "documentoId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    CONSTRAINT "CaseDocumentPlacement_pkey" PRIMARY KEY ("documentoId")
);

CREATE INDEX "CaseDocumentFolder_causaId_parentId_idx" ON "CaseDocumentFolder"("causaId", "parentId");
CREATE INDEX "CaseDocumentPlacement_folderId_idx" ON "CaseDocumentPlacement"("folderId");

ALTER TABLE "CaseDocumentFolder" ADD CONSTRAINT "CaseDocumentFolder_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseDocumentFolder" ADD CONSTRAINT "CaseDocumentFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CaseDocumentFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseDocumentPlacement" ADD CONSTRAINT "CaseDocumentPlacement_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseDocumentPlacement" ADD CONSTRAINT "CaseDocumentPlacement_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "CaseDocumentFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
