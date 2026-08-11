-- Provider IDs must be unique per cause; manual records keep NULL externalId.
CREATE UNIQUE INDEX IF NOT EXISTS "CausaMovimiento_causaId_externalId_key"
ON "CausaMovimiento"("causaId", "externalId")
WHERE "externalId" IS NOT NULL;
