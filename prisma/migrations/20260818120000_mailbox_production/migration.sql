-- Production mailbox: drop demo protocol, add OAuth/cursors/attachments.

ALTER TABLE "MailboxAccount" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'disconnected';
ALTER TABLE "MailboxAccount" ADD COLUMN IF NOT EXISTS "oauthRefreshEnc" TEXT;
ALTER TABLE "MailboxAccount" ADD COLUMN IF NOT EXISTS "oauthAccessEnc" TEXT;
ALTER TABLE "MailboxAccount" ADD COLUMN IF NOT EXISTS "oauthExpiresAt" TIMESTAMP(3);
ALTER TABLE "MailboxAccount" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "MailboxAccount" ADD COLUMN IF NOT EXISTS "imapUidValidity" INTEGER;
ALTER TABLE "MailboxAccount" ADD COLUMN IF NOT EXISTS "imapLastUid" INTEGER;
ALTER TABLE "MailboxAccount" ADD COLUMN IF NOT EXISTS "gmailHistoryId" TEXT;
ALTER TABLE "MailboxAccount" ADD COLUMN IF NOT EXISTS "graphDeltaLink" TEXT;

UPDATE "MailboxAccount"
SET
  "protocol" = CASE WHEN "protocol" IN ('gmail', 'microsoft', 'imap') THEN "protocol" ELSE 'imap' END,
  "status" = CASE
    WHEN "protocol" = 'imap' AND "passwordEnc" IS NOT NULL AND "imapHost" IS NOT NULL THEN 'connected'
    WHEN "protocol" IN ('gmail', 'microsoft') AND "oauthRefreshEnc" IS NOT NULL THEN 'connected'
    ELSE 'disconnected'
  END
WHERE TRUE;

ALTER TABLE "MailboxAccount" ALTER COLUMN "protocol" SET DEFAULT 'imap';
ALTER TABLE "MailboxAccount" ALTER COLUMN "status" SET DEFAULT 'disconnected';

CREATE TABLE IF NOT EXISTS "MailboxAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT,
    "documentoId" TEXT,
    "siteFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailboxAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MailboxAttachment_messageId_sha256_key" ON "MailboxAttachment"("messageId", "sha256");
CREATE INDEX IF NOT EXISTS "MailboxAttachment_documentoId_idx" ON "MailboxAttachment"("documentoId");

DO $$ BEGIN
  ALTER TABLE "MailboxAttachment" ADD CONSTRAINT "MailboxAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MailboxMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
