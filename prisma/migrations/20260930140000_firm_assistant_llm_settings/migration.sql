-- AlterTable
ALTER TABLE "FirmSettings" ADD COLUMN "assistantLlmMode" TEXT NOT NULL DEFAULT 'remote_allowed';
ALTER TABLE "FirmSettings" ADD COLUMN "auditLlmPrompts" BOOLEAN NOT NULL DEFAULT false;
