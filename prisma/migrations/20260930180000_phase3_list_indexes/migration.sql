-- Phase 3: indexes for dashboard/list hot paths
CREATE INDEX IF NOT EXISTS "Causa_updatedAt_idx" ON "Causa"("updatedAt");
CREATE INDEX IF NOT EXISTS "Causa_abogadoId_idx" ON "Causa"("abogadoId");
CREATE INDEX IF NOT EXISTS "Causa_clienteId_idx" ON "Causa"("clienteId");

CREATE INDEX IF NOT EXISTS "Documento_updatedAt_idx" ON "Documento"("updatedAt");

CREATE INDEX IF NOT EXISTS "Plazo_estado_fechaLimite_idx" ON "Plazo"("estado", "fechaLimite");
CREATE INDEX IF NOT EXISTS "Plazo_responsableId_fechaLimite_idx" ON "Plazo"("responsableId", "fechaLimite");

CREATE INDEX IF NOT EXISTS "Evento_responsableId_inicio_idx" ON "Evento"("responsableId", "inicio");

CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_entityType_createdAt_idx" ON "AuditEvent"("entityType", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_action_idx" ON "AuditEvent"("action");

CREATE INDEX IF NOT EXISTS "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX IF NOT EXISTS "Task_siteId_idx" ON "Task"("siteId");
CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");
CREATE INDEX IF NOT EXISTS "Task_dueDate_idx" ON "Task"("dueDate");

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read");

CREATE INDEX IF NOT EXISTS "Activity_createdAt_idx" ON "Activity"("createdAt");
CREATE INDEX IF NOT EXISTS "Activity_userId_createdAt_idx" ON "Activity"("userId", "createdAt");
