ALTER TABLE "Plazo" ADD COLUMN "stateRevision" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "PlazoStateEvent" (
 "id" TEXT NOT NULL, "plazoId" TEXT NOT NULL, "revision" INTEGER NOT NULL,
 "fromEstado" TEXT, "toEstado" TEXT NOT NULL, "actorId" TEXT, "actorName" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "origin" TEXT NOT NULL,
 "scopeCausaId" TEXT, "confidential" BOOLEAN NOT NULL DEFAULT false, "supportKind" TEXT, "justification" TEXT, "documentoId" TEXT, "documentVersion" INTEGER, "documentSha256" TEXT,
 CONSTRAINT "PlazoStateEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlazoStateEvent_plazoId_revision_key" ON "PlazoStateEvent"("plazoId", "revision");
CREATE INDEX "PlazoStateEvent_plazoId_createdAt_id_idx" ON "PlazoStateEvent"("plazoId", "createdAt", "id");
ALTER TABLE "PlazoStateEvent" ADD CONSTRAINT "PlazoStateEvent_plazoId_fkey" FOREIGN KEY ("plazoId") REFERENCES "Plazo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlazoStateEvent" ADD CONSTRAINT "PlazoStateEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
