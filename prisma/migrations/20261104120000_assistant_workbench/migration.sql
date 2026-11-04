CREATE TABLE "WorkbenchRun" (
 "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "causaId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "inputSha256" TEXT NOT NULL,
 "objective" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "destinationJson" TEXT NOT NULL, "imageId" TEXT NOT NULL,
 "body" TEXT NOT NULL DEFAULT '', "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3), "cancelRequestedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "finishedAt" TIMESTAMP(3),
 CONSTRAINT "WorkbenchRun_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "WorkbenchRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "WorkbenchRun_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkbenchRun_ownerId_causaId_requestId_key" ON "WorkbenchRun"("ownerId","causaId","requestId");
CREATE INDEX "WorkbenchRun_ownerId_causaId_createdAt_idx" ON "WorkbenchRun"("ownerId","causaId","createdAt");
CREATE INDEX "WorkbenchRun_status_leaseExpiresAt_idx" ON "WorkbenchRun"("status","leaseExpiresAt");
CREATE TABLE "WorkbenchInputSnapshot" (
 "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "ordinal" INTEGER NOT NULL, "sourceJson" TEXT NOT NULL, "sourceSha256" TEXT NOT NULL,
 CONSTRAINT "WorkbenchInputSnapshot_pkey" PRIMARY KEY ("id"), CONSTRAINT "WorkbenchInputSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkbenchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkbenchInputSnapshot_runId_ordinal_key" ON "WorkbenchInputSnapshot"("runId","ordinal");
CREATE TABLE "WorkbenchEvent" (
 "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "kind" TEXT NOT NULL, "message" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WorkbenchEvent_pkey" PRIMARY KEY ("id"), CONSTRAINT "WorkbenchEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkbenchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkbenchEvent_runId_createdAt_idx" ON "WorkbenchEvent"("runId","createdAt");
CREATE TABLE "WorkbenchArtifact" (
 "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "name" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sha256" TEXT NOT NULL, "size" INTEGER NOT NULL, "data" BYTEA NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WorkbenchArtifact_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "WorkbenchArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkbenchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkbenchArtifact_runId_name_key" ON "WorkbenchArtifact"("runId","name");
CREATE TABLE "WorkbenchImportReceipt" (
 "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "draftId" TEXT NOT NULL, "artifactSha256" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WorkbenchImportReceipt_pkey" PRIMARY KEY ("id"), CONSTRAINT "WorkbenchImportReceipt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkbenchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkbenchImportReceipt_runId_key" ON "WorkbenchImportReceipt"("runId");
