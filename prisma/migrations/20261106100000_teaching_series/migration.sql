CREATE TABLE "AltazorTeachingSeries" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "inputSha256" VARCHAR(64) NOT NULL,
  "count" INTEGER NOT NULL,
  "intervalWeeks" INTEGER NOT NULL,
  CONSTRAINT "AltazorTeachingSeries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AltazorTeachingSeries_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "AltazorAcademicWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AltazorTeachingSeries_recurrence_limits" CHECK ("count" BETWEEN 2 AND 24 AND "intervalWeeks" IN (1, 2))
);

CREATE UNIQUE INDEX "AltazorTeachingSeries_workspaceId_requestId_key" ON "AltazorTeachingSeries"("workspaceId", "requestId");
CREATE UNIQUE INDEX "AltazorTeachingSeries_id_workspaceId_key" ON "AltazorTeachingSeries"("id", "workspaceId");

ALTER TABLE "AltazorTeachingSession"
  ADD COLUMN "requestPayloadSha256" VARCHAR(64),
  ADD COLUMN "seriesId" TEXT,
  ADD COLUMN "seriesOccurrence" INTEGER,
  ADD CONSTRAINT "AltazorTeachingSession_seriesId_workspaceId_fkey"
    FOREIGN KEY ("seriesId", "workspaceId") REFERENCES "AltazorTeachingSeries"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AltazorTeachingSession_series_occurrence"
    CHECK (("seriesId" IS NULL) = ("seriesOccurrence" IS NULL) AND ("seriesOccurrence" IS NULL OR "seriesOccurrence" BETWEEN 1 AND 24));

CREATE UNIQUE INDEX "AltazorTeachingSession_seriesId_seriesOccurrence_key" ON "AltazorTeachingSession"("seriesId", "seriesOccurrence");
