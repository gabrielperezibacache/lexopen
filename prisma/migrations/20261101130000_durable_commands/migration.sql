CREATE TABLE "AssistantPlanRecord" (
  "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "planJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "resultsJson" TEXT NOT NULL DEFAULT '[]',
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AssistantPlanRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantPlanRecord_ownerId_expiresAt_idx" ON "AssistantPlanRecord"("ownerId", "expiresAt");
CREATE TABLE "CommandExecution" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "inputHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running', "resultJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommandExecution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommandExecution_key_key" ON "CommandExecution"("key");
CREATE TABLE "AssistantUndo" (
  "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "toolId" TEXT NOT NULL, "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL, "payloadJson" TEXT NOT NULL, "expectedJson" TEXT NOT NULL,
  "consumedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantUndo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantUndo_ownerId_expiresAt_idx" ON "AssistantUndo"("ownerId", "expiresAt");
