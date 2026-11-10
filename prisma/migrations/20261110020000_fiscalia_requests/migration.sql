CREATE TABLE "FiscaliaRequest" (
 "id" TEXT NOT NULL, "causaId" TEXT NOT NULL, "creatorId" TEXT NOT NULL,
 "title" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'informacion', "body" TEXT NOT NULL DEFAULT '', "ruc" TEXT,
 "status" TEXT NOT NULL DEFAULT 'draft', "folio" TEXT, "submittedAt" TIMESTAMP(3), "responseText" TEXT NOT NULL DEFAULT '',
 "answeredAt" TIMESTAMP(3), "followUpDate" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FiscaliaRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FiscaliaRequestEvent" (
 "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "actorId" TEXT, "status" TEXT NOT NULL, "action" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "FiscaliaRequestEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FiscaliaRequest_causaId_status_followUpDate_idx" ON "FiscaliaRequest"("causaId", "status", "followUpDate");
CREATE INDEX "FiscaliaRequest_updatedAt_id_idx" ON "FiscaliaRequest"("updatedAt", "id");
CREATE INDEX "FiscaliaRequestEvent_requestId_createdAt_idx" ON "FiscaliaRequestEvent"("requestId", "createdAt");
ALTER TABLE "FiscaliaRequest" ADD CONSTRAINT "FiscaliaRequest_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscaliaRequest" ADD CONSTRAINT "FiscaliaRequest_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscaliaRequestEvent" ADD CONSTRAINT "FiscaliaRequestEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FiscaliaRequestEvent" ADD CONSTRAINT "FiscaliaRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FiscaliaRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
