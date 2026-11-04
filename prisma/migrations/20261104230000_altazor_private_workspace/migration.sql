-- CreateTable
CREATE TABLE "AltazorConversation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "causaId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "nextOrdinal" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorTurn" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "inputSha256" TEXT NOT NULL,
    "userText" TEXT NOT NULL,
    "assistantText" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "planId" TEXT,
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "resultsJson" TEXT NOT NULL DEFAULT '[]',
    "destinationJson" TEXT NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorAttachment" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputSha256" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "originalData" BYTEA,
    "sourceSha256" TEXT NOT NULL,
    "textSha256" TEXT,
    "extractorVersion" TEXT,
    "extractedText" TEXT NOT NULL DEFAULT '',
    "extractionJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'processing',
    "errorCode" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorMemorySpace" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "causaId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "epoch" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorMemorySpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorMemoryNode" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "confirmedAt" TIMESTAMP(3),
    "forgottenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorMemoryNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorMemoryEdge" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "confirmedAt" TIMESTAMP(3),
    "forgottenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorMemoryEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorMemorySupport" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "nodeId" TEXT,
    "edgeId" TEXT,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "snapshotSha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AltazorMemorySupport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalConnectorAccount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalSubject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "grantedScopesJson" TEXT,
    "credentialsEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "pictureUrl" TEXT,
    "email" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalConnectorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalOAuthAttempt" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "requestedScopesJson" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'pending',
    "resultEnc" TEXT,
    "errorCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalOAuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalShareDraft" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'CONNECTIONS',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalShareDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPublicationAttempt" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftRevision" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "externalUrn" TEXT,
    "externalUrl" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPublicationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorAcademicWorkspace" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "briefJson" TEXT NOT NULL DEFAULT '{}',
    "matrixJson" TEXT NOT NULL DEFAULT '{}',
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorAcademicWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorAcademicArtifact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputSha256" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "sourceSnapshotsJson" TEXT NOT NULL DEFAULT '[]',
    "destinationJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "bodySha256" TEXT NOT NULL DEFAULT '',
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorAcademicArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AltazorAcademicProfile" (
    "ownerId" TEXT NOT NULL,
    "profileJson" TEXT NOT NULL DEFAULT '{}',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AltazorAcademicProfile_pkey" PRIMARY KEY ("ownerId")
);

-- CreateIndex
CREATE INDEX "AltazorConversation_ownerId_status_updatedAt_idx" ON "AltazorConversation"("ownerId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorConversation_ownerId_requestId_key" ON "AltazorConversation"("ownerId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorTurn_planId_key" ON "AltazorTurn"("planId");

-- CreateIndex
CREATE INDEX "AltazorTurn_ownerId_createdAt_idx" ON "AltazorTurn"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "AltazorTurn_status_leaseExpiresAt_idx" ON "AltazorTurn"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorTurn_conversationId_requestId_key" ON "AltazorTurn"("conversationId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorTurn_conversationId_ordinal_key" ON "AltazorTurn"("conversationId", "ordinal");

-- CreateIndex
CREATE INDEX "AltazorAttachment_ownerId_conversationId_status_idx" ON "AltazorAttachment"("ownerId", "conversationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorAttachment_conversationId_requestId_key" ON "AltazorAttachment"("conversationId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorMemorySpace_ownerId_scopeKey_key" ON "AltazorMemorySpace"("ownerId", "scopeKey");

-- CreateIndex
CREATE INDEX "AltazorMemoryNode_spaceId_status_updatedAt_idx" ON "AltazorMemoryNode"("spaceId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorMemoryNode_spaceId_id_key" ON "AltazorMemoryNode"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorMemoryNode_spaceId_fingerprint_key" ON "AltazorMemoryNode"("spaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "AltazorMemoryEdge_spaceId_status_updatedAt_idx" ON "AltazorMemoryEdge"("spaceId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorMemoryEdge_spaceId_id_key" ON "AltazorMemoryEdge"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorMemoryEdge_spaceId_fingerprint_key" ON "AltazorMemoryEdge"("spaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "AltazorMemorySupport_spaceId_nodeId_idx" ON "AltazorMemorySupport"("spaceId", "nodeId");

-- CreateIndex
CREATE INDEX "AltazorMemorySupport_spaceId_edgeId_idx" ON "AltazorMemorySupport"("spaceId", "edgeId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalConnectorAccount_ownerId_provider_key" ON "PersonalConnectorAccount"("ownerId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalConnectorAccount_provider_clientId_externalSubject_key" ON "PersonalConnectorAccount"("provider", "clientId", "externalSubject");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalOAuthAttempt_stateHash_key" ON "PersonalOAuthAttempt"("stateHash");

-- CreateIndex
CREATE INDEX "PersonalOAuthAttempt_ownerId_provider_expiresAt_idx" ON "PersonalOAuthAttempt"("ownerId", "provider", "expiresAt");

-- CreateIndex
CREATE INDEX "ExternalShareDraft_ownerId_updatedAt_idx" ON "ExternalShareDraft"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalShareDraft_ownerId_requestId_key" ON "ExternalShareDraft"("ownerId", "requestId");

-- CreateIndex
CREATE INDEX "ExternalPublicationAttempt_ownerId_createdAt_idx" ON "ExternalPublicationAttempt"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPublicationAttempt_ownerId_requestId_key" ON "ExternalPublicationAttempt"("ownerId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPublicationAttempt_draftId_draftRevision_key" ON "ExternalPublicationAttempt"("draftId", "draftRevision");

-- CreateIndex
CREATE INDEX "AltazorAcademicWorkspace_ownerId_archivedAt_updatedAt_idx" ON "AltazorAcademicWorkspace"("ownerId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorAcademicWorkspace_ownerId_requestId_key" ON "AltazorAcademicWorkspace"("ownerId", "requestId");

-- CreateIndex
CREATE INDEX "AltazorAcademicArtifact_workspaceId_createdAt_idx" ON "AltazorAcademicArtifact"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AltazorAcademicArtifact_workspaceId_requestId_key" ON "AltazorAcademicArtifact"("workspaceId", "requestId");

-- AddForeignKey
ALTER TABLE "AltazorConversation" ADD CONSTRAINT "AltazorConversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorConversation" ADD CONSTRAINT "AltazorConversation_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorTurn" ADD CONSTRAINT "AltazorTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AltazorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorTurn" ADD CONSTRAINT "AltazorTurn_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorAttachment" ADD CONSTRAINT "AltazorAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AltazorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorAttachment" ADD CONSTRAINT "AltazorAttachment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorMemorySpace" ADD CONSTRAINT "AltazorMemorySpace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorMemorySpace" ADD CONSTRAINT "AltazorMemorySpace_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorMemoryNode" ADD CONSTRAINT "AltazorMemoryNode_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "AltazorMemorySpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorMemoryEdge" ADD CONSTRAINT "AltazorMemoryEdge_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "AltazorMemorySpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorMemoryEdge" ADD CONSTRAINT "AltazorMemoryEdge_spaceId_fromId_fkey" FOREIGN KEY ("spaceId", "fromId") REFERENCES "AltazorMemoryNode"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorMemoryEdge" ADD CONSTRAINT "AltazorMemoryEdge_spaceId_toId_fkey" FOREIGN KEY ("spaceId", "toId") REFERENCES "AltazorMemoryNode"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorMemorySupport" ADD CONSTRAINT "AltazorMemorySupport_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "AltazorMemorySpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorMemorySupport" ADD CONSTRAINT "AltazorMemorySupport_spaceId_nodeId_fkey" FOREIGN KEY ("spaceId", "nodeId") REFERENCES "AltazorMemoryNode"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorMemorySupport" ADD CONSTRAINT "AltazorMemorySupport_spaceId_edgeId_fkey" FOREIGN KEY ("spaceId", "edgeId") REFERENCES "AltazorMemoryEdge"("spaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalConnectorAccount" ADD CONSTRAINT "PersonalConnectorAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalOAuthAttempt" ADD CONSTRAINT "PersonalOAuthAttempt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalShareDraft" ADD CONSTRAINT "ExternalShareDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPublicationAttempt" ADD CONSTRAINT "ExternalPublicationAttempt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPublicationAttempt" ADD CONSTRAINT "ExternalPublicationAttempt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PersonalConnectorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalPublicationAttempt" ADD CONSTRAINT "ExternalPublicationAttempt_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ExternalShareDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorAcademicWorkspace" ADD CONSTRAINT "AltazorAcademicWorkspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorAcademicArtifact" ADD CONSTRAINT "AltazorAcademicArtifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "AltazorAcademicWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AltazorAcademicProfile" ADD CONSTRAINT "AltazorAcademicProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep a matter-scoped conversation from silently becoming personal on deletion.
ALTER TABLE "AltazorConversation" ADD CONSTRAINT "AltazorConversation_scope_check"
CHECK (("causaId" IS NULL AND "scopeKey" = 'personal') OR ("causaId" IS NOT NULL AND "scopeKey" = 'causa:' || "causaId"));
CREATE UNIQUE INDEX "AltazorTurn_active_conversation_key" ON "AltazorTurn" ("conversationId") WHERE "status" IN ('queued', 'running');
ALTER TABLE "AltazorMemorySpace" ADD CONSTRAINT "AltazorMemorySpace_scope_check"
CHECK ("scopeKey" = CASE WHEN "causaId" IS NULL THEN 'personal' ELSE 'causa:' || "causaId" END);
ALTER TABLE "AltazorMemorySupport" ADD CONSTRAINT "AltazorMemorySupport_one_target_check"
CHECK (num_nonnulls("nodeId", "edgeId") = 1);
ALTER TABLE "AltazorAttachment" ADD CONSTRAINT "AltazorAttachment_size_check"
CHECK ("byteSize" > 0 AND "byteSize" <= 26214400 AND ("originalData" IS NULL OR octet_length("originalData") = "byteSize"));
