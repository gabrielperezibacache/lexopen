-- CreateTable
CREATE TABLE "AltazorComputerWorkspace" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "causaId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "credentialEnc" TEXT,
    "providerName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dedicatedDeclaredAt" TIMESTAMP(3) NOT NULL,
    "gatewayVersion" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorComputerWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorComputerSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kittyName" TEXT NOT NULL,
    "kittyId" TEXT,
    "chatId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'creating',
    "held" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorComputerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorComputerAction" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "resultJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorComputerAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AltazorComputerWorkspace_endpoint_key" ON "AltazorComputerWorkspace"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorComputerWorkspace_ownerId_scopeKey_key" ON "AltazorComputerWorkspace"("ownerId", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorComputerSession_kittyName_key" ON "AltazorComputerSession"("kittyName");

-- CreateIndex
CREATE INDEX "AltazorComputerSession_ownerId_workspaceId_expiresAt_idx" ON "AltazorComputerSession"("ownerId", "workspaceId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorComputerSession_ownerId_requestId_key" ON "AltazorComputerSession"("ownerId", "requestId");

-- CreateIndex
CREATE INDEX "AltazorComputerAction_sessionId_createdAt_idx" ON "AltazorComputerAction"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorComputerAction_ownerId_requestId_key" ON "AltazorComputerAction"("ownerId", "requestId");

-- AddForeignKey
ALTER TABLE "AltazorComputerWorkspace" ADD CONSTRAINT "AltazorComputerWorkspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorComputerWorkspace" ADD CONSTRAINT "AltazorComputerWorkspace_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorComputerSession" ADD CONSTRAINT "AltazorComputerSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorComputerSession" ADD CONSTRAINT "AltazorComputerSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AltazorComputerWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorComputerAction" ADD CONSTRAINT "AltazorComputerAction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorComputerAction" ADD CONSTRAINT "AltazorComputerAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AltazorComputerSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "AltazorComputerWorkspace" ADD CONSTRAINT "AltazorComputerWorkspace_scope_check" CHECK ("scopeKey" = CASE WHEN "causaId" IS NULL THEN 'personal' ELSE 'causa:' || "causaId" END);
