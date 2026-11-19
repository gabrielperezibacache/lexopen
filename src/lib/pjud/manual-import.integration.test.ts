import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { getCausaDocImportStatus, processManualDocumentImport, startCausaDocImport } from "./import-causa-documents";
import { ingestPjudDocumentBuffer } from "./pdf-backup";
import { claimManualImport, updateClaim } from "./manual-import-store";
import type { PjudFetchedMovimiento } from "./types";

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  assert.ok(!process.env.S3_BUCKET);
  const tag = randomUUID(), storage = await mkdtemp(path.join(tmpdir(), "lexopen-manual-pjud-"));
  process.env.STORAGE_PATH = storage;
  process.env.PJUD_DOC_DOWNLOAD_DELAY_MS = "0";
  process.env.PJUD_DOC_DOWNLOADS = "1";
  const causeIds: string[] = [], users: string[] = [];
  let orgId: string | undefined;
  try {
    const org = await prisma.organization.findFirst({ select: { settings: { select: { caseManagementMode: true } } } });
    if (!org) orgId = (await prisma.organization.create({ data: { name: tag, settings: { create: { caseManagementMode: "pjud_cl" } } } })).id;
    else assert.equal(org.settings?.caseManagementMode, "pjud_cl");
    for (const who of ["lawyer", "colleague"]) {
      const user = await prisma.user.create({ data: { name: who, email: `${who}-${tag}@fixture.invalid`, password: "unused", role: "abogado" } });
      users.push(user.id);
    }
    for (const title of ["Principal", "Otra"]) {
      const cause = await prisma.causa.create({ data: { titulo: title, tribunal: "Sintético", materia: "Civil", acceso: "equipo", abogadoId: users[0] } });
      causeIds.push(cause.id);
    }
    const [causaId, otherCase] = causeIds;
    const [first, second] = await Promise.all([startCausaDocImport(causaId, users[0]), startCausaDocImport(causaId, users[0])]);
    assert.equal(Number(first.started) + Number(second.started), 1);
    assert.equal((await startCausaDocImport(otherCase, users[0])).globalBusy, true);
    await assert.rejects(startCausaDocImport(causaId, users[1]));
    const earlier = await claimManualImport(causaId);
    assert.ok(earlier);
    assert.equal(await claimManualImport(causaId), null, "independent worker must not take an active lease");
    await prisma.pjudManualImport.update({ where: { id: earlier.id }, data: { leaseExpiresAt: new Date(0) } });
    await assert.rejects(updateClaim(earlier, { note: "stale worker" }), /otro responsable/);

    const external = ["collided", "with-link", "with-bytes"];
    const rows = await Promise.all(external.map((key, i) => prisma.causaMovimiento.create({ data: {
      causaId, titulo: key, externalId: key, cuaderno: "Principal", folio: String(i + 1),
    } })));
    const pdf = Buffer.from("%PDF-1.4\n" + "x".repeat(300));
    const makeSource = (i: number): PjudFetchedMovimiento => ({
      externalId: external[i], titulo: external[i], fuente: "pjud", fecha: new Date(), folio: String(i + 1),
      cuaderno: i === 0 ? "Incidente" : "Principal", documentoRef: `https://civil.pjud.cl/${external[i]}.pdf?token=FIXTURE`,
      ...(i === 1 ? {} : { documentoBytes: pdf }),
    });
    const downloaded: string[] = [];
    let scrapeCalls = 0;
    const worker = { causaId, enqueue: () => true,
      fetchMovimientos: async () => { scrapeCalls++; return { provider: "scrape" as const, movimientos: external.map((_, i) => makeSource(i)), note: "", demo: false }; },
      fetchDocument: async (url: string) => {
        downloaded.push(url);
        return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf" } });
      },
    };
    await Promise.all([processManualDocumentImport(worker), processManualDocumentImport(worker)]);
    assert.equal(scrapeCalls, 1);
    assert.deepEqual(downloaded, [makeSource(1).documentoRef]);
    const progress = await getCausaDocImportStatus(causaId);
    assert.equal(progress.status, "done");
    assert.equal(progress.saved, 2);
    const original = await prisma.causaMovimiento.findUniqueOrThrow({ where: { id: rows[0].id } });
    assert.equal(original.documentoRef, null, "neither URL nor bytes are assigned to a colliding legacy ID");
    assert.equal(await prisma.caseDocumentIntake.count({ where: { causaId, source: "ojv" } }), 2);
    assert.doesNotMatch(JSON.stringify(await prisma.pjudManualImport.findMany({ where: { causaId } })), /FIXTURE|https:\/\//);
    await processManualDocumentImport(worker);
    assert.equal(scrapeCalls, 1, "a subsequent worker tick does not repeat a completed manual request");

    // Incomplete coverage and an invalid captured PDF must survive completion as a retryable outcome.
    await startCausaDocImport(causaId, users[0]);
    await processManualDocumentImport({ ...worker, fetchMovimientos: async () => ({
      provider: "scrape", note: "", demo: false,
      cuadernos: { status: "partial", total: 2, read: 1, items: [] },
      movimientos: [{ ...makeSource(0), cuaderno: "Principal", documentoBytes: Buffer.from("Texto del portal".repeat(30)) }],
    }) });
    const partial = await getCausaDocImportStatus(causaId);
    assert.deepEqual([partial.status, partial.failed, partial.saved], ["failed", 1, 0]);
    assert.match(partial.note || "", /cuadernos pendientes/);
    assert.equal(await prisma.caseDocumentIntake.count({ where: { causaId, source: "ojv" } }), 2);

    const originalDir = path.join(storage, "pjud", "intake-attempt");
    const storedFiles = (await readdir(originalDir)).sort();
    await assert.rejects(ingestPjudDocumentBuffer({
      causaId, actorId: users[0], movimientoId: original.id, bytes: Buffer.concat([pdf, Buffer.from("-new")]),
      manualBatch: { guard: async () => undefined, saved: async () => { throw new Error("synthetic lease loss"); } },
    }), /synthetic lease loss/);
    assert.deepEqual((await readdir(originalDir)).sort(), storedFiles, "a rolled-back checkpoint must not leave a detached original in storage");

    // Interrupt a worker after it committed its first original, while the second response is in flight.
    const remainingUrls = [1, 2].map(i => `https://civil.pjud.cl/restore-${i}.pdf`);
    for (const [i, documentoRef] of remainingUrls.entries()) {
      await prisma.causaMovimiento.create({ data: { causaId: otherCase, titulo: "Descarga de prueba", documentoRef,
        fecha: new Date(Date.UTC(2026, 0, 2 - i)) } });
    }
    await startCausaDocImport(otherCase, users[0]);
    const late = await claimManualImport(otherCase);
    assert.ok(late);
    await prisma.pjudManualImport.update({ where: { id: late.id }, data: { phase: "download", note: null, leaseExpiresAt: new Date(0) } });
    const restoredDownloads: string[] = [];
    const restored = { ...worker, causaId: otherCase, fetchDocument: async (url: string) => {
      restoredDownloads.push(url);
      return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf" } });
    } };
    let oldRequests = 0;
    await processManualDocumentImport({ ...restored, fetchDocument: async () => {
      if (++oldRequests === 2) {
        assert.equal((await getCausaDocImportStatus(otherCase)).saved, 1);
        await prisma.pjudManualImport.update({ where: { id: late.id }, data: { leaseExpiresAt: new Date(0) } });
        await processManualDocumentImport(restored);
      }
      return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf" } });
    } });
    assert.deepEqual(restoredDownloads, [remainingUrls[1]], "a restarted worker skips the already confirmed original");
    const recovered = await getCausaDocImportStatus(otherCase);
    assert.deepEqual([recovered.status, recovered.saved, recovered.completed], ["done", 2, 2]);
    assert.equal(await prisma.caseDocumentIntake.count({ where: { causaId: otherCase } }), 2);

    await startCausaDocImport(causaId, users[0]);
    await prisma.causa.update({ where: { id: causaId }, data: { abogadoId: users[1] } });
    await processManualDocumentImport(worker);
    assert.equal(scrapeCalls, 1, "a revoked actor cannot start an outbound request");
    assert.equal((await getCausaDocImportStatus(causaId)).status, "failed");
    console.log("Manual OJV import: concurrent enqueue, claim recovery, reference identity, exactly-once originals and revocation passed with synthetic documents.");
  } finally {
    await prisma.documento.deleteMany({ where: { causaId: { in: causeIds } } });
    await prisma.causa.deleteMany({ where: { id: { in: causeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
    await rm(storage, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
