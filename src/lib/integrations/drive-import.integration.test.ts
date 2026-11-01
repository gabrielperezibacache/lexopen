import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { getObject } from "@/lib/storage";
import { importSelectedDriveFile, listDriveImportCandidates } from "./drive-import";

assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Drive tests require isolated local storage");
const status = (wanted: number) => (error: unknown) => (error as { status?: number }).status === wanted;
const sha = (bytes: Buffer, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");

async function main() {
  const tag = randomUUID().replaceAll("-", ""), users: string[] = [];
  const storage = await mkdtemp(path.join(tmpdir(), "lexopen-drive-import-it-")), previousStorage = process.env.STORAGE_PATH;
  process.env.STORAGE_PATH = storage;
  let causaId = "", triggerInstalled = false;
  const trigger = `drive_audit_${tag}`;
  try {
    const owner = await prisma.user.create({ data: { email: `${tag}@drive-import.invalid`, name: "Drive fixture", password: "unused", role: "abogado" } }); users.push(owner.id);
    const other = await prisma.user.create({ data: { email: `${tag}-other@drive-import.invalid`, name: "Other fixture", password: "unused", role: "abogado" } }); users.push(other.id);
    const reader = await prisma.user.create({ data: { email: `${tag}-reader@drive-import.invalid`, name: "Reader fixture", password: "unused", role: "abogado" } }); users.push(reader.id);
    const portal = await prisma.user.create({ data: { email: `${tag}-portal@drive-import.invalid`, name: "Portal fixture", password: "unused", role: "cliente" } }); users.push(portal.id);
    const folderId = `Folder_${tag}`, fileId = `File_${tag}`;
    const cause = await prisma.causa.create({ data: { titulo: `Drive fixture ${tag}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id, googleDriveFolderId: folderId, miembros: { create: { userId: reader.id, rol: "lectura" } } } }); causaId = cause.id;
    const body = Buffer.from("Antecedente ficticio de Drive: pago verificado para las pruebas.");
    let remote = { id: fileId, name: "antecedente.txt", mimeType: "text/plain", version: "3", modifiedTime: "2026-01-01T00:00:00Z", size: String(body.length), parents: [folderId], trashed: false, md5Checksum: sha(body, "md5"), capabilities: { canDownload: true } };
    let servedBytes = body, metaReads = 0, downloaded = 0, enqueued = 0, sessionCalls = 0;
    let mutateAfterDownload: (() => Promise<void> | void) | undefined;
    let afterMeta: (() => void) | undefined;
    let advertisedLength: string | null = null;
    const urls: URL[] = [];
    const fixtureFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input)); urls.push(url);
      assert.equal(url.origin, "https://www.googleapis.com"); assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-token-never-real");
      if (url.pathname.endsWith(`/${folderId}`)) return Response.json({ id: folderId, mimeType: "application/vnd.google-apps.folder", trashed: false });
      if (url.pathname === "/drive/v3/files") return Response.json({ files: [remote, { ...remote, id: `Shortcut_${tag}`, mimeType: "application/vnd.google-apps.shortcut" }], nextPageToken: "fixture-next", incompleteSearch: true });
      if (url.searchParams.get("alt") === "media" || url.pathname.endsWith("/export")) {
        downloaded++;
        await mutateAfterDownload?.();
        return new Response(new Uint8Array(servedBytes), { headers: advertisedLength ? { "content-length": advertisedLength } : {} });
      }
      metaReads++; const result = structuredClone(remote); afterMeta?.(); return Response.json(result);
    };
    const options = { client: prisma, fetch: fixtureFetch, session: async () => { sessionCalls++; return { scopes: ["https://www.googleapis.com/auth/drive.file"], syncDrive: true, syncCalendar: false, accessToken: "fixture-token-never-real", connectedEmail: "fixture@drive.invalid" }; }, enqueue: () => { enqueued++; return true; } };
    const choose = () => ({ causaId, folderId, fileId, version: remote.version });
    const listed = await listDriveImportCandidates(causaId, owner, "opaque-page-token", options);
    assert.equal(listed.files.length, 2); assert.equal(listed.files[0].importable, true); assert.equal(listed.files[1].importable, false); assert.equal(listed.incompleteSearch, true); assert.equal(listed.nextPageToken, "fixture-next");
    const listingUrl = urls.find(url => url.pathname === "/drive/v3/files")!;
    assert.equal(listingUrl.searchParams.get("q"), `'${folderId}' in parents and trashed=false`); assert.equal(listingUrl.searchParams.get("pageToken"), "opaque-page-token");
    assert.equal(listingUrl.searchParams.get("pageSize"), "50");
    const sessions = sessionCalls;
    await assert.rejects(listDriveImportCandidates(causaId, other, null, options), status(404));
    await assert.rejects(listDriveImportCandidates(causaId, portal, null, options), status(403));
    await assert.rejects(importSelectedDriveFile(choose(), reader, options), status(403));
    assert.equal(sessionCalls, sessions, "No Google session/network before current authorization");
    await assert.rejects(importSelectedDriveFile({ ...choose(), fileId: "bad/?url=evil" }, owner, options), status(400));
    await assert.rejects(importSelectedDriveFile({ ...choose(), folderId: `Other_${tag}` }, owner, options), status(409));
    await assert.rejects(importSelectedDriveFile({ ...choose(), version: "2" }, owner, options), status(409));
    assert.equal(downloaded, 0);

    const imported = await Promise.all([importSelectedDriveFile(choose(), owner, options), importSelectedDriveFile(choose(), owner, options)]);
    assert.equal(imported[0].documentoId, imported[1].documentoId); assert.equal(enqueued, 1);
    assert.equal(await prisma.driveDocumentImport.count({ where: { causaId } }), 1);
    const first = await prisma.documento.findUniqueOrThrow({ where: { id: imported[0].documentoId }, include: { driveImport: true } });
    assert.deepEqual(await getObject(first.storageKey!), body); assert.equal(first.extractionStatus, "pending"); assert.equal(first.driveImport!.sourceSha256, sha(body));
    assert.equal(first.googleDriveId, null, "Import provenance does not repurpose the uploader's remote destination");
    const provenance = JSON.parse(first.driveImport!.metadataJson);
    assert.equal(provenance.driveVersion, "3"); assert.equal(provenance.acquiredAs, "original-download"); assert.equal(provenance.connectedEmail, "fixture@drive.invalid"); assert.equal(JSON.stringify(provenance).includes("fixture-token"), false);
    assert.equal(await prisma.auditEvent.count({ where: { actorId: owner.id, action: "document.drive.import" } }), 1);
    assert.equal(await prisma.activity.count({ where: { causaId } }), 1);
    const already = await importSelectedDriveFile(choose(), owner, options); assert.equal(already.reused, true); assert.equal(enqueued, 1);
    await prisma.documento.update({ where: { id: first.id }, data: { confidencial: true } });
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "doc.confidential.read" } });
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(404));
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "causa.write" } });
    const sessionsBeforeRevoke = sessionCalls;
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(403));
    assert.equal(sessionCalls, sessionsBeforeRevoke, "Fresh capability revoke prevents even OAuth/session access");
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    await prisma.documento.update({ where: { id: first.id }, data: { confidencial: false } });

    // A later Drive version creates a separate local document and preserves the original.
    remote = { ...remote, version: "4" }; servedBytes = body;
    const second = await importSelectedDriveFile(choose(), owner, options); assert.notEqual(second.documentoId, first.id); assert.deepEqual(await getObject(first.storageKey!), body);
    const totalBeforeErrors = await prisma.documento.count({ where: { causaId } });
    remote = { ...remote, version: "5", parents: [`Outside_${tag}`] };
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(409));
    remote = { ...remote, parents: [folderId], trashed: true };
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(409));
    remote = { ...remote, trashed: false, capabilities: { canDownload: false } };
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(409));
    remote = { ...remote, capabilities: { canDownload: true }, mimeType: "application/vnd.google-apps.shortcut" };
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(409));
    remote = { ...remote, mimeType: "text/plain", md5Checksum: "0".repeat(32) };
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(409));
    remote = { ...remote, md5Checksum: sha(body, "md5") }; advertisedLength = String(26 * 1024 * 1024);
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(413)); advertisedLength = null;
    afterMeta = () => { if (metaReads % 2) remote = { ...remote, version: "6" }; };
    // Use an explicit download hook to change the revision between the two metadata reads.
    afterMeta = undefined; mutateAfterDownload = () => { remote = { ...remote, version: "6" }; };
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(409)); mutateAfterDownload = undefined;
    assert.equal(await prisma.documento.count({ where: { causaId } }), totalBeforeErrors);

    // Fresh access and the folder are checked again after download, inside the write transaction.
    remote = { ...remote, version: "7" };
    mutateAfterDownload = async () => { await prisma.causa.update({ where: { id: causaId }, data: { abogadoId: other.id } }); };
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(404)); mutateAfterDownload = undefined;
    await prisma.causa.update({ where: { id: causaId }, data: { abogadoId: owner.id } });
    mutateAfterDownload = async () => { await prisma.causa.update({ where: { id: causaId }, data: { googleDriveFolderId: `Changed_${tag}` } }); };
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(409)); mutateAfterDownload = undefined;
    await prisma.causa.update({ where: { id: causaId }, data: { googleDriveFolderId: folderId } });

    // Google Workspace exports are retained as exports, never mislabeled native originals.
    const pdf = await readFile(path.join(process.cwd(), "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf"));
    remote = { ...remote, version: "8", mimeType: "application/vnd.google-apps.document", size: "123" }; servedBytes = pdf;
    const exported = await importSelectedDriveFile(choose(), owner, options);
    const exportedDoc = await prisma.documento.findUniqueOrThrow({ where: { id: exported.documentoId }, include: { driveImport: true } });
    assert.equal(exportedDoc.mimeType, "application/pdf"); assert.match(exportedDoc.nombre, /\.pdf$/); assert.deepEqual(await getObject(exportedDoc.storageKey!), pdf);
    assert.equal(JSON.parse(exportedDoc.driveImport!.metadataJson).acquiredAs, "workspace-export");
    remote = { ...remote, version: "9" }; servedBytes = Buffer.from("not-pdf");
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(422));
    advertisedLength = String(10 * 1024 * 1024 + 1);
    await assert.rejects(importSelectedDriveFile(choose(), owner, options), status(413)); advertisedLength = null;

    // Provider failures and cancellation do not create placeholder documents or leak provider bodies.
    await assert.rejects(listDriveImportCandidates(causaId, owner, null, { ...options, fetch: async () => new Response("secret-provider-message", { status: 403 }) }), (error: unknown) => status(403)(error) && !(error as Error).message.includes("secret-provider"));
    await assert.rejects(listDriveImportCandidates(causaId, owner, null, { ...options, fetch: async () => Response.redirect("http://127.0.0.1:1/private", 302) }), status(502));
    await assert.rejects(listDriveImportCandidates(causaId, owner, null, { ...options, timeoutMs: 5, fetch: async (_input, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }); }) }), status(504));

    remote = { ...remote, version: "10", mimeType: "text/plain", size: String(body.length) }; servedBytes = body;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."actorId" = '${owner.id}' AND NEW.action = 'document.drive.import' THEN RAISE EXCEPTION 'Drive fixture audit failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`); triggerInstalled = true;
    const count = await prisma.documento.count({ where: { causaId } });
    await assert.rejects(importSelectedDriveFile(choose(), owner, options));
    assert.equal(await prisma.documento.count({ where: { causaId } }), count, "Audit failure rolls back document/import/activity together");
    assert.equal(await prisma.driveDocumentImport.count({ where: { causaId, driveVersion: "10" } }), 0);
    console.log("Drive import integration PASS: selected folder pagination, fresh ACL, blocked network, binary/export provenance, concurrency idempotence, frozen originals, revisions/parents/trashed/permissions/checksums/limits, revoked access/folder, provider errors/timeout and audit rollback. Google transport is a fixture, no live OAuth account used.");
  } finally {
    if (triggerInstalled) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditEvent"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${trigger}"()`);
    if (causaId) { await prisma.documento.deleteMany({ where: { causaId } }); await prisma.causa.deleteMany({ where: { id: causaId } }); }
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (previousStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = previousStorage;
    await rm(storage, { recursive: true, force: true }); await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
