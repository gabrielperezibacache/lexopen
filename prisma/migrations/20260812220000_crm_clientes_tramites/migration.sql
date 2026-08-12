-- Cliente CRM fields
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "estado" TEXT NOT NULL DEFAULT 'activo';
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "notas" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "abogadoId" TEXT;

CREATE INDEX IF NOT EXISTS "Cliente_razonSocial_idx" ON "Cliente"("razonSocial");
CREATE INDEX IF NOT EXISTS "Cliente_rut_idx" ON "Cliente"("rut");
CREATE INDEX IF NOT EXISTS "Cliente_estado_idx" ON "Cliente"("estado");

DO $$ BEGIN
  ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_abogadoId_fkey"
    FOREIGN KEY ("abogadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tramite checklist
CREATE TABLE IF NOT EXISTS "Tramite" (
  "id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "detalle" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'pendiente',
  "fechaLimite" TIMESTAMP(3),
  "fechaHecho" TIMESTAMP(3),
  "orden" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "causaId" TEXT NOT NULL,
  "responsableId" TEXT,
  CONSTRAINT "Tramite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Tramite_causaId_estado_idx" ON "Tramite"("causaId", "estado");
CREATE INDEX IF NOT EXISTS "Tramite_fechaLimite_idx" ON "Tramite"("fechaLimite");

DO $$ BEGIN
  ALTER TABLE "Tramite" ADD CONSTRAINT "Tramite_causaId_fkey"
    FOREIGN KEY ("causaId") REFERENCES "Causa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Tramite" ADD CONSTRAINT "Tramite_responsableId_fkey"
    FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Documento.clienteId
ALTER TABLE "Documento" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;
CREATE INDEX IF NOT EXISTS "Documento_clienteId_idx" ON "Documento"("clienteId");

DO $$ BEGIN
  ALTER TABLE "Documento" ADD CONSTRAINT "Documento_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AgentChat.clienteId + default title
ALTER TABLE "AgentChat" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;
CREATE INDEX IF NOT EXISTS "AgentChat_clienteId_idx" ON "AgentChat"("clienteId");
CREATE INDEX IF NOT EXISTS "AgentChat_causaId_idx" ON "AgentChat"("causaId");

DO $$ BEGIN
  ALTER TABLE "AgentChat" ADD CONSTRAINT "AgentChat_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AgentChat" ALTER COLUMN "title" SET DEFAULT 'Consulta IA';
