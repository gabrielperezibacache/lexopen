-- AlterTable
ALTER TABLE "AltazorHelpRequest" ADD COLUMN     "caseJobId" TEXT;

-- CreateTable
CREATE TABLE "AltazorCaseJob" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "originTurnId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputSha256" TEXT NOT NULL,
    "actorSessionVersion" INTEGER NOT NULL,
    "objective" TEXT NOT NULL,
    "planJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "reportJson" TEXT NOT NULL DEFAULT '{}',
    "selectionJson" TEXT NOT NULL DEFAULT 'null',
    "helpRequestId" TEXT,
    "errorCode" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorCaseJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorCaseJobStep" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "icaroJobId" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorCaseJobStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AltazorCaseJob_originTurnId_key" ON "AltazorCaseJob"("originTurnId");

-- CreateIndex
CREATE INDEX "AltazorCaseJob_ownerId_status_updatedAt_idx" ON "AltazorCaseJob"("ownerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "AltazorCaseJob_status_updatedAt_idx" ON "AltazorCaseJob"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorCaseJob_ownerId_requestId_key" ON "AltazorCaseJob"("ownerId", "requestId");

-- CreateIndex
CREATE INDEX "AltazorCaseJobStep_jobId_status_ordinal_idx" ON "AltazorCaseJobStep"("jobId", "status", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorCaseJobStep_jobId_ordinal_key" ON "AltazorCaseJobStep"("jobId", "ordinal");

-- AddForeignKey
ALTER TABLE "AltazorCaseJob" ADD CONSTRAINT "AltazorCaseJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorCaseJob" ADD CONSTRAINT "AltazorCaseJob_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorCaseJob" ADD CONSTRAINT "AltazorCaseJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AltazorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorCaseJobStep" ADD CONSTRAINT "AltazorCaseJobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AltazorCaseJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
