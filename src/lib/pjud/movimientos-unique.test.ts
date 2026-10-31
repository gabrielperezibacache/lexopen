import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const schema = readFileSync(
  path.join(process.cwd(), "prisma/schema.prisma"),
  "utf8"
);
assert.match(
  schema,
  /model CausaMovimiento[\s\S]*@@unique\(\[causaId, externalId\]\)/,
  "schema must declare @@unique([causaId, externalId]) for skipDuplicates"
);

const migration = readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20261031010000_pjud_b3_b4_uniques/migration.sql"
  ),
  "utf8"
);
assert.match(migration, /CausaMovimiento_causaId_externalId_key/);
assert.match(migration, /PjudSyncJob_causaId_active_uidx/);
assert.match(migration, /WHERE status IN \('pending', 'running'\)/);
assert.match(migration, /DELETE FROM "CausaMovimiento"/);

console.log("pjud/movimientos-unique.test.ts OK");
