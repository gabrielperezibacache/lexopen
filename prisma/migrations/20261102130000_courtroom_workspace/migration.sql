-- AlterTable
ALTER TABLE "LibraryBook" ADD COLUMN     "judicialJson" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'book';

-- CreateTable
CREATE TABLE "HearingWorkspace" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'preparation',
    "agendaText" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HearingWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HearingSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "locationJson" TEXT NOT NULL DEFAULT '{}',
    "state" TEXT NOT NULL DEFAULT 'pending',
    "position" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HearingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HearingNote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "citationJson" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HearingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HearingChatTurn" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "citationsJson" TEXT NOT NULL DEFAULT '[]',
    "scopeJson" TEXT NOT NULL DEFAULT '{}',
    "mode" TEXT NOT NULL,
    "modelUsed" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HearingChatTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAudio" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "transcriptDocumentId" TEXT,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "transcriptText" TEXT NOT NULL DEFAULT '',
    "segmentsJson" TEXT NOT NULL DEFAULT '[]',
    "transcriptSha256" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'unreviewed',
    "reviewedById" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT,
    "model" TEXT,
    "operationToken" TEXT,
    "operationLockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseAudio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAudioTranscriptRevision" (
    "id" TEXT NOT NULL,
    "audioId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "segmentsJson" TEXT NOT NULL DEFAULT '[]',
    "textSha256" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAudioTranscriptRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HearingWorkspace_ownerId_causaId_updatedAt_idx" ON "HearingWorkspace"("ownerId", "causaId", "updatedAt");

-- CreateIndex
CREATE INDEX "HearingSource_workspaceId_position_idx" ON "HearingSource"("workspaceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "HearingSource_workspaceId_kind_refId_key" ON "HearingSource"("workspaceId", "kind", "refId");

-- CreateIndex
CREATE INDEX "HearingNote_workspaceId_updatedAt_idx" ON "HearingNote"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "HearingChatTurn_workspaceId_createdAt_idx" ON "HearingChatTurn"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HearingChatTurn_workspaceId_requestId_key" ON "HearingChatTurn"("workspaceId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAudio_sourceDocumentId_key" ON "CaseAudio"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "CaseAudio_causaId_status_createdAt_idx" ON "CaseAudio"("causaId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAudio_causaId_uploadedById_requestId_key" ON "CaseAudio"("causaId", "uploadedById", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAudioTranscriptRevision_audioId_revision_key" ON "CaseAudioTranscriptRevision"("audioId", "revision");

-- CreateIndex
CREATE INDEX "LibraryBook_ownerId_sourceType_deletedAt_idx" ON "LibraryBook"("ownerId", "sourceType", "deletedAt");

-- AddForeignKey
ALTER TABLE "HearingWorkspace" ADD CONSTRAINT "HearingWorkspace_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingWorkspace" ADD CONSTRAINT "HearingWorkspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingSource" ADD CONSTRAINT "HearingSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "HearingWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingNote" ADD CONSTRAINT "HearingNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "HearingWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingNote" ADD CONSTRAINT "HearingNote_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "HearingSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingChatTurn" ADD CONSTRAINT "HearingChatTurn_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "HearingWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAudio" ADD CONSTRAINT "CaseAudio_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAudio" ADD CONSTRAINT "CaseAudio_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAudio" ADD CONSTRAINT "CaseAudio_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAudio" ADD CONSTRAINT "CaseAudio_transcriptDocumentId_fkey" FOREIGN KEY ("transcriptDocumentId") REFERENCES "Documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAudio" ADD CONSTRAINT "CaseAudio_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAudioTranscriptRevision" ADD CONSTRAINT "CaseAudioTranscriptRevision_audioId_fkey" FOREIGN KEY ("audioId") REFERENCES "CaseAudio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAudioTranscriptRevision" ADD CONSTRAINT "CaseAudioTranscriptRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

