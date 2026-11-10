-- NULL means a persistent desktop. Preserve existing temporary sessions until their owner opts in.
ALTER TABLE "AltazorComputerSession" ALTER COLUMN "expiresAt" DROP NOT NULL;
