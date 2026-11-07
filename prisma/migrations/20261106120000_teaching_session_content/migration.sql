ALTER TABLE "AltazorTeachingSession"
  ADD COLUMN "contentJson" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 0;
