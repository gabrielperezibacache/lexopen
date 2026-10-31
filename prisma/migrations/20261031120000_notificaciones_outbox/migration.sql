-- LexOpen 1.1 — notificaciones: canales, preferencias, outbox, cola Job, hitos de plazo (solo aditiva).
-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "ackAt" TIMESTAMP(3),
ADD COLUMN     "ackVia" TEXT,
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "severidad" TEXT NOT NULL DEFAULT 'media',
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'general';

-- CreateTable
CREATE TABLE "CanalUsuario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "destinoEnc" TEXT NOT NULL DEFAULT '',
    "destinoHash" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "nivelDetalle" TEXT NOT NULL DEFAULT 'minimo',
    "etiqueta" TEXT,
    "codigoHash" TEXT,
    "codigoExpiraAt" TIMESTAMP(3),
    "verificadoAt" TIMESTAMP(3),
    "ultimoUsoAt" TIMESTAMP(3),
    "ultimoErrorAt" TIMESTAMP(3),
    "ultimoError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanalUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreferenciaNotificacion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "modo" TEXT NOT NULL DEFAULT 'realtime',

    CONSTRAINT "PreferenciaNotificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilNotificacion" (
    "userId" TEXT NOT NULL,
    "quietDesde" TEXT NOT NULL DEFAULT '21:00',
    "quietHasta" TEXT NOT NULL DEFAULT '08:00',
    "quietFinesSemana" BOOLEAN NOT NULL DEFAULT true,
    "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Santiago',
    "nivelEmail" TEXT NOT NULL DEFAULT 'estandar',
    "silenciadoHasta" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilNotificacion_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MensajeSaliente" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "userId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "canalUsuarioId" TEXT,
    "plantilla" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "nivelDetalle" TEXT NOT NULL DEFAULT 'minimo',
    "dedupeKey" TEXT NOT NULL,
    "prioridad" INTEGER NOT NULL DEFAULT 5,
    "estado" TEXT NOT NULL DEFAULT 'encolado',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntentoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "proveedor" TEXT,
    "proveedorMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoAt" TIMESTAMP(3),

    CONSTRAINT "MensajeSaliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoEntrega" (
    "id" TEXT NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "detalle" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "maxIntentos" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "dedupeKey" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlazoAlerta" (
    "id" TEXT NOT NULL,
    "plazoId" TEXT NOT NULL,
    "hito" TEXT NOT NULL,
    "generadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ackAt" TIMESTAMP(3),
    "ackById" TEXT,
    "ackVia" TEXT,

    CONSTRAINT "PlazoAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanalUsuario_userId_canal_idx" ON "CanalUsuario"("userId", "canal");

-- CreateIndex
CREATE INDEX "CanalUsuario_codigoHash_idx" ON "CanalUsuario"("codigoHash");

-- CreateIndex
CREATE UNIQUE INDEX "CanalUsuario_canal_destinoHash_key" ON "CanalUsuario"("canal", "destinoHash");

-- CreateIndex
CREATE UNIQUE INDEX "PreferenciaNotificacion_userId_tipo_canal_key" ON "PreferenciaNotificacion"("userId", "tipo", "canal");

-- CreateIndex
CREATE UNIQUE INDEX "MensajeSaliente_dedupeKey_key" ON "MensajeSaliente"("dedupeKey");

-- CreateIndex
CREATE INDEX "MensajeSaliente_estado_proximoIntentoAt_prioridad_idx" ON "MensajeSaliente"("estado", "proximoIntentoAt", "prioridad");

-- CreateIndex
CREATE INDEX "MensajeSaliente_userId_createdAt_idx" ON "MensajeSaliente"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MensajeSaliente_notificationId_idx" ON "MensajeSaliente"("notificationId");

-- CreateIndex
CREATE INDEX "EventoEntrega_mensajeId_at_idx" ON "EventoEntrega"("mensajeId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_estado_runAt_idx" ON "Job"("estado", "runAt");

-- CreateIndex
CREATE INDEX "PlazoAlerta_hito_ackAt_idx" ON "PlazoAlerta"("hito", "ackAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlazoAlerta_plazoId_hito_key" ON "PlazoAlerta"("plazoId", "hito");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "CanalUsuario" ADD CONSTRAINT "CanalUsuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreferenciaNotificacion" ADD CONSTRAINT "PreferenciaNotificacion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilNotificacion" ADD CONSTRAINT "PerfilNotificacion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoEntrega" ADD CONSTRAINT "EventoEntrega_mensajeId_fkey" FOREIGN KEY ("mensajeId") REFERENCES "MensajeSaliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlazoAlerta" ADD CONSTRAINT "PlazoAlerta_plazoId_fkey" FOREIGN KEY ("plazoId") REFERENCES "Plazo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

