-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'reunion',
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3),
    "todoElDia" BOOLEAN NOT NULL DEFAULT false,
    "lugar" TEXT,
    "modalidad" TEXT,
    "enlace" TEXT,
    "notas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'programado',
    "tipoAudiencia" TEXT,
    "tribunal" TEXT,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "causaId" TEXT,
    "clienteId" TEXT,
    "responsableId" TEXT NOT NULL,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Evento_inicio_idx" ON "Evento"("inicio");

-- CreateIndex
CREATE INDEX "Evento_tipo_estado_idx" ON "Evento"("tipo", "estado");

-- CreateIndex
CREATE INDEX "Evento_causaId_idx" ON "Evento"("causaId");

-- CreateIndex
CREATE INDEX "Evento_responsableId_idx" ON "Evento"("responsableId");

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
