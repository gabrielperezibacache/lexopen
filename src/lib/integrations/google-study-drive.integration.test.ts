import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { encryptGoogleToken } from "./google-crypto";
import { resolveStudyDriveAccount } from "./google-study-drive";
import { configureOrganizationDrive, organizationDriveState } from "./drive-organization";
import { driveImportDependenciesForActor } from "./drive-sync";
import { importSelectedDriveFile, listDriveImportCandidates } from "./drive-import";
import { connectStudyGmail, studyGmailToken, STUDY_GMAIL_REFERENCE } from "./google-study-mail";
import type { DriveWriteCommand } from "@/lib/altazor/connectors/drive-management";
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Shared Drive tests require isolated local storage");
  const tag = randomUUID(), ids: string[] = [], cases: string[] = [], prior = await prisma.integrationConfig.findUnique({ where: { provider: "google" } });
  const storage = await mkdtemp(join(tmpdir(), "lexopen-study-read-test-")), oldStorage = process.env.STORAGE_PATH;
  process.env.STORAGE_PATH = storage;
  let clientId: string | undefined;
  let counter = 0, posts = 0, loseAck = false, downloads = 0;
  let afterList: (() => Promise<unknown>) | undefined, afterDownload: (() => Promise<unknown>) | undefined;
  let afterFolder: ((id: string) => Promise<unknown>) | undefined;
  let foreignMetadata: Record<string, unknown> | undefined;
  const remote = new Map<string, { metadata: Record<string, unknown>; bytes: Buffer }>();
  const token = "fictitious-shared-access-token";
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.hostname, "www.googleapis.com"); assert.equal(init?.redirect, "error"); assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
    if (url.pathname === "/drive/v3/files" && init?.method !== "POST") {
      const folderId = /^'([A-Za-z0-9_-]+)' in parents and trashed=false$/.exec(url.searchParams.get("q") || "")?.[1];
      assert.ok(folderId, "case reads must use an exact parent query");
      const files = [...remote.values()].filter(file => (file.metadata.parents as string[])?.includes(folderId)).map(file => file.metadata);
      if (foreignMetadata) files.push(foreignMetadata);
      const mutate = afterList; afterList = undefined; await mutate?.();
      return Response.json({ files });
    }
    if (url.pathname.endsWith("/generateIds")) return Response.json({ ids: [`GeneratedSharedId_${++counter}`] });
    if (init?.method === "POST") {
      posts++; let metadata: Record<string, unknown>, bytes = Buffer.alloc(0);
      if (typeof init.body === "string") metadata = JSON.parse(init.body);
      else {
        const raw = Buffer.from(init.body as Uint8Array), boundary = /boundary=(.+)$/.exec(new Headers(init.headers).get("content-type")!)![1];
        const chunks = raw.toString("latin1").split(`--${boundary}`);
        metadata = JSON.parse(chunks[1].split("\r\n\r\n")[1].trim());
        bytes = Buffer.from(chunks[2].split("\r\n\r\n")[1].slice(0, -2), "latin1");
      }
      const id = String(metadata.id); remote.set(id, { metadata: { ...metadata, trashed: false, size: String(bytes.length), md5Checksum: createHash("md5").update(bytes).digest("hex") }, bytes });
      if (loseAck) { loseAck = false; throw Error("lost shared response"); }
      return Response.json({ id });
    }
    const id = url.pathname.split("/").at(-1)!, file = remote.get(id);
    if (!file) return new Response("missing", { status: 404 });
    if (url.searchParams.get("alt") === "media") {
      downloads++; const mutate = afterDownload; afterDownload = undefined; await mutate?.();
      return new Response(new Uint8Array(file.bytes));
    }
    if (file.metadata.mimeType === "application/vnd.google-apps.folder") await afterFolder?.(id);
    return Response.json(file.metadata);
  };
  try {
    const owner = await prisma.user.create({ data: { name: "Shared admin", email: `${tag}@shared.invalid`, role: "admin", password: "not-a-login" } }); ids.push(owner.id);
    const staff = await prisma.user.create({ data: { name: "Shared staff", email: `${tag}-staff@shared.invalid`, role: "abogado", password: "not-a-login" } }); ids.push(staff.id);
    const config = { scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"], syncDrive: true, syncCalendar: true, accessToken: encryptGoogleToken(token), refreshToken: encryptGoogleToken("fictitious-shared-refresh"), tokenExpiresAt: Date.now() + 3600_000, connectedEmail: "study@example.invalid" };
    await prisma.integrationConfig.upsert({ where: { provider: "google" }, create: { provider: "google", enabled: true, configJson: JSON.stringify(config) }, update: { enabled: true, configJson: JSON.stringify(config) } });
    const account = await resolveStudyDriveAccount(owner, prisma, fetcher);
    assert.equal(account.source, "study");
    const folder: DriveWriteCommand = { action: "create_folder", request_id: "1".repeat(64), context_key: "2".repeat(64), folder_id: "RootFolderShared123", bindingRevision: account.bindingRevision, name: "Client folder", confirmed: true };
    const created = await account.command(folder); assert.equal(created.action, "create_folder"); assert.equal(posts, 1);
    assert.equal((await account.command(folder)).file_id, created.file_id); assert.equal(posts, 1, "repeated command only reads its reserved object");
    const content = Buffer.from("Exact shared file bytes ñ");
    const upload: DriveWriteCommand = { ...folder, action: "upload_file", request_id: "3".repeat(64), name: "document.txt", mime: "text/plain", content_base64: content.toString("base64"), sha256: createHash("sha256").update(content).digest("hex") };
    loseAck = true; await assert.rejects(account.command(upload), /lost shared response/);
    const { content_base64: _discard, ...expected } = upload; void _discard;
    const recovered = await account.reconcile(upload.request_id, { ...expected, expected_bytes: content.length });
    assert.equal(recovered?.state, "drive_verified"); assert.equal(posts, 2, "lost confirmation is never reposted");
    const copy = [...remote.values()].find(row => row.metadata.name === "document.txt")!;
    copy.bytes = Buffer.from("tampered");
    await assert.rejects(account.reconcile(upload.request_id, expected), /bytes/);
    const records = await prisma.commandExecution.findMany({ where: { ownerId: owner.id } });
    assert.ok(records.every(row => !row.resultJson?.includes(token) && !row.resultJson?.includes(content.toString("base64"))));
    await assert.rejects(connectStudyGmail(staff.id), (e: unknown) => (e as { status?: number }).status === 403);
    assert.equal(await connectStudyGmail(owner.id), true);
    const mailbox = await prisma.mailboxAccount.findUniqueOrThrow({ where: { userId: owner.id } });
    assert.equal(mailbox.oauthRefreshEnc, STUDY_GMAIL_REFERENCE); assert.equal(mailbox.oauthAccessEnc, null);
    assert.equal(await studyGmailToken(owner.id, "study@example.invalid"), token);
    await assert.rejects(studyGmailToken(staff.id, "study@example.invalid"));

    // Exercise the same shared-account dependencies as the cause API, with a real
    // Organization → Client → Cause binding and only synthetic Drive responses.
    const rootId = "ReadFixtureOrganization123";
    remote.set(rootId, { metadata: { id: rootId, name: "Organization fixture", mimeType: "application/vnd.google-apps.folder", parents: ["root"], trashed: false }, bytes: Buffer.alloc(0) });
    const customer = await prisma.cliente.create({ data: { razonSocial: "Shared read client" } }); clientId = customer.id;
    const cause = await prisma.causa.create({ data: { titulo: "Read fixture", materia: "civil", tribunal: "Fixture", acceso: "equipo", clienteId: clientId, abogadoId: owner.id, miembros: { create: { userId: staff.id, rol: "lectura" } } } }); cases.push(cause.id);
    const otherCause = await prisma.causa.create({ data: { titulo: "Other read fixture", materia: "civil", tribunal: "Fixture", acceso: "equipo", clienteId: clientId, abogadoId: owner.id } }); cases.push(otherCause.id);
    const options = { client: prisma, account };
    await configureOrganizationDrive(owner, { action: "root", folderRef: rootId, connectionId: account.connectionId, bindingRevision: account.bindingRevision, revision: "", confirmed: true }, options);
    const organization = await organizationDriveState(owner, options);
    const prepare = (id: string) => configureOrganizationDrive(owner, { action: "organize", kind: "causa", id, revision: organization.revision, confirmed: true }, options);
    const folderId = (await prepare(cause.id)).folder!.id, otherFolderId = (await prepare(otherCause.id)).folder!.id;
    const fileId = "SharedCaseReadFile123", bytes = Buffer.from("Only this case's selected fictitious document");
    const metadata = { id: fileId, name: "selected.txt", mimeType: "text/plain", parents: [folderId], version: "1", trashed: false, size: String(bytes.length), md5Checksum: createHash("md5").update(bytes).digest("hex"), capabilities: { canDownload: true } };
    remote.set(fileId, { metadata, bytes });
    foreignMetadata = { ...metadata, id: "OtherCaseReadFile123", parents: [otherFolderId] };
    remote.set(String(foreignMetadata.id), { metadata: foreignMetadata, bytes: Buffer.from("Other case fixture") });
    const readOptions = async (user = owner) => ({ ...await driveImportDependenciesForActor(cause.id, user), fetch: fetcher, enqueue: () => true });
    const selected = () => ({ causaId: cause.id, folderId, fileId, version: metadata.version });
    const listed = await listDriveImportCandidates(cause.id, staff, null, await readOptions(staff));
    assert.deepEqual(listed.files.map(file => file.id), [fileId], "an overbroad provider response cannot expose another case's document");
    await assert.rejects(driveImportDependenciesForActor(otherCause.id, staff), (e: unknown) => (e as { status?: number }).status === 404);
    const saved = await importSelectedDriveFile(selected(), owner, await readOptions());
    assert.ok(saved.documentoId);
    assert.equal((await importSelectedDriveFile(selected(), owner, await readOptions())).documentoId, saved.documentoId, "recovery stays in this cause");
    const beforeForeign = downloads;
    await assert.rejects(importSelectedDriveFile({ ...selected(), fileId: String(foreignMetadata.id) }, owner, await readOptions()), /carpeta elegida/);
    assert.equal(downloads, beforeForeign, "foreign bytes are rejected before download");

    const resetAccount = () => prisma.integrationConfig.update({ where: { provider: "google" }, data: { enabled: true, configJson: JSON.stringify(config) } });
    const disconnect = () => prisma.integrationConfig.update({ where: { provider: "google" }, data: { enabled: false } });
    const staleList = await readOptions();
    afterList = disconnect;
    await assert.rejects(listDriveImportCandidates(cause.id, owner, null, staleList), /conexión.*cambió/i, "revoked shared-account listings must not escape");
    const beforeRecovery = downloads;
    await assert.rejects(importSelectedDriveFile(selected(), owner, staleList), (e: unknown) => (e as { code?: string }).code === "disabled", "an old receipt cannot bypass a disconnected account");
    assert.equal(downloads, beforeRecovery);
    await resetAccount();
    metadata.version = "2";
    const count = await prisma.documento.count({ where: { causaId: cause.id } });
    afterDownload = disconnect;
    await assert.rejects(importSelectedDriveFile(selected(), owner, await readOptions()), /conexión.*cambió/i, "disconnect during the body read must prevent persistence");
    assert.equal(await prisma.documento.count({ where: { causaId: cause.id } }), count);
    await resetAccount();
    afterDownload = () => prisma.integrationConfig.update({ where: { provider: "google" }, data: { configJson: JSON.stringify({ ...config, connectedEmail: "replacement@example.invalid" }) } });
    await assert.rejects(importSelectedDriveFile(selected(), owner, await readOptions()), /conexión.*cambió/i, "a replacement grant cannot inherit old document bytes");
    assert.equal(await prisma.documento.count({ where: { causaId: cause.id } }), count);
    await resetAccount();
    afterList = () => prisma.integrationConfig.update({ where: { provider: "google" }, data: { configJson: JSON.stringify({ ...config, syncDrive: false }) } });
    await assert.rejects(listDriveImportCandidates(cause.id, owner, null, await readOptions()), /conexión.*cambió/i, "disabling only Drive also revokes an in-flight listing");
    await resetAccount();
    afterList = () => prisma.driveSyncSubscription.update({ where: { causaId: cause.id }, data: { generation: { increment: 1 } } });
    await assert.rejects(listDriveImportCandidates(cause.id, owner, null, await readOptions()), /carpeta.*cambió/i, "an obsolete folder selection cannot return a prior page");
    afterList = () => prisma.causa.update({ where: { id: cause.id }, data: { googleDriveFolderId: otherFolderId } });
    await assert.rejects(listDriveImportCandidates(cause.id, owner, null, await readOptions()), /carpeta.*cambió/i);
    await prisma.causa.update({ where: { id: cause.id }, data: { googleDriveFolderId: folderId } });
    let rootReads = 0;
    afterFolder = async id => {
      if (id === folderId && ++rootReads === 2) await prisma.causaMiembro.updateMany({ where: { causaId: cause.id, userId: staff.id }, data: { hasta: new Date(0) } });
    };
    await assert.rejects(listDriveImportCandidates(cause.id, staff, null, await readOptions(staff)), (e: unknown) => (e as { status?: number }).status === 404, "revocation during final folder validation cannot return cached names");
    afterFolder = undefined;
    await prisma.integrationConfig.update({ where: { provider: "google" }, data: { enabled: false } });
    await assert.rejects(account.assertActive()); await assert.rejects(studyGmailToken(owner.id, "study@example.invalid"));
    console.log("Shared Google PG: exact case-parent lists/imports/recovery, no foreign download, in-flight grant/folder/access revocation, reserved writes and admin-only shared inbox OK; no real Google");
  } finally {
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.driveSyncSubscription.deleteMany({ where: { causaId: { in: cases } } });
    await prisma.driveDocumentImport.deleteMany({ where: { causaId: { in: cases } } });
    await prisma.documento.deleteMany({ where: { causaId: { in: cases } } });
    await prisma.causa.deleteMany({ where: { id: { in: cases } } });
    if (clientId) await prisma.cliente.delete({ where: { id: clientId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    if (prior) await prisma.integrationConfig.update({ where: { provider: "google" }, data: { enabled: prior.enabled, configJson: prior.configJson } }); else await prisma.integrationConfig.deleteMany({ where: { provider: "google" } });
    await prisma.$disconnect();
    await rm(storage, { recursive: true, force: true });
    if (oldStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = oldStorage;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
