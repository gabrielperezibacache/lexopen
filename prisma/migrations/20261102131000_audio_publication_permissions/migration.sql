-- CreateTable
CREATE TABLE "CaseAudioPublication" (
    "id" TEXT NOT NULL,
    "audioId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAudioPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseAudioPublication_documentId_key" ON "CaseAudioPublication"("documentId");

-- CreateIndex
CREATE INDEX "CaseAudioPublication_audioId_createdAt_idx" ON "CaseAudioPublication"("audioId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaseAudioPublication" ADD CONSTRAINT "CaseAudioPublication_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "CaseAudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAudioPublication" ADD CONSTRAINT "CaseAudioPublication_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Recover the latest publication for databases upgraded from the preceding migration.
INSERT INTO "CaseAudioPublication" ("id", "audioId", "documentId", "createdAt")
SELECT 'audio_publication_' || md5(a."id" || ':' || a."transcriptDocumentId"), a."id", a."transcriptDocumentId", a."updatedAt"
FROM "CaseAudio" a JOIN "Documento" d ON d."id" = a."transcriptDocumentId"
WHERE a."transcriptDocumentId" IS NOT NULL
ON CONFLICT ("documentId") DO NOTHING;

-- Audio byte identity and case membership must stay stable through every write path.
CREATE FUNCTION lexopen_guard_audio_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "CaseAudio" a WHERE a."sourceDocumentId" = OLD."id")
     AND (NEW."causaId" IS DISTINCT FROM OLD."causaId" OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey") THEN
    RAISE EXCEPTION 'Audio source identity and case cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "CaseAudioPublication" p WHERE p."documentId" = OLD."id")
     AND NEW."causaId" IS DISTINCT FROM OLD."causaId" THEN
    RAISE EXCEPTION 'An audio transcript must remain in its source case' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lexopen_audio_document_guard BEFORE UPDATE ON "Documento"
FOR EACH ROW EXECUTE FUNCTION lexopen_guard_audio_document();

CREATE FUNCTION lexopen_guard_audio_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."causaId" IS DISTINCT FROM OLD."causaId" OR NEW."sourceDocumentId" IS DISTINCT FROM OLD."sourceDocumentId" OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR NEW."sourceSha256" IS DISTINCT FROM OLD."sourceSha256") THEN
    RAISE EXCEPTION 'Audio identity cannot be changed' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Documento" d WHERE d."id" = NEW."sourceDocumentId" AND d."causaId" = NEW."causaId" AND d."storageKey" = NEW."storageKey") THEN
    RAISE EXCEPTION 'Audio source must belong to the same case and storage object' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lexopen_audio_identity_guard BEFORE INSERT OR UPDATE ON "CaseAudio"
FOR EACH ROW EXECUTE FUNCTION lexopen_guard_audio_identity();

CREATE FUNCTION lexopen_guard_audio_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "CaseAudio" a JOIN "Documento" d ON d."id" = NEW."documentId" AND d."causaId" = a."causaId" WHERE a."id" = NEW."audioId") THEN
    RAISE EXCEPTION 'Audio publication must belong to its source case' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lexopen_audio_publication_guard BEFORE INSERT OR UPDATE ON "CaseAudioPublication"
FOR EACH ROW EXECUTE FUNCTION lexopen_guard_audio_publication();
