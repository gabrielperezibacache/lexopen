/** Explicit disposable PostgreSQL. Fictitious providers only; no OJV or user credentials. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { getCaseManagementMode, updateCaseManagementMode } from "./management-mode";
import { previewRolLookup } from "@/lib/pjud/lookup";
import { enqueueDueSyncJobs, processPendingSyncJobs, runDueSyncPipeline } from "@/lib/pjud/queue";
import { processPendingPjudDocumentJobs } from "@/lib/pjud/document-queue";
import { pjudDocumentRefHash } from "@/lib/pjud/document-identity";

const status = (value: number) => (error: unknown) => (error as { status?: number }).status === value;
async function migration(tx: Prisma.TransactionClient) {
  const sql = (await readFile("prisma/migrations/20261105190000_case_management_mode/migration.sql", "utf8")).replace(/^\s*--.*$/gm, "");
  for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
}
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Requires local fictitious storage");
  const storage = await mkdtemp(path.join(tmpdir(), "lexopen-case-mode-")), priorStorage = process.env.STORAGE_PATH; process.env.STORAGE_PATH = storage;
  const db = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), users: string[] = [], schemas: string[] = [];
  let orgId = "", causeId = "", providerCalls = 0, downloads = 0, network = 0;
  const originalFetch = globalThis.fetch;
  const priorDownloads = process.env.PJUD_DOC_DOWNLOADS, priorBackup = process.env.PJUD_PDF_BACKUP;
  process.env.PJUD_DOC_DOWNLOADS = "1"; process.env.PJUD_PDF_BACKUP = "0";
  globalThis.fetch = (async () => { network++; throw Error("No external network allowed in fixture"); }) as typeof fetch;
  try {
    assert.equal(await db.organization.count(), 0, "fresh organization scope required");
    assert.equal(await getCaseManagementMode(db), "manual", "new applications are generic and never enable PJUD from case flags");
    const admin = await db.user.create({ data: { email: `${tag}@mode.invalid`, name: "Administración ficticia", password: "not-a-login", role: "admin" } }); users.push(admin.id);
    const owner = await db.user.create({ data: { email: `${tag}-owner@mode.invalid`, name: "Profesional ficticio", password: "not-a-login", role: "abogado" } }); users.push(owner.id);
    const partner = await db.user.create({ data: { email: `${tag}-partner@mode.invalid`, name: "Socio ficticio", password: "not-a-login", role: "socio", capabilityGrants: "host.admin" } }); users.push(partner.id);
    await assert.rejects(updateCaseManagementMode("pjud_cl", owner, db), status(403));
    await assert.rejects(updateCaseManagementMode("pjud_cl", partner, db), status(403));
    await assert.rejects(previewRolLookup({ rit: "C-23-2026", tribunal: "Tribunal ficticio" }), status(409));
    assert.equal(network, 0);
    await updateCaseManagementMode("pjud_cl", admin, db); orgId = (await db.organization.findFirstOrThrow()).id;
    assert.equal(await getCaseManagementMode(db), "pjud_cl");
    await db.firmSettings.update({ where: { organizationId: orgId }, data: { claveUnicaEnabled: true, claveUnicaPasswordEnc: "fictitious-encrypted-value-not-a-credential" } });
    const cause = await db.causa.create({ data: { titulo: "Expediente conservado", tribunal: "Tribunal ficticio", materia: "civil", rit: "C-23-2026", acceso: "equipo", abogadoId: owner.id, pjudMonitoreoActivo: true, pjudDocumentDownloadsEnabled: true, pjudDocumentDownloadOwnerId: owner.id } }); causeId = cause.id;
    const original = await db.documento.create({ data: { nombre: "Original conservado.txt", causaId: cause.id, autorId: owner.id, contenido: "No borrar al cambiar de modalidad" } });
    const job = await db.pjudSyncJob.create({ data: { causaId: cause.id, trigger: "cron" } });
    const movement = await db.causaMovimiento.create({ data: { causaId: cause.id, titulo: "Resolución ficticia", documentoRef: "https://oficinajudicialvirtual.pjud.cl/fictitious-mode.pdf" } });
    const receipt = await db.pjudDocumentJob.create({ data: { causaId: cause.id, movimientoId: movement.id, actorId: owner.id, sourceRefHash: pjudDocumentRefHash(cause.id, movement.id, movement.documentoRef!) } });
    await updateCaseManagementMode("manual", admin, db);
    assert.equal(await getCaseManagementMode(db), "manual");
    assert.equal((await db.pjudSyncJob.findUniqueOrThrow({ where: { id: job.id } })).status, "paused");
    assert.equal((await db.pjudDocumentJob.findUniqueOrThrow({ where: { id: receipt.id } })).status, "paused");
    assert.equal((await db.causa.findUniqueOrThrow({ where: { id: cause.id } })).pjudMonitoreoActivo, true, "the per-case preference is retained");
    assert.equal((await db.firmSettings.findUniqueOrThrow({ where: { organizationId: orgId } })).claveUnicaPasswordEnc, "fictitious-encrypted-value-not-a-credential");
    assert.equal((await db.documento.findUniqueOrThrow({ where: { id: original.id } })).contenido, "No borrar al cambiar de modalidad");
    assert.deepEqual(await enqueueDueSyncJobs({ causaIds: [cause.id] }), []);
    assert.deepEqual(await runDueSyncPipeline({ causaIds: [cause.id] }), { enqueued: 0, synced: 0, results: [] });
    const provider = async () => { providerCalls++; return { provider: "scrape" as const, demo: false, note: "Proveedor sintético", movimientos: [] }; };
    assert.deepEqual(await processPendingSyncJobs({ actorId: owner.id, jobIds: [job.id], fetchMovimientos: provider }), []);
    const download = (async () => { downloads++; return new Response(Buffer.from("%PDF-1.4\n" + "Fictitious test bytes. ".repeat(20)), { headers: { "Content-Type": "application/pdf" } }); }) as typeof import("@/lib/net/safe-url").fetchSafeOutbound;
    assert.deepEqual(await processPendingPjudDocumentJobs({ causaId: cause.id, fetch: download }), []);
    assert.equal(providerCalls, 0); assert.equal(downloads, 0); assert.equal(network, 0);
    await updateCaseManagementMode("pjud_cl", admin, db);
    assert.equal((await db.pjudSyncJob.findUniqueOrThrow({ where: { id: job.id } })).status, "pending");
    assert.equal((await db.pjudDocumentJob.findUniqueOrThrow({ where: { id: receipt.id } })).status, "pending");
    // Switching modes while a provider is in flight must preserve the pause and prevent commit.
    const stopped = await processPendingSyncJobs({ actorId: owner.id, jobIds: [job.id], fetchMovimientos: async () => { providerCalls++; await updateCaseManagementMode("manual", admin, db); return { provider: "scrape", demo: false, note: "Proveedor sintético detenido", movimientos: [] }; } });
    assert.deepEqual(stopped, []); assert.equal((await db.pjudSyncJob.findUniqueOrThrow({ where: { id: job.id } })).status, "paused");
    assert.equal((await db.causa.findUniqueOrThrow({ where: { id: cause.id } })).pjudFailCount, 0);
    await updateCaseManagementMode("pjud_cl", admin, db);
    assert.equal((await processPendingSyncJobs({ actorId: owner.id, jobIds: [job.id], fetchMovimientos: provider })).length, 1);
    await processPendingPjudDocumentJobs({ causaId: cause.id, fetch: download, enqueue: () => true });
    assert.equal(downloads, 1); assert.equal((await db.pjudDocumentJob.findUniqueOrThrow({ where: { id: receipt.id } })).status, "saved");
    await updateCaseManagementMode("manual", admin, db);
    assert.equal((await db.pjudDocumentJob.findUniqueOrThrow({ where: { id: receipt.id } })).status, "saved", "saved originals and tombstones are never paused or recreated");
    assert.ok(await db.documento.findUnique({ where: { id: original.id } }));
    assert.ok(await db.auditEvent.count({ where: { actorId: admin.id, action: "settings.case-management" } }));
    for (const scenario of ["fresh", "enabled", "monitored", "missing_settings"]) {
      const schema = `case_mode_${tag.replaceAll("-", "")}_${scenario}`; schemas.push(schema);
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe('CREATE TABLE "Organization" (id TEXT PRIMARY KEY)');
        await tx.$executeRawUnsafe('CREATE TABLE "FirmSettings" (id TEXT PRIMARY KEY,"organizationId" TEXT UNIQUE,"claveUnicaEnabled" BOOLEAN DEFAULT false,"secret" TEXT)');
        await tx.$executeRawUnsafe('CREATE TABLE "Causa" (id TEXT PRIMARY KEY,"pjudMonitoreoActivo" BOOLEAN DEFAULT false)');
        await tx.$executeRawUnsafe(`INSERT INTO "Organization" VALUES ('org')`);
        if (scenario !== "missing_settings") await tx.$executeRawUnsafe(`INSERT INTO "FirmSettings" VALUES ('settings','org',${scenario === "enabled"},'preserved-fictitious-value')`);
        if (["monitored", "missing_settings"].includes(scenario)) await tx.$executeRawUnsafe(`INSERT INTO "Causa" VALUES ('case',true)`);
        await migration(tx);
        const rows = await tx.$queryRawUnsafe<{ caseManagementMode: string; secret: string | null }[]>('SELECT "caseManagementMode","secret" FROM "FirmSettings"');
        assert.equal(rows.length, 1); assert.equal(rows[0].caseManagementMode, scenario === "fresh" ? "manual" : "pjud_cl");
        if (scenario !== "missing_settings") assert.equal(rows[0].secret, "preserved-fictitious-value");
      });
    }
    assert.equal(network, 0);
    console.log("Case management modes passed: generic default, admin-only changes, pause/resume without deleting preferences/originals, zero provider calls while manual, in-flight mode revocation, saved receipt preservation, and real migration of active legacy installations; fictitious providers only.");
  } finally {
    globalThis.fetch = originalFetch;
    if (priorDownloads === undefined) delete process.env.PJUD_DOC_DOWNLOADS; else process.env.PJUD_DOC_DOWNLOADS = priorDownloads;
    if (priorBackup === undefined) delete process.env.PJUD_PDF_BACKUP; else process.env.PJUD_PDF_BACKUP = priorBackup;
    if (causeId) { await db.pjudDocumentJob.deleteMany({ where: { causaId: causeId } }); await db.documento.deleteMany({ where: { causaId: causeId } }); await db.causa.deleteMany({ where: { id: causeId } }); }
    if (orgId) await db.organization.deleteMany({ where: { id: orgId } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } });
    for (const schema of schemas) await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect(); if (priorStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = priorStorage; await rm(storage, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
