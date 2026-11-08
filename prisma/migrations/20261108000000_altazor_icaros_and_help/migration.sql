-- CreateTable
CREATE TABLE "AltazorIcaro" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "causaId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputSha256" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'inherit',
    "model" TEXT NOT NULL DEFAULT '',
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorIcaro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorIcaroJob" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "icaroId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputSha256" TEXT NOT NULL,
    "actorSessionVersion" INTEGER NOT NULL,
    "profileRevision" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "explicitText" TEXT NOT NULL DEFAULT '',
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "destinationJson" TEXT NOT NULL,
    "parentJobId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "result" TEXT NOT NULL DEFAULT '',
    "errorCode" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorIcaroJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorIcaroMemory" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "icaroId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputSha256" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "sourceJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "forgottenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorIcaroMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorHelpRequest" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "conversationId" TEXT,
    "computerSessionId" TEXT,
    "computerTurnId" TEXT,
    "scopeKind" TEXT,
    "scopeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "question" TEXT NOT NULL,
    "correlationHash" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "response" TEXT,
    "responseSource" TEXT,
    "responseMessageId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "notificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "notificationAttemptedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "deliveryJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorHelpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AltazorIcaro_ownerId_scopeKey_enabled_idx" ON "AltazorIcaro"("ownerId", "scopeKey", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorIcaro_ownerId_requestId_key" ON "AltazorIcaro"("ownerId", "requestId");

-- CreateIndex
CREATE INDEX "AltazorIcaroJob_ownerId_status_leaseExpiresAt_idx" ON "AltazorIcaroJob"("ownerId", "status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "AltazorIcaroJob_icaroId_createdAt_idx" ON "AltazorIcaroJob"("icaroId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorIcaroJob_ownerId_requestId_key" ON "AltazorIcaroJob"("ownerId", "requestId");

-- CreateIndex
CREATE INDEX "AltazorIcaroMemory_ownerId_icaroId_status_idx" ON "AltazorIcaroMemory"("ownerId", "icaroId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorIcaroMemory_icaroId_requestId_key" ON "AltazorIcaroMemory"("icaroId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorHelpRequest_correlationHash_key" ON "AltazorHelpRequest"("correlationHash");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorHelpRequest_requestKey_key" ON "AltazorHelpRequest"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorHelpRequest_responseMessageId_key" ON "AltazorHelpRequest"("responseMessageId");

-- CreateIndex
CREATE INDEX "AltazorHelpRequest_ownerId_status_createdAt_idx" ON "AltazorHelpRequest"("ownerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AltazorHelpRequest_status_expiresAt_idx" ON "AltazorHelpRequest"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "AltazorIcaro" ADD CONSTRAINT "AltazorIcaro_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorIcaro" ADD CONSTRAINT "AltazorIcaro_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorIcaroJob" ADD CONSTRAINT "AltazorIcaroJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorIcaroJob" ADD CONSTRAINT "AltazorIcaroJob_icaroId_fkey" FOREIGN KEY ("icaroId") REFERENCES "AltazorIcaro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorIcaroMemory" ADD CONSTRAINT "AltazorIcaroMemory_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorIcaroMemory" ADD CONSTRAINT "AltazorIcaroMemory_icaroId_fkey" FOREIGN KEY ("icaroId") REFERENCES "AltazorIcaro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorHelpRequest" ADD CONSTRAINT "AltazorHelpRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

