import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../testing/disposable-db";
const db=new PrismaClient({datasources:{db:{url:assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL)}}});
async function statements(tx:Prisma.TransactionClient,path:string) {
 const sql=(await readFile(path,'utf8')).replace(/^\s*--.*$/gm,'');
 for(const s of sql.split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(s);
}
async function main() {
 const schema=`fixture_${randomUUID().replaceAll('-','')}`;
 try {
  await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
   await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
   await tx.$executeRawUnsafe('CREATE TABLE "CausaMovimiento" (id TEXT PRIMARY KEY,"causaId" TEXT,"externalId" TEXT,"createdAt" TIMESTAMP,detalle TEXT,"documentoRef" TEXT,relevante BOOLEAN)');
   await tx.$executeRawUnsafe('CREATE TABLE "PjudSyncJob" (id TEXT PRIMARY KEY,"causaId" TEXT,"createdAt" TIMESTAMP,status TEXT,"lastError" TEXT)');
   await tx.$executeRawUnsafe(`INSERT INTO "CausaMovimiento" VALUES ('old','case','x','2026-01-01','old detail',NULL,false),('new','case','x','2026-02-01','different detail','document-b',true),('unique','other','x','2026-01-01','independent',NULL,false)`);
   await tx.$executeRawUnsafe(`INSERT INTO "PjudSyncJob" VALUES ('pending','case','2026-01-01','pending',NULL),('running','case','2026-02-01','running','trace')`);
   await statements(tx,'prisma/migrations/20261031000000_preserve_pjud_duplicates/migration.sql');
   await statements(tx,'prisma/migrations/20261031010000_pjud_b3_b4_uniques/migration.sql');
   const archive=await tx.$queryRawUnsafe<{sourceId:string;snapshotJson:{detalle?:string;documentoRef?:string;status?:string;lastError?:string}}[]>('SELECT "sourceId","snapshotJson" FROM "PjudMigrationArchive"');
   assert.equal(archive.length,4);
   assert.equal(archive.find(a=>a.sourceId==='new')?.snapshotJson.documentoRef,'document-b');
   assert.equal(archive.find(a=>a.sourceId==='running')?.snapshotJson.lastError,'trace');
   const moves=await tx.$queryRawUnsafe<{id:string}[]>('SELECT id FROM "CausaMovimiento"');assert.equal(moves.length,2);assert.ok(moves.some(m=>m.id==='unique'));
   const jobs=await tx.$queryRawUnsafe<{id:string}[]>('SELECT id FROM "PjudSyncJob"');assert.equal(jobs.length,1);
   await tx.$executeRawUnsafe('CREATE TABLE "Causa" (id TEXT PRIMARY KEY,titulo TEXT)');
   await tx.$executeRawUnsafe(`INSERT INTO "Causa" VALUES ('case','Expediente ficticio conservado')`);
   await statements(tx,'prisma/migrations/20261103233000_pjud_cuadernos_coverage/migration.sql');
   const migratedCauses=await tx.$queryRawUnsafe<{id:string;titulo:string;pjudCuadernosCoverage:unknown}[]>('SELECT * FROM "Causa"');
   assert.equal(migratedCauses.length,1);
   assert.equal(migratedCauses[0].titulo,'Expediente ficticio conservado');
   assert.equal(migratedCauses[0].pjudCuadernosCoverage,null,'old causes must not be labelled as fully read');
   const migratedJobs=await tx.$queryRawUnsafe<{id:string;pjudCuadernosCoverage:unknown}[]>('SELECT * FROM "PjudSyncJob"');
   assert.equal(migratedJobs.length,jobs.length);
   assert.equal(migratedJobs[0].id,jobs[0].id);
   assert.equal(migratedJobs[0].pjudCuadernosCoverage,null,'old jobs retain unknown coverage');
   assert.equal((await tx.$queryRawUnsafe<{id:string}[]>('SELECT id FROM "CausaMovimiento"')).length,moves.length);
   await tx.$executeRawUnsafe(`ALTER TABLE "Causa" ADD "pjudLastSyncAt" timestamp, ADD "pjudLastSyncStatus" text, ADD "pjudLastSyncNote" text, ADD "pjudFailCount" int DEFAULT 0, ADD "pjudMonitoreoActivo" boolean DEFAULT true`);
   await tx.$executeRawUnsafe(`ALTER TABLE "PjudSyncJob" ADD trigger text, ADD "finishedAt" timestamp`);
   await tx.$executeRawUnsafe(`INSERT INTO "Causa" (id,"pjudLastSyncAt","pjudLastSyncStatus","pjudLastSyncNote") VALUES
     ('csv','2026-11-01','ok','Import CSV: 1 nuevos, 0 repetidos.'),
     ('expired','2026-11-01','ok','Consulta anterior'), ('later','2026-11-03','ok','Consulta posterior')`);
   await tx.$executeRawUnsafe(`INSERT INTO "PjudSyncJob" (id,"causaId","createdAt","finishedAt",status,trigger) VALUES
     ('expired-job','expired','2026-11-02','2026-11-02 00:01','failed','manual-session'),
     ('superseded-job','later','2026-11-02','2026-11-02 00:01','failed','manual-session')`);
   await statements(tx, 'prisma/migrations/20261119040000_pjud_last_attempt/migration.sql');
   const repaired = await tx.$queryRawUnsafe<{ id:string; status:string; at:Date|null }[]>(`SELECT id, "pjudLastSyncStatus" AS status, "pjudLastSyncAt" AS at FROM "Causa" WHERE id <> 'case' ORDER BY id`);
   assert.deepEqual(repaired.map(row => [row.id, row.status, row.at?.toISOString() ?? null]), [
     ['csv', 'unverified', null], ['expired', 'failed', '2026-11-02T00:01:00.000Z'], ['later', 'ok', '2026-11-03T00:00:00.000Z'],
   ]);
   console.log('PJUD preservation OK: divergent movements and pending/running job snapshots survive historical dedupe');
  },{timeout:30_000});
 } finally {await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
