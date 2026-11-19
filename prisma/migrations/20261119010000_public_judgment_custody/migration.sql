ALTER TABLE "LegalSourceVersion" ADD COLUMN "reviewState" TEXT NOT NULL DEFAULT 'available'
  CHECK ("reviewState" IN ('available', 'quarantined'));

-- Do not read or remove legacy blobs. Old versions and their citations remain bound to their own IDs.
UPDATE "LegalSourceVersion" AS v SET "reviewState" = 'quarantined'
FROM "LegalSource" AS s
WHERE s."id" = v."sourceId"
  AND (s."canonicalUrl" ~* '^https://juris[.]pjud[.]cl([/:]|$)'
       OR v."externalId" LIKE 'PJUD:%' OR s."externalId" LIKE 'PJUD:%');

-- During a rolling upgrade, an older Host can still try to insert an unreviewed PJUD response.
CREATE FUNCTION lexopen_guard_judgment_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."acquisitionMethod" <> 'pjud_public' AND (
    NEW."externalId" LIKE 'PJUD:%' OR EXISTS (
      SELECT 1 FROM "LegalSource" s WHERE s.id = NEW."sourceId"
        AND (s."canonicalUrl" ~* '^https://juris[.]pjud[.]cl([/:]|$)' OR s."externalId" LIKE 'PJUD:%')
    )
  ) THEN
    NEW."reviewState" := 'quarantined';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_judgment_version BEFORE INSERT OR UPDATE OF "sourceId", "acquisitionMethod", "reviewState"
ON "LegalSourceVersion" FOR EACH ROW EXECUTE FUNCTION lexopen_guard_judgment_version();
