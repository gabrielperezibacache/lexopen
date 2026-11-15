-- Scoped chronological receipt reads across the owner's historical desktop sessions.
CREATE INDEX "AltazorComputerAction_ownerId_kind_status_createdAt_id_idx"
ON "AltazorComputerAction"("ownerId", "kind", "status", "createdAt", "id");
