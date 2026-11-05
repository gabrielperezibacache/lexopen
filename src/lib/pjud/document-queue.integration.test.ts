import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { syncMisCausas } from "./claveunica";
import { enqueuePjudDocumentJobs, processPendingPjudDocumentJobs, pjudDocumentProgress } from "./document-queue";
import { ingestPjudDocumentBuffer, readPjudDocumentResponse } from "./pdf-backup";
import { ManualOjvSessionManager } from "./manual-session-manager";
import type { ManualOjvSession } from "./manual-session";
import { pjudDocumentRefHash } from "./document-identity";
import { scrapeMovimientoIdentity } from "./types";
import { getObject } from "@/lib/storage";

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  assert.ok(!process.env.S3_BUCKET, "isolated local storage only");
  const tag = randomUUID(), causes: string[] = [], users: string[] = [];
  const storage = await mkdtemp(path.join(tmpdir(), "lexopen-pjud-doc-queue-")); process.env.STORAGE_PATH = storage;
  process.env.PJUD_PUBLIC_SCRAPE = "1"; process.env.PJUD_CLAVEUNICA_SCRAPE = "1"; process.env.PJUD_DOC_DOWNLOADS = "1";
  let orgId = "";
  try {
    assert.equal(await prisma.organization.count(), 0, "fresh fixture organization required");
    orgId = (await prisma.organization.create({ data: { name: `Queue fixture ${tag}`, settings: { create: {} } } })).id;
    const owner = await prisma.user.create({ data: { email: `${tag}@queue.invalid`, name: "Fixture owner", role: "abogado", password: "unused" } }); users.push(owner.id);
    const other = await prisma.user.create({ data: { email: `${tag}-other@queue.invalid`, name: "Fixture other", role: "abogado", password: "unused" } }); users.push(other.id);
    const rit = `C-${Date.now() % 800000 + 100000}-2026`, tribunal = "1º Juzgado Civil de Santiago";
    const hidden = await prisma.causa.create({ data: { titulo: "Confidential fixture", materia: "Civil", rit, tribunal, acceso: "equipo", abogadoId: other.id, pjudMonitoreoActivo: false, pjudLastSyncNote: "Do not modify" } }); causes.push(hidden.id);
    const source = { listMisCausas: async () => [{ rit, tribunal }], fetchMovimientos: async () => { throw new Error("Must not read detail"); }, downloadDocuments: true };
    const imported = await syncMisCausas({ actorId: owner.id, sessionSource: source, syncMovimientos: false });
    assert.equal(imported.created, 1); assert.equal(imported.linked, 0); causes.push(imported.items[0].causaId);
    assert.notEqual(imported.items[0].causaId, hidden.id);
    assert.equal((await prisma.causa.findUniqueOrThrow({ where: { id: hidden.id } })).pjudLastSyncNote, "Do not modify");
    const causaId = imported.items[0].causaId;
    await prisma.causa.update({ where: { id: causaId }, data: { pjudMonitoreoActivo: false, pjudNextSyncAt: null } });
    const repeated = await syncMisCausas({ actorId: owner.id, sessionSource: source, syncMovimientos: false });
    assert.equal(repeated.linked, 1);
    const paused = await prisma.causa.findUniqueOrThrow({ where: { id: causaId } });
    assert.equal(paused.pjudMonitoreoActivo, false); assert.equal(paused.pjudNextSyncAt, null, "import must not reactivate a paused cause");
    await prisma.causa.update({ where: { id: causaId }, data: { pjudMonitoreoActivo: true } });
    const movements = await Promise.all([0,1,2].map(index => prisma.causaMovimiento.create({ data: { causaId, titulo: `Synthetic resolution ${index}`, externalId: `fixture-${index}`, documentoRef: `https://oficinajudicialvirtual.pjud.cl/fixture-${index}.pdf?token=PRIVATE`, fecha: new Date(Date.now() + index) } })));
    await enqueuePjudDocumentJobs(causaId, { actorId: owner.id });
    await enqueuePjudDocumentJobs(causaId, { actorId: owner.id });
    assert.equal(await prisma.pjudDocumentJob.count({ where: { causaId } }), 3, "one receipt per judicial row");
    assert.doesNotMatch(JSON.stringify(await prisma.pjudDocumentJob.findMany({ where: { causaId } })), /PRIVATE|https:/, "receipts contain no copied source URLs");
    const bytes = Buffer.from("%PDF-1.4\n%Synthetic fixture only\n" + "x".repeat(300));
    let requests = 0, enqueued = 0;
    const firstJob = await prisma.pjudDocumentJob.findFirstOrThrow({ where: { causaId }, orderBy: [{ nextAttemptAt: "asc" },{ id: "asc" }] });
    const fixtureFetch = async () => { requests++; return requests === 1 ? new Response("", { status: 401 }) : new Response(new Uint8Array(bytes), { headers: { "content-type": "application/pdf" } }); };
    const login = await processPendingPjudDocumentJobs({ causaId, limit: 1, fetch: fixtureFetch, enqueue: () => { enqueued++; return true; } });
    assert.equal(login[0].status, "waiting_login");
    const drained = await processPendingPjudDocumentJobs({ causaId, limit: 2, fetch: fixtureFetch, enqueue: () => { enqueued++; return true; } });
    assert.equal(drained.filter(row => row.status === "saved").length, 2, "a protected first document must not starve the remaining queue");
    assert.equal(requests, 3); assert.equal(enqueued, 2);
    const saved = await prisma.pjudDocumentJob.findFirstOrThrow({ where: { causaId, status: "saved" }, include: { documento: true } });
    assert.equal(saved.sourceSha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(await getObject(saved.documento!.storageKey!), bytes);
    const recovered = await Promise.all([0,1].map(() => ingestPjudDocumentBuffer({ causaId, movimientoId: firstJob.movimientoId, bytes, enqueue: () => { enqueued++; return true; } })));
    assert.equal(recovered[0], recovered[1]); assert.equal(enqueued, 3, "concurrent authenticated retries keep one original");
    assert.equal((await pjudDocumentProgress(causaId)).saved, 3);
    await prisma.documento.delete({ where: { id: saved.documentoId! } });
    assert.equal(await ingestPjudDocumentBuffer({ causaId, movimientoId: saved.movimientoId, bytes, enqueue: () => true }), null, "deleted original tombstone must not silently recreate a document");
    assert.equal((await pjudDocumentProgress(causaId)).removed, 1);
    assert.deepEqual(await processPendingPjudDocumentJobs({ causaId, fetch: fixtureFetch }), []);
    assert.equal(requests, 3);
    let cancelled = false;
    const oversized = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(101)); }, cancel() { cancelled = true; } }));
    await assert.rejects(readPjudDocumentResponse(oversized, 100), /tamaño/); assert.equal(cancelled, true);
    const last = movements.find(row => row.id === firstJob.movimientoId)!;
    assert.ok(last);
    const legacyMovement = await prisma.causaMovimiento.create({ data: { causaId, titulo: "Legacy ownerless source", documentoRef: "https://oficinajudicialvirtual.pjud.cl/legacy.pdf" } });
    await prisma.pjudDocumentJob.create({ data: { causaId, movimientoId: legacyMovement.id, actorId: null, sourceRefHash: pjudDocumentRefHash(causaId, legacyMovement.id, legacyMovement.documentoRef!) } });
    const beforeLegacy = requests;
    await processPendingPjudDocumentJobs({ causaId, fetch: fixtureFetch, enqueue: () => true });
    assert.equal(requests, beforeLegacy, "legacy ownerless jobs cannot borrow system authority");
    assert.equal((await prisma.pjudDocumentJob.findUniqueOrThrow({ where: { movimientoId: legacyMovement.id } })).lastErrorCode, "owner_required");
    const leaseMovement = await prisma.causaMovimiento.create({ data: { causaId, titulo: "Expired lease source", documentoRef: "https://oficinajudicialvirtual.pjud.cl/lease.pdf" } });
    const leaseJob = await prisma.pjudDocumentJob.create({ data: { causaId, movimientoId: leaseMovement.id, actorId: owner.id, sourceRefHash: pjudDocumentRefHash(causaId, leaseMovement.id, leaseMovement.documentoRef!), status: "running", leaseToken: "expired-fixture-lease", leaseExpiresAt: new Date(0) } });
    const beforeLeaseCount = await prisma.documento.count({ where: { causaId } });
    assert.equal(await ingestPjudDocumentBuffer({ causaId, movimientoId: leaseMovement.id, bytes, receiptLeaseToken: leaseJob.leaseToken!, enqueue: () => true }), null, "an expired lease cannot commit an original");
    assert.equal(await prisma.documento.count({ where: { causaId } }), beforeLeaseCount);
    await prisma.pjudDocumentJob.delete({ where: { id: leaseJob.id } }); await prisma.causaMovimiento.delete({ where: { id: leaseMovement.id } });
    await prisma.causa.update({ where: { id: causaId }, data: { abogadoId: other.id, pjudDocumentDownloadOwnerId: other.id } });
    await enqueuePjudDocumentJobs(causaId, { actorId: other.id, waitingLogin: false });
    const rebound = await prisma.pjudDocumentJob.findUniqueOrThrow({ where: { movimientoId: legacyMovement.id } });
    assert.equal(rebound.actorId, other.id, "a new explicit durable authorization can bind a pending source to the current professional");
    assert.equal(rebound.status, "pending");
    await processPendingPjudDocumentJobs({ causaId, fetch: fixtureFetch, enqueue: () => true });
    assert.equal((await prisma.pjudDocumentJob.findUniqueOrThrow({ where: { id: rebound.id } })).status, "saved");
    await prisma.causa.update({ where: { id: causaId }, data: { abogadoId: owner.id, pjudDocumentDownloadOwnerId: owner.id } });
    const pumpItem = { rit: `C-${Date.now() % 800000 + 100001}-2026`, tribunal, caratula: "Synthetic live document continuation" };
    const captured = [0,1].map(index => { const fecha = new Date("2026-11-01T12:00:00Z"); return { ...scrapeMovimientoIdentity(`Pump resolution ${index}`, fecha, String(index), "Principal"), titulo: `Pump resolution ${index}`, fecha, fuente: "pjud" as const, folio: String(index), cuaderno: "Principal", documentoRef: `https://oficinajudicialvirtual.pjud.cl/pump-${index}.pdf` }; });
    let pumpReads = 0, closed = false;
    const browser: ManualOjvSession = {
      status: () => ({ phase: closed ? "closed" : "authenticated", authenticated: !closed, channel: "chromium", createdAt: new Date().toISOString(), authenticatedAt: new Date().toISOString(), pageUrl: "https://oficinajudicialvirtual.pjud.cl/indexN.php" }),
      waitForAuthentication: async () => browser.status(), showOfficialWindow: async () => undefined,
      listMisCausas: async () => [pumpItem],
      fetchCausaDetail: async (_cause, options) => { if (options?.documentExternalIds) pumpReads++; return { movimientos: captured.map(movement => ({ ...movement, ...(options?.documentExternalIds?.includes(movement.externalId) ? { documentoBytes: bytes, documentoFilename: "pump.pdf" } : {}) })), sala: null, note: "Synthetic session documents", portalUrl: "https://oficinajudicialvirtual.pjud.cl/indexN.php" }; },
      close: async () => { closed = true; },
    };
    const manager = new ManualOjvSessionManager({ createSession: async () => browser, authorize: async () => undefined, runtimeAllowed: () => true, monitorMs: 10, ingestDocument: options => ingestPjudDocumentBuffer({ ...options, enqueue: () => true }) });
    const identity = { actorId: owner.id, fingerprint: "synthetic-session-fingerprint", sessionVersion: 1, authExpiresAt: Date.now() + 3600000 };
    try {
      const started = await manager.start(identity); await started.run();
      const listed = await manager.list(identity, started.session.id); await listed.run();
      const snapshot = await manager.status(identity, started.session.id); assert.equal(snapshot?.candidates.length, 1);
      const imported = await manager.import(identity, started.session.id, [snapshot!.candidates[0].id], { downloadDocuments: true, intervalMinutes: 60 }); await imported.run();
      const done = await manager.status(identity, started.session.id); assert.ok(done?.result); causes.push(done.result.items[0].causaId);
      const deadline = Date.now() + 5000;
      while ((await manager.status(identity, started.session.id))?.result?.items[0].documents?.saved !== 2) { assert.ok(Date.now() < deadline, "live document continuation timed out"); await new Promise(resolve => setTimeout(resolve, 20)); }
      assert.equal(pumpReads, 1, "remaining originals continue automatically in a bounded session-owned batch");
      assert.equal((await pjudDocumentProgress(done.result.items[0].causaId)).waitingLogin, 0);
    } finally { await manager.dispose(); }
    console.log("PJUD document queue: personal ACL, pauses, durable login recovery, fair drain, duplicate race, originals, tombstones, bounded streaming and live-session automatic continuation passed (synthetic providers).");
  } finally {
    await prisma.documento.deleteMany({ where: { causaId: { in: causes } } });
    await prisma.causa.deleteMany({ where: { id: { in: causes } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect(); await rm(storage, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
