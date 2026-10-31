-- B3: dedupe movimientos con mismo (causaId, externalId) — conservar el más antiguo.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "causaId", "externalId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "CausaMovimiento"
  WHERE "externalId" IS NOT NULL
)
DELETE FROM "CausaMovimiento"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Sustituir índice parcial previo por unique completo (NULL externo sigue permitido N veces en PG).
-- Quitar índice legado solo-externalId (20260725180000); el unique compuesto lo cubre.
DROP INDEX IF EXISTS "CausaMovimiento_externalId_idx";
DROP INDEX IF EXISTS "CausaMovimiento_causaId_externalId_key";
CREATE UNIQUE INDEX "CausaMovimiento_causaId_externalId_key"
  ON "CausaMovimiento"("causaId", "externalId");

-- B4: un solo job pending|running por causa (índice parcial).
WITH ranked_jobs AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "causaId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "PjudSyncJob"
  WHERE status IN ('pending', 'running')
)
DELETE FROM "PjudSyncJob"
WHERE id IN (SELECT id FROM ranked_jobs WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "PjudSyncJob_causaId_active_uidx"
  ON "PjudSyncJob"("causaId")
  WHERE status IN ('pending', 'running');
