-- Wiki revision lookup by page
CREATE INDEX IF NOT EXISTS "WikiPageRevision_pageId_idx" ON "WikiPageRevision"("pageId");

-- Blog slug unique per site (dedupe empty slugs first if needed)
UPDATE "BlogPost" AS bp
SET "slug" = CONCAT('post-', bp."id")
WHERE bp."slug" = ''
   OR EXISTS (
     SELECT 1 FROM "BlogPost" other
     WHERE other."siteId" = bp."siteId"
       AND other."slug" = bp."slug"
       AND other."id" < bp."id"
   );

CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_siteId_slug_key" ON "BlogPost"("siteId", "slug");
