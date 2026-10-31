-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "causaId" TEXT,
ADD COLUMN     "clienteId" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "eventoId" TEXT,
ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "plazoId" TEXT,
ADD COLUMN     "remindAt" TIMESTAMP(3),
ADD COLUMN     "rrule" TEXT,
ADD COLUMN     "tramiteId" TEXT,
ADD COLUMN     "waitingOn" TEXT;

-- CreateTable
CREATE TABLE "TaskHistorial" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "antes" TEXT,
    "despues" TEXT,
    "nota" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskHistorial_taskId_createdAt_idx" ON "TaskHistorial"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_tramiteId_key" ON "Task"("tramiteId");

-- CreateIndex
CREATE INDEX "Task_causaId_idx" ON "Task"("causaId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_dueDate_idx" ON "Task"("assigneeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_origen_idx" ON "Task"("origen");

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_plazoId_fkey" FOREIGN KEY ("plazoId") REFERENCES "Plazo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tramiteId_fkey" FOREIGN KEY ("tramiteId") REFERENCES "Tramite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHistorial" ADD CONSTRAINT "TaskHistorial_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHistorial" ADD CONSTRAINT "TaskHistorial_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (idempotente) -------------------------------------------------

-- Tareas de espacios vinculados a una causa heredan la causa.
UPDATE "Task" t
SET "causaId" = s."causaId"
FROM "Site" s
WHERE t."siteId" = s."id" AND s."causaId" IS NOT NULL AND t."causaId" IS NULL;

-- Tareas ya enlazadas desde una acción de minuta.
UPDATE "Task" t
SET "origen" = 'minuta',
    "causaId" = COALESCE(t."causaId", m."causaId"),
    "plazoId" = COALESCE(t."plazoId", ma."plazoId")
FROM "MinutaAccion" ma
JOIN "Minuta" m ON m."id" = ma."minutaId"
WHERE ma."taskId" = t."id" AND t."origen" = 'manual';

-- Espejo Task para cada acción de minuta sin tarea.
INSERT INTO "Task" ("id", "title", "status", "priority", "dueDate", "createdAt", "updatedAt",
  "origen", "causaId", "plazoId", "assigneeId", "completedAt")
SELECT 'ma_' || ma."id",
  LEFT(ma."descripcion", 300),
  CASE ma."estado" WHEN 'en_curso' THEN 'in_progress' WHEN 'hecha' THEN 'done'
    WHEN 'cancelada' THEN 'cancelled' ELSE 'todo' END,
  CASE ma."prioridad" WHEN 'baja' THEN 'low' WHEN 'alta' THEN 'high'
    WHEN 'urgente' THEN 'urgent' ELSE 'medium' END,
  ma."fechaLimite", ma."createdAt", ma."updatedAt",
  'minuta', m."causaId", ma."plazoId", ma."responsableId",
  CASE WHEN ma."estado" = 'hecha' THEN ma."updatedAt" ELSE NULL END
FROM "MinutaAccion" ma
JOIN "Minuta" m ON m."id" = ma."minutaId"
WHERE ma."taskId" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "MinutaAccion" SET "taskId" = 'ma_' || "id"
WHERE "taskId" IS NULL AND EXISTS (SELECT 1 FROM "Task" t WHERE t."id" = 'ma_' || "MinutaAccion"."id");

-- Espejo Task para cada trámite (checklist de causa).
INSERT INTO "Task" ("id", "title", "description", "status", "priority", "dueDate", "createdAt", "updatedAt",
  "origen", "causaId", "clienteId", "assigneeId", "tramiteId", "completedAt")
SELECT 'tr_' || tr."id",
  LEFT(tr."titulo", 300), tr."detalle",
  CASE tr."estado" WHEN 'en_curso' THEN 'in_progress' WHEN 'hecho' THEN 'done'
    WHEN 'cancelado' THEN 'cancelled' ELSE 'todo' END,
  'medium', tr."fechaLimite", tr."createdAt", tr."updatedAt",
  'tramite', tr."causaId", c."clienteId", tr."responsableId", tr."id", tr."fechaHecho"
FROM "Tramite" tr
JOIN "Causa" c ON c."id" = tr."causaId"
WHERE NOT EXISTS (SELECT 1 FROM "Task" t WHERE t."tramiteId" = tr."id")
ON CONFLICT ("id") DO NOTHING;

UPDATE "Task" SET "completedAt" = "updatedAt"
WHERE "status" = 'done' AND "completedAt" IS NULL;
