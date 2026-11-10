ALTER TABLE "AltazorComputerSession" ADD COLUMN "lastHelpCheckedAt" TIMESTAMP(3);
CREATE INDEX "AltazorComputerSession_lastHelpCheckedAt_id_idx" ON "AltazorComputerSession"("lastHelpCheckedAt", "id");
