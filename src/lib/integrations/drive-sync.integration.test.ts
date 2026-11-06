import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ingestManualCaseDocument } from "@/lib/causas/document-intake";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { configureDriveSync, processDueDriveSyncSubscriptions } from "./drive-sync";

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  assert.ok(!process.env.S3_BUCKET);
  const tag = randomUUID().replaceAll("-", ""), folderId = `Folder_${tag}`;
  const storage = await mkdtemp(path.join(tmpdir(), "lexopen-drive-sync-")); process.env.STORAGE_PATH = storage;
  let causaId = ""; const users: string[] = [];
  try {
    const user = await prisma.user.create({ data: { email: `${tag}@auto-drive.invalid`, name: "Auto Drive fixture", password: "unused", role: "abogado" } }); users.push(user.id);
    const other = await prisma.user.create({ data: { email: `${tag}-other@auto-drive.invalid`, name: "Other fixture", password: "unused", role: "abogado" } }); users.push(other.id);
    const causa = await prisma.causa.create({ data: { titulo: "Synthetic automatic Drive", tribunal: "Fictitious", materia: "Fixture", acceso: "equipo", abogadoId: user.id, googleDriveFolderId: folderId } }); causaId = causa.id;
    let version = "1", downloads = 0, enqueued = 0, nested = false, moved = false, deep = false, deniedFirst = false;
    const childId = `Child_${tag}`, grandchildId = `Grandchild_${tag}`, outsideId = `Outside_${tag}`;
    let duringDownload: (() => Promise<void>) | undefined;
    const bytes = () => Buffer.from(`Fictitious original version ${version} for bounded Drive synchronization.`);
    const metadata = (index: number) => ({ id: `File_${tag}_${String(index).padStart(3,"0")}`, name: `fixture-${index}.txt`, mimeType: "text/plain", version: index === 0 ? version : "1", size: String(bytes().length), parents: [folderId], trashed: false, md5Checksum: createHash("md5").update(bytes()).digest("hex"), capabilities: { canDownload: true } });
    const folder = (id: string, parent?: string) => ({ id, name: "Synthetic folder", mimeType: "application/vnd.google-apps.folder", trashed: false, parents: parent ? [parent] : [] });
    const nestedMeta = (index: number) => ({ ...metadata(index), parents: [index === 130 ? grandchildId : childId] });
    const deepId = (depth: number) => `Folder_${tag}_deep_${depth}`;
    const deniedMeta = () => ({ ...metadata(400), mimeType: "application/vnd.google-apps.document" });
    const fixtureFetch: typeof fetch = async (input) => {
      const url = new URL(String(input)); assert.equal(url.hostname, "www.googleapis.com");
      const depthMatch = url.pathname.match(/_deep_(\d+)$/);
      if (depthMatch) { const depth = Number(depthMatch[1]); assert.ok(depth < 8, "folder depth bound must prevent requesting a ninth descendant"); return Response.json(folder(deepId(depth), depth ? deepId(depth - 1) : folderId)); }
      if (url.pathname.endsWith(`/${folderId}`)) return Response.json(folder(folderId));
      if (url.pathname.endsWith(`/${childId}`)) return Response.json(folder(childId, moved ? outsideId : folderId));
      if (url.pathname.endsWith(`/${grandchildId}`)) return Response.json(folder(grandchildId, childId));
      if (url.pathname.endsWith(`/${outsideId}`)) return Response.json(folder(outsideId));
      if (url.pathname === "/drive/v3/files") {
        if (deniedFirst) return Response.json({ files: [deniedMeta(), metadata(401)] });
        if (deep) { const depth = url.searchParams.get("q")?.match(/_deep_(\d+)/); const next = depth ? Number(depth[1]) + 1 : 0; return Response.json({ files: [folder(deepId(next), depth ? deepId(next - 1) : folderId)] }); }
        if (!nested) return Response.json({ files: Array.from({ length: 45 }, (_, index) => metadata(index)), incompleteSearch: false });
        const query = url.searchParams.get("q") || "";
        if (query.startsWith(`'${folderId}'`)) return Response.json({ files: [folder(childId, folderId), folder(childId, folderId)] });
        if (query.startsWith(`'${childId}'`)) return Response.json({ files: [folder(grandchildId, childId), ...Array.from({ length: 30 }, (_, index) => nestedMeta(index + 100))] });
        if (query.startsWith(`'${grandchildId}'`)) return Response.json({ files: [folder(folderId, grandchildId), nestedMeta(130)] });
        assert.fail("attempted to list a folder outside the consented tree");
      }
      if (deniedFirst && url.pathname.endsWith(`/${metadata(400).id}/export`)) return new Response("", { status: 403 });
      if (url.searchParams.get("alt") === "media") { downloads++; await duringDownload?.(); return new Response(new Uint8Array(bytes())); }
      const match = url.pathname.match(/_(\d{3})$/); assert.ok(match); const index = Number(match[1]); return Response.json(deniedFirst && index === 400 ? deniedMeta() : index >= 100 && index < 200 ? nestedMeta(index) : metadata(index));
    };
    const deps = { client: prisma, fetch: fixtureFetch, session: async () => ({ scopes: ["https://www.googleapis.com/auth/drive.file"], syncDrive: true, syncCalendar: false, accessToken: "fixture-only-never-real", connectedEmail: "fixture@drive.invalid" }), enqueue: () => { enqueued++; return true; } };
    const manual = await ingestManualCaseDocument({
      causaId, clienteId: null, nombre: "Original manual.txt", tipo: "otro", contenido: null, mimeType: "text/plain",
      ruta: null, extractionStatus: "pending", confidencial: false, privilegio: false,
    }, bytes(), user);
    await assert.rejects(configureDriveSync(causaId, other, { enabled: true, intervalMinutes: 60, account: "study" }), (error: unknown) => (error as { status: number }).status === 404);
    await configureDriveSync(causaId, user, { enabled: true, intervalMinutes: 60, account: "study" });
    const run = async () => { await prisma.driveSyncSubscription.update({ where: { causaId }, data: { nextRunAt: new Date(0) } }); return processDueDriveSyncSubscriptions({ ...deps, causaId }); };
    const first = await run(); assert.equal(first[0].imported, 20); assert.equal(first[0].complete, false);
    assert.ok((await prisma.driveSyncSubscription.findUniqueOrThrow({ where: { causaId } })).scanCursor);
    const second = await run(); assert.equal(second[0].imported, 20);
    const third = await run(); assert.equal(third[0].imported, 5); assert.equal(third[0].complete, true);
    assert.equal(downloads, 45); assert.equal(enqueued, 44); assert.equal(await prisma.documento.count({ where: { causaId } }), 45);
    assert.equal((await prisma.driveSyncSubscription.findUniqueOrThrow({ where: { causaId } })).scanCursor, null);
    const repeat = await run(); assert.equal(repeat[0].imported, 0); assert.equal(downloads, 45);
    const old = await prisma.driveDocumentImport.findFirstOrThrow({ where: { causaId, driveFileId: metadata(0).id } });
    assert.equal(old.documentoId, manual.doc.id, "the worker preserves the manual original for the first Drive revision");
    assert.equal(await prisma.caseDocumentIntake.count({ where: { documentoId: manual.doc.id } }), 2);
    version = "2";
    const updated = await run(); assert.equal(updated[0].imported, 1); assert.equal(downloads, 46);
    assert.equal(await prisma.documento.count({ where: { causaId } }), 46);
    assert.ok(await prisma.documento.findUnique({ where: { id: old.documentoId } }), "a new remote version must retain the earlier source");
    version = "3";
    duringDownload = async () => { await configureDriveSync(causaId, user, { enabled: false, intervalMinutes: 60, account: "study" }); };
    await run();
    assert.equal(await prisma.documento.count({ where: { causaId } }), 46, "pausing during download must prevent its commit");
    const paused = await prisma.driveSyncSubscription.findUniqueOrThrow({ where: { causaId } });
    assert.equal(paused.enabled, false); assert.equal(paused.status, "paused", "the obsolete worker must not overwrite a newer configuration");
    duringDownload = undefined;
    await configureDriveSync(causaId, user, { enabled: true, intervalMinutes: 60, account: "study" });
    await prisma.causa.update({ where: { id: causaId }, data: { abogadoId: other.id } });
    const before = downloads; const revoked = await run(); assert.equal(revoked[0].status, "attention"); assert.equal(downloads, before, "revoked access must stop before Google requests");
    await prisma.causa.update({ where: { id: causaId }, data: { abogadoId: user.id } });
    nested = true;
    await configureDriveSync(causaId, user, { enabled: true, intervalMinutes: 60, account: "study" });
    duringDownload = async () => { await configureDriveSync(causaId, user, { enabled: false, intervalMinutes: 60, account: "study" }); };
    await run(); assert.equal(await prisma.documento.count({ where: { causaId } }), 46, "pause also blocks an original from a subfolder");
    duringDownload = undefined;
    await configureDriveSync(causaId, user, { enabled: true, intervalMinutes: 60, account: "study" });
    const nestedFirst = await run(); assert.equal(nestedFirst[0].imported, 20); assert.equal(nestedFirst[0].complete, false);
    const nestedSecond = await run(); assert.equal(nestedSecond[0].imported, 11); assert.equal(nestedSecond[0].complete, true);
    assert.equal(await prisma.documento.count({ where: { causaId } }), 77, "resumed folder traversal must not duplicate folders or loop through a cycle");
    const nestedSource = await prisma.driveDocumentImport.findFirstOrThrow({ where: { causaId, driveFileId: nestedMeta(130).id } });
    assert.equal(JSON.parse(nestedSource.metadataJson).sourceFolderId, grandchildId);
    moved = true;
    await configureDriveSync(causaId, user, { enabled: true, intervalMinutes: 60, account: "study" });
    const downloadsBeforeMove = downloads;
    const movedFolder = await run(); assert.equal(movedFolder[0].status, "partial"); assert.equal(downloads, downloadsBeforeMove, "moving a folder out of the selected tree must stop its downloads");
    await prisma.causaMiembro.create({ data: { causaId, userId: other.id, rol: "colaborador" } });
    await assert.rejects(configureDriveSync(causaId, other, { enabled: true, intervalMinutes: 60, account: "study" }), (error: unknown) => (error as { status: number }).status === 403, "an active subscription cannot be taken over");
    await configureDriveSync(causaId, user, { enabled: false, intervalMinutes: 60, account: "study" });
    const beforeHandover = await prisma.driveSyncSubscription.findUniqueOrThrow({ where: { causaId } });
    await configureDriveSync(causaId, other, { enabled: true, intervalMinutes: 60, account: "study" });
    const handover = await prisma.driveSyncSubscription.findUniqueOrThrow({ where: { causaId } });
    assert.equal(handover.ownerId, other.id); assert.equal(handover.generation, beforeHandover.generation + 1); assert.equal(handover.scanCursor, null, "explicit handover must clear the former owner's scan");
    deep = true;
    await configureDriveSync(causaId, other, { enabled: true, intervalMinutes: 60, account: "study" });
    const boundedDepth = await run(); assert.equal(boundedDepth[0].status, "partial"); assert.equal(boundedDepth[0].imported, 0);
    deep = false; deniedFirst = true;
    await configureDriveSync(causaId, other, { enabled: true, intervalMinutes: 60, account: "study" });
    const forbiddenFirst = await run(); assert.equal(forbiddenFirst[0].status, "partial"); assert.equal(forbiddenFirst[0].imported, 1, "a forbidden first export must not starve the next valid document");
    const afterForbidden = await prisma.documento.count({ where: { causaId } });
    const repeatForbidden = await run(); assert.equal(repeatForbidden[0].imported, 0); assert.equal(await prisma.documento.count({ where: { causaId } }), afterForbidden, "later retries keep immutable copies without duplication");
    const removedSource=await prisma.driveDocumentImport.findFirstOrThrow({where:{causaId,driveFileId:metadata(401).id}});assert.ok(removedSource.documentoId);
    await prisma.documento.delete({where:{id:removedSource.documentoId}});
    assert.equal((await prisma.driveDocumentImport.findUniqueOrThrow({where:{id:removedSource.id}})).documentoId,null,"a deliberate delete keeps the frozen import receipt");
    const beforeRemoved=downloads, afterRemoved=await prisma.documento.count({where:{causaId}});
    const removedRun=await run();assert.equal(removedRun[0].removed,1);assert.equal(downloads,beforeRemoved);assert.equal(await prisma.documento.count({where:{causaId}}),afterRemoved,"a deleted local revision must not return to RAG automatically");
    console.log("Automatic study Drive: opt-in, bounded resumable batches, immutable versions, pause CAS, live permission revocation, recursive continuation, cycle dedup and moved-folder isolation passed (synthetic provider).");
  } finally {
    if (causaId) { await prisma.documento.deleteMany({ where: { causaId } }); await prisma.causa.delete({ where: { id: causaId } }); }
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect(); await rm(storage, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
