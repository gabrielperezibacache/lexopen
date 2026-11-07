CREATE TABLE "AltazorTeachingSession" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AltazorTeachingSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AltazorTeachingSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AltazorAcademicWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AltazorTeachingSession_time_order" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE UNIQUE INDEX "AltazorTeachingSession_workspaceId_requestId_key" ON "AltazorTeachingSession"("workspaceId", "requestId");
CREATE INDEX "AltazorTeachingSession_startsAt_workspaceId_idx" ON "AltazorTeachingSession"("startsAt", "workspaceId");
