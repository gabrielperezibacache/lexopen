-- Preserve historical causes, movements and jobs; old coverage stays unknown.
ALTER TABLE "Causa" ADD COLUMN "pjudCuadernosCoverage" JSONB;
ALTER TABLE "PjudSyncJob" ADD COLUMN "pjudCuadernosCoverage" JSONB;
