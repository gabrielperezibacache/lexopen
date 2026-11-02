-- AlterTable
ALTER TABLE "Causa" ADD COLUMN     "acceso" TEXT NOT NULL DEFAULT 'estudio';

-- AlterTable
ALTER TABLE "FirmSettings" ADD COLUMN     "require2faPrivileged" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "capabilityGrants" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "capabilityRevokes" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "CausaMiembro" (
    "id" TEXT NOT NULL,
    "causaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'colaborador',
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMP(3),
    "agregadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CausaMiembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegacion" (
    "id" TEXT NOT NULL,
    "delegadorId" TEXT NOT NULL,
    "delegadoId" TEXT NOT NULL,
    "alcance" TEXT NOT NULL DEFAULT 'task.assign',
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMP(3),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delegacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aprobacion" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "solicitanteId" TEXT,
    "aprobadorId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "comentario" TEXT,
    "venceAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltaAt" TIMESTAMP(3),
    "resueltaPorId" TEXT,

    CONSTRAINT "Aprobacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CausaMiembro_userId_idx" ON "CausaMiembro"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CausaMiembro_causaId_userId_key" ON "CausaMiembro"("causaId", "userId");

-- CreateIndex
CREATE INDEX "Delegacion_delegadoId_activa_idx" ON "Delegacion"("delegadoId", "activa");

-- CreateIndex
CREATE INDEX "Delegacion_delegadorId_activa_idx" ON "Delegacion"("delegadorId", "activa");

-- CreateIndex
CREATE INDEX "Aprobacion_aprobadorId_estado_idx" ON "Aprobacion"("aprobadorId", "estado");

-- CreateIndex
CREATE INDEX "Aprobacion_entityType_entityId_idx" ON "Aprobacion"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Aprobacion_estado_createdAt_idx" ON "Aprobacion"("estado", "createdAt");

-- AddForeignKey
ALTER TABLE "CausaMiembro" ADD CONSTRAINT "CausaMiembro_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CausaMiembro" ADD CONSTRAINT "CausaMiembro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CausaMiembro" ADD CONSTRAINT "CausaMiembro_agregadoPorId_fkey" FOREIGN KEY ("agregadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegacion" ADD CONSTRAINT "Delegacion_delegadorId_fkey" FOREIGN KEY ("delegadorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegacion" ADD CONSTRAINT "Delegacion_delegadoId_fkey" FOREIGN KEY ("delegadoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aprobacion" ADD CONSTRAINT "Aprobacion_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aprobacion" ADD CONSTRAINT "Aprobacion_aprobadorId_fkey" FOREIGN KEY ("aprobadorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (idempotente) -------------------------------------------------

-- Admins existentes conservan las capacidades de negocio que tenían en 1.0
-- (separación admin técnico / socio sin pérdida de acceso al actualizar).
UPDATE "User"
SET "capabilityGrants" = 'causa.override_walls,doc.privileged.read,escrito.draft,escrito.approve,time.log,time.approve,billing.rates,ledger.provision,client.message,voice.use'
WHERE "role" = 'admin' AND "capabilityGrants" = '';

-- Equipo de causa: responsable = Causa.abogadoId
INSERT INTO "CausaMiembro" ("id", "causaId", "userId", "rol")
SELECT 'cm_' || md5(c."id" || ':' || c."abogadoId"), c."id", c."abogadoId", 'responsable'
FROM "Causa" c
WHERE c."abogadoId" IS NOT NULL
ON CONFLICT ("causaId", "userId") DO NOTHING;

-- Colaboradores: responsables de plazos y eventos de la causa
INSERT INTO "CausaMiembro" ("id", "causaId", "userId", "rol")
SELECT DISTINCT 'cm_' || md5(p."causaId" || ':' || p."responsableId"), p."causaId", p."responsableId", 'colaborador'
FROM "Plazo" p
WHERE p."causaId" IS NOT NULL AND p."responsableId" IS NOT NULL
ON CONFLICT ("causaId", "userId") DO NOTHING;

INSERT INTO "CausaMiembro" ("id", "causaId", "userId", "rol")
SELECT DISTINCT 'cm_' || md5(e."causaId" || ':' || e."responsableId"), e."causaId", e."responsableId", 'colaborador'
FROM "Evento" e
WHERE e."causaId" IS NOT NULL
ON CONFLICT ("causaId", "userId") DO NOTHING;
