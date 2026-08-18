-- Stable intake origin (not overwritten by last sync provider).
ALTER TABLE "Causa" ADD COLUMN "pjudOrigin" TEXT;

UPDATE "Causa"
SET "pjudOrigin" = 'claveunica'
WHERE "pjudFromMisCausas" = true;

UPDATE "Causa"
SET "pjudOrigin" = 'rol'
WHERE "pjudOrigin" IS NULL
  AND "pjudSource" IN ('rol', 'lookup');

UPDATE "Causa"
SET "pjudOrigin" = 'csv'
WHERE "pjudOrigin" IS NULL
  AND "pjudSource" IN ('csv', 'import');

UPDATE "Causa"
SET "pjudOrigin" = 'webhook'
WHERE "pjudOrigin" IS NULL
  AND "pjudSource" = 'webhook';

UPDATE "Causa"
SET "pjudOrigin" = 'manual'
WHERE "pjudOrigin" IS NULL
  AND (
    "pjudSource" IS NULL
    OR "pjudSource" IN ('none', 'demo', 'api', 'scrape', 'scrape-sidecar', 'manual')
  );
