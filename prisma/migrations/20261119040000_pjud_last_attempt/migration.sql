-- A CSV was previously counted as an official check. Keep its movements and job receipt.
UPDATE "Causa"
SET "pjudLastSyncStatus" = 'unverified',
    "pjudLastSyncAt" = NULL,
    "pjudCuadernosCoverage" = NULL,
    "pjudLastSyncNote" = 'Solo consta una importación CSV. Vuelva a consultar el PJUD para comprobar las novedades.'
WHERE "pjudLastSyncStatus" = 'ok' AND "pjudLastSyncNote" ~ '^Import CSV: [0-9]+ nuevos, [0-9]+ repetidos[.]$';

-- Old webhook deliveries did not provide notebook coverage, even if a previous attempt did.
UPDATE "Causa"
SET "pjudCuadernosCoverage" = NULL
WHERE "pjudLastSyncNote" LIKE 'Webhook PJUD%' AND "pjudCuadernosCoverage" IS NOT NULL;

-- Interrupted reservations used to leave the previous successful status on the case.
WITH last_failure AS (
  SELECT DISTINCT ON ("causaId") "causaId", "createdAt", "finishedAt"
  FROM "PjudSyncJob"
  WHERE status = 'failed' AND trigger = 'manual-session' AND "finishedAt" IS NOT NULL
  ORDER BY "causaId", "createdAt" DESC, id DESC
)
UPDATE "Causa" c
SET "pjudLastSyncStatus" = 'failed', "pjudLastSyncAt" = f."finishedAt",
    "pjudLastSyncNote" = 'La consulta judicial de esta sesión no se completó. Inicie sesión para reintentar.',
    "pjudCuadernosCoverage" = NULL, "pjudFailCount" = GREATEST(c."pjudFailCount", 1)
FROM last_failure f
WHERE c.id = f."causaId" AND c."pjudMonitoreoActivo" AND c."pjudLastSyncStatus" = 'ok'
  AND c."pjudLastSyncAt" <= f."createdAt";
