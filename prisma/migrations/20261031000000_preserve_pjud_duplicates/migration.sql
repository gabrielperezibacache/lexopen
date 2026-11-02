-- Deliberately precedes the immutable 20261031010000 dedupe migration.
-- Existing installations that already applied the dedupe get the archive table;
-- discarded historical data can only be recovered from their earlier backups.
CREATE TABLE "PjudMigrationArchive" (
  "id" TEXT NOT NULL, "sourceTable" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
  "survivorId" TEXT NOT NULL, "snapshotJson" JSONB NOT NULL, "reason" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PjudMigrationArchive_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PjudMigrationArchive_sourceTable_sourceId_key" ON "PjudMigrationArchive"("sourceTable", "sourceId");
WITH duplicates AS (
  SELECT *, count(*) OVER (PARTITION BY "causaId", "externalId") AS duplicate_count,
    first_value(id) OVER (PARTITION BY "causaId", "externalId" ORDER BY "createdAt", id) AS survivor_id
  FROM "CausaMovimiento" WHERE "externalId" IS NOT NULL
)
INSERT INTO "PjudMigrationArchive" (id,"sourceTable","sourceId","survivorId","snapshotJson",reason)
SELECT 'movimiento:' || d.id, 'CausaMovimiento', d.id, d.survivor_id,
  to_jsonb(d) - 'duplicate_count' - 'survivor_id', 'before_20261031010000_dedupe'
FROM duplicates d WHERE duplicate_count > 1;
WITH duplicates AS (
  SELECT *, count(*) OVER (PARTITION BY "causaId") AS duplicate_count,
    first_value(id) OVER (PARTITION BY "causaId" ORDER BY "createdAt", id) AS survivor_id
  FROM "PjudSyncJob" WHERE status IN ('pending', 'running')
)
INSERT INTO "PjudMigrationArchive" (id,"sourceTable","sourceId","survivorId","snapshotJson",reason)
SELECT 'job:' || d.id, 'PjudSyncJob', d.id, d.survivor_id,
  to_jsonb(d) - 'duplicate_count' - 'survivor_id', 'before_20261031010000_dedupe'
FROM duplicates d WHERE duplicate_count > 1;
