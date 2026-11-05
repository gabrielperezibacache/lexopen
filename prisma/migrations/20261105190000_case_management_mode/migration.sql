ALTER TABLE "FirmSettings" ADD COLUMN "caseManagementMode" TEXT NOT NULL DEFAULT 'manual';

-- Existing judicial installations keep their working space. New installations remain generic.
UPDATE "FirmSettings"
SET "caseManagementMode" = 'pjud_cl'
WHERE "claveUnicaEnabled" = true
   OR EXISTS (SELECT 1 FROM "Causa" WHERE "pjudMonitoreoActivo" = true);

-- Older self-hosted installations may have causes but no settings row yet.
INSERT INTO "FirmSettings" ("id", "organizationId", "caseManagementMode")
SELECT 'case-mode-' || md5(o."id"), o."id", 'pjud_cl'
FROM "Organization" AS o
WHERE EXISTS (SELECT 1 FROM "Causa" WHERE "pjudMonitoreoActivo" = true)
  AND NOT EXISTS (SELECT 1 FROM "FirmSettings" AS s WHERE s."organizationId" = o."id");

ALTER TABLE "FirmSettings" ADD CONSTRAINT "FirmSettings_caseManagementMode_check"
CHECK ("caseManagementMode" IN ('manual', 'pjud_cl'));
