CREATE TABLE "AltazorSecret" (
    "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL, "username" TEXT, "kind" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AltazorSecret_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AltazorSecret_revision_positive" CHECK ("revision" > 0),
    CONSTRAINT "AltazorSecret_ciphertext_encrypted" CHECK ("ciphertext" LIKE 'as:v1:%')
);
CREATE TABLE "AltazorSecretReceipt" (
    "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL, "inputHash" TEXT NOT NULL, "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AltazorSecretReceipt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AltazorSecretGrant" (
    "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "secretId" TEXT NOT NULL,
    "secretRevision" INTEGER NOT NULL, "sessionId" TEXT NOT NULL,
    "targetJson" TEXT NOT NULL, "targetHash" TEXT NOT NULL, "sessionHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending', "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AltazorSecretGrant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AltazorSecretGrant_revision_positive" CHECK ("secretRevision" > 0),
    CONSTRAINT "AltazorSecretGrant_known_state" CHECK ("state" IN ('pending', 'consuming', 'used', 'unknown', 'revoked'))
);
CREATE INDEX "AltazorSecret_ownerId_updatedAt_idx" ON "AltazorSecret"("ownerId", "updatedAt");
CREATE UNIQUE INDEX "AltazorSecretReceipt_ownerId_requestId_key" ON "AltazorSecretReceipt"("ownerId", "requestId");
CREATE INDEX "AltazorSecretGrant_ownerId_sessionId_state_idx" ON "AltazorSecretGrant"("ownerId", "sessionId", "state");
CREATE INDEX "AltazorSecretGrant_secretId_secretRevision_state_idx" ON "AltazorSecretGrant"("secretId", "secretRevision", "state");
ALTER TABLE "AltazorSecret" ADD CONSTRAINT "AltazorSecret_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AltazorSecretReceipt" ADD CONSTRAINT "AltazorSecretReceipt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AltazorSecretGrant" ADD CONSTRAINT "AltazorSecretGrant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AltazorSecretGrant" ADD CONSTRAINT "AltazorSecretGrant_secretId_fkey" FOREIGN KEY ("secretId") REFERENCES "AltazorSecret"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AltazorSecretGrant" ADD CONSTRAINT "AltazorSecretGrant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AltazorComputerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AltazorComputerSession" ADD COLUMN "connectorNamesJson" TEXT NOT NULL DEFAULT '[]';
CREATE TABLE "AltazorConnectorOperation" (
    "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL, "kind" TEXT NOT NULL, "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sending', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AltazorConnectorOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AltazorConnectorOperation_ownerId_requestId_key" ON "AltazorConnectorOperation"("ownerId", "requestId");
CREATE INDEX "AltazorConnectorOperation_workspaceId_status_idx" ON "AltazorConnectorOperation"("workspaceId", "status");
