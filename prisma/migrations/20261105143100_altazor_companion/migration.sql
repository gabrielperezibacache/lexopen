CREATE TABLE "AltazorCompanion" (
  "ownerId" TEXT NOT NULL,
  "activeConversationId" TEXT,
  "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
  "backgroundEnabled" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AltazorCompanion_pkey" PRIMARY KEY ("ownerId")
);
ALTER TABLE "AltazorCompanion" ADD CONSTRAINT "AltazorCompanion_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AltazorCompanion" ADD CONSTRAINT "AltazorCompanion_activeConversationId_fkey" FOREIGN KEY ("activeConversationId") REFERENCES "AltazorConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AltazorTurn" ADD COLUMN "actorSessionVersion" INTEGER;
