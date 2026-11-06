ALTER TABLE "AltazorCompanion" ADD COLUMN "dailyBriefNextAt" TIMESTAMP(3);

CREATE INDEX "AltazorCompanion_dailyBriefNextAt_idx" ON "AltazorCompanion"("dailyBriefNextAt");

CREATE TABLE "AltazorDailyBrief" (
    "ownerId" TEXT NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AltazorDailyBrief_pkey" PRIMARY KEY ("ownerId", "day"),
    CONSTRAINT "AltazorDailyBrief_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AltazorCompanion"("ownerId") ON DELETE CASCADE ON UPDATE CASCADE
);
