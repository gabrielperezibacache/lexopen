-- CreateTable
CREATE TABLE IF NOT EXISTS "MailboxAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'demo',
    "email" TEXT,
    "imapHost" TEXT,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapTls" BOOLEAN NOT NULL DEFAULT true,
    "passwordEnc" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MailboxMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'otro',
    "status" TEXT NOT NULL DEFAULT 'nuevo',
    "subject" TEXT NOT NULL,
    "fromAddress" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "bodyText" TEXT NOT NULL,
    "parsedJson" TEXT,
    "rit" TEXT,
    "tribunal" TEXT,
    "causaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MailboxAccount_userId_key" ON "MailboxAccount"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "MailboxMessage_userId_externalId_key" ON "MailboxMessage"("userId", "externalId");
CREATE INDEX IF NOT EXISTS "MailboxMessage_userId_status_idx" ON "MailboxMessage"("userId", "status");
CREATE INDEX IF NOT EXISTS "MailboxMessage_causaId_idx" ON "MailboxMessage"("causaId");

DO $$ BEGIN
  ALTER TABLE "MailboxAccount" ADD CONSTRAINT "MailboxAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MailboxMessage" ADD CONSTRAINT "MailboxMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MailboxMessage" ADD CONSTRAINT "MailboxMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailboxAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MailboxMessage" ADD CONSTRAINT "MailboxMessage_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
