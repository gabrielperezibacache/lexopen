ALTER TABLE "AltazorTeachingSession"
  ADD COLUMN "reminderLeadMinutes" INTEGER,
  ADD COLUMN "reminderDueAt" TIMESTAMP(3),
  ADD CONSTRAINT "AltazorTeachingSession_reminder_lead_valid"
    CHECK ("reminderLeadMinutes" IN (15, 60, 1440, 10080)),
  ADD CONSTRAINT "AltazorTeachingSession_reminder_due_matches_start"
    CHECK (
      "reminderDueAt" IS NULL OR (
        "reminderLeadMinutes" IS NOT NULL
        AND "reminderDueAt" = "startsAt" - "reminderLeadMinutes" * INTERVAL '1 minute'
      )
    );

CREATE INDEX "AltazorTeachingSession_reminderDueAt_startsAt_idx"
  ON "AltazorTeachingSession" ("reminderDueAt", "startsAt");
