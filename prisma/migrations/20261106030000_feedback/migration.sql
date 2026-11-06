CREATE TYPE "FeedbackCategory" AS ENUM ('sugerencia', 'error', 'otro');
CREATE TYPE "FeedbackStatus" AS ENUM ('nuevo', 'en_revision', 'resuelto');

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" VARCHAR(160) NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "details" VARCHAR(3000) NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'nuevo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Feedback_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Feedback_ownerId_requestId_key" ON "Feedback"("ownerId", "requestId");
CREATE INDEX "Feedback_ownerId_createdAt_id_idx" ON "Feedback"("ownerId", "createdAt", "id");
CREATE INDEX "Feedback_createdAt_id_idx" ON "Feedback"("createdAt", "id");
