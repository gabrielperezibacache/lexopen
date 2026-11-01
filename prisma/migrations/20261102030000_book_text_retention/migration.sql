-- AlterTable
ALTER TABLE "LibraryBook" ADD COLUMN     "conversionJson" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "convertedToText" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalBytes" INTEGER,
ADD COLUMN     "originalRetained" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "retainedBytes" INTEGER,
ADD COLUMN     "retainedSha256" TEXT;

-- AlterTable
ALTER TABLE "UserBookPreference" ADD COLUMN     "defaultConvertToText" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultPreserveOriginal" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "heavyFileThresholdMb" INTEGER NOT NULL DEFAULT 10;

