ALTER TABLE "CaseAudio" ADD COLUMN "liveSessionId" TEXT;
CREATE INDEX "CaseAudio_liveSessionId_createdAt_idx" ON "CaseAudio"("liveSessionId", "createdAt");
CREATE TABLE "HearingLiveAudioSession" (
 "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'recording', "nextSequence" INTEGER NOT NULL DEFAULT 0, "totalBytes" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3),
 CONSTRAINT "HearingLiveAudioSession_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "HearingLiveAudioSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "HearingWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HearingLiveAudioSession_workspaceId_requestId_key" ON "HearingLiveAudioSession"("workspaceId", "requestId");
CREATE INDEX "HearingLiveAudioSession_workspaceId_createdAt_idx" ON "HearingLiveAudioSession"("workspaceId", "createdAt");
CREATE TABLE "HearingLiveAudioClip" (
 "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "sourceName" TEXT NOT NULL,
 "sourceSha256" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "attemptIdsJson" TEXT NOT NULL DEFAULT '[]', "audioId" TEXT, "documentId" TEXT, "sourceId" TEXT,
 "text" TEXT NOT NULL DEFAULT '', "textSha256" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "operationToken" TEXT, "operationLockedAt" TIMESTAMP(3), "lastError" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "HearingLiveAudioClip_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "HearingLiveAudioClip_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HearingLiveAudioSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HearingLiveAudioClip_sessionId_requestId_key" ON "HearingLiveAudioClip"("sessionId", "requestId");
CREATE UNIQUE INDEX "HearingLiveAudioClip_sessionId_sequence_key" ON "HearingLiveAudioClip"("sessionId", "sequence");
CREATE INDEX "HearingLiveAudioClip_sessionId_status_idx" ON "HearingLiveAudioClip"("sessionId", "status");
CREATE TABLE "HearingLivePromotion" (
 "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "inputSha256" TEXT NOT NULL,
 "sourceNoteId" TEXT NOT NULL, "sourceRevision" INTEGER NOT NULL, "targetKind" TEXT NOT NULL, "targetId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "HearingLivePromotion_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "HearingLivePromotion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "HearingWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HearingLivePromotion_workspaceId_requestId_key" ON "HearingLivePromotion"("workspaceId", "requestId");

ALTER TABLE "CaseAudio" ADD CONSTRAINT "CaseAudio_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "HearingLiveAudioSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HearingSource" ADD COLUMN "liveAudioClipId" TEXT;
CREATE UNIQUE INDEX "HearingSource_liveAudioClipId_key" ON "HearingSource"("liveAudioClipId");
