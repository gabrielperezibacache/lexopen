ALTER TABLE "AltazorAcademicWorkspace"
  ADD COLUMN "calendarFeedTokenHash" VARCHAR(64),
  ADD COLUMN "calendarFeedEnabledAt" TIMESTAMP(3),
  ADD CONSTRAINT "AltazorAcademicWorkspace_calendar_feed_pair"
    CHECK (("calendarFeedTokenHash" IS NULL) = ("calendarFeedEnabledAt" IS NULL));

CREATE UNIQUE INDEX "AltazorAcademicWorkspace_calendarFeedTokenHash_key"
  ON "AltazorAcademicWorkspace"("calendarFeedTokenHash");

ALTER TABLE "AltazorTeachingSession"
  ADD COLUMN "updatedAt" TIMESTAMP(3),
  ADD COLUMN "calendarSequence" INTEGER NOT NULL DEFAULT 0;

UPDATE "AltazorTeachingSession" SET "updatedAt" = "createdAt";

ALTER TABLE "AltazorTeachingSession"
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
