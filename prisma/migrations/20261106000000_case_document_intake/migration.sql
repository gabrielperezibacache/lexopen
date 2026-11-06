CREATE TABLE "CaseDocumentIntake" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "documentoId" TEXT,
    "documentVersion" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceSha256" TEXT,
    "sourceName" TEXT NOT NULL,
    "storageKey" TEXT,
    "actorId" TEXT,
    "mailboxAttachmentId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseDocumentIntake_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CaseDocumentIntake_source_check" CHECK ("source" IN ('manual', 'mail')),
    CONSTRAINT "CaseDocumentIntake_hash_check" CHECK ("sourceSha256" IS NULL OR "sourceSha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "CaseDocumentIntake_mail_check" CHECK ("source" = 'mail' OR "mailboxAttachmentId" IS NULL)
);

CREATE UNIQUE INDEX "CaseDocumentIntake_mailboxAttachmentId_key" ON "CaseDocumentIntake"("mailboxAttachmentId");
CREATE UNIQUE INDEX "CaseDocumentIntake_causaId_source_sourceKey_key" ON "CaseDocumentIntake"("causaId", "source", "sourceKey");
CREATE INDEX "CaseDocumentIntake_causaId_sourceSha256_idx" ON "CaseDocumentIntake"("causaId", "sourceSha256");
CREATE INDEX "CaseDocumentIntake_causaId_receivedAt_id_idx" ON "CaseDocumentIntake"("causaId", "receivedAt", "id");
CREATE INDEX "CaseDocumentIntake_documentoId_idx" ON "CaseDocumentIntake"("documentoId");
CREATE INDEX "CaseDocumentIntake_actorId_idx" ON "CaseDocumentIntake"("actorId");

ALTER TABLE "CaseDocumentIntake" ADD CONSTRAINT "CaseDocumentIntake_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseDocumentIntake" ADD CONSTRAINT "CaseDocumentIntake_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CaseDocumentIntake" ADD CONSTRAINT "CaseDocumentIntake_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CaseDocumentIntake" ADD CONSTRAINT "CaseDocumentIntake_mailboxAttachmentId_fkey" FOREIGN KEY ("mailboxAttachmentId") REFERENCES "MailboxAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
