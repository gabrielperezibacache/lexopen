ALTER TABLE "HearingNote" ADD COLUMN "liveKind" TEXT, ADD COLUMN "liveElapsedSeconds" INTEGER;
CREATE TABLE "HearingLiveState" (
  "workspaceId" TEXT NOT NULL,
  "phase" TEXT NOT NULL DEFAULT 'idle',
  "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
  "runningSince" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "opening" TEXT NOT NULL DEFAULT '',
  "closing" TEXT NOT NULL DEFAULT '',
  "noteIdsJson" TEXT NOT NULL DEFAULT '[]',
  "noteRevisionsJson" TEXT NOT NULL DEFAULT '{}',
  "addressedNoteIdsJson" TEXT NOT NULL DEFAULT '[]',
  "activeNoteId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HearingLiveState_pkey" PRIMARY KEY ("workspaceId")
);
CREATE TABLE "HearingLiveRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "inputSha256" TEXT NOT NULL,
  "resultingRevision" INTEGER NOT NULL,
  "resultNoteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HearingLiveRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HearingLiveRequest_workspaceId_requestId_key" ON "HearingLiveRequest"("workspaceId","requestId");
ALTER TABLE "HearingLiveState" ADD CONSTRAINT "HearingLiveState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "HearingWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HearingLiveRequest" ADD CONSTRAINT "HearingLiveRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "HearingWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
