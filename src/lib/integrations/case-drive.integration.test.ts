/** Disposable PostgreSQL + a fake motor. Never authorizes or writes to a real Drive account. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { seal, digest } from "@/lib/personal-connectors/core";
import { computerOperationHash } from "@/lib/altazor/computer/operation-hash";
import { easyConnectionName } from "@/lib/altazor/connectors/easy-oauth";
import { resolveAltazorDriveAccount, type DriveWriteReceipt } from "@/lib/altazor/connectors/drive-management";
import { putObject } from "@/lib/storage";
import { caseDriveState, linkAltazorDriveFolder, runCaseDriveCommand } from "./case-drive";
import { configureDriveSync, getDriveSyncSettings, listPersonalDriveFolders, processDueDriveSyncSubscriptions } from "./drive-sync";

const rejected = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const priorEnv = { ...process.env }, originalFetch = globalThis.fetch, root = await mkdtemp(path.join(os.tmpdir(), "lexopen-case-drive-")), tag = randomUUID().replaceAll("-", "");
  Object.assign(process.env, { ALTAZOR_COMPUTER_ENABLED: "1", APP_URL: "http://127.0.0.1:9999", ALTAZOR_GOOGLE_CLIENT_ID: "123456789-fixture.apps.googleusercontent.com", ALTAZOR_GOOGLE_CLIENT_SECRET: "fictitious-application-parameter", STORAGE_PATH: root });
  const users: string[] = [], cases: string[] = [], workspaceId = randomUUID(), accountId = randomUUID(), accountRevision = "a".repeat(64);
  const folderId = `Folder_${tag}`, sourceFileId = `Source_${tag}`, body = Buffer.from("Synthetic original for case Drive and RAG."), sha = createHash("sha256").update(body).digest("hex");
  let alias = "", commandCalls = 0, readCalls = 0, loseNextAck = false, malformedRead = false, metadataMissing = false, ledgerUnknown = false, rejectNextCommand = false, revokeBeforeCommand = false, wrongSubject = false;
  const receipts = new Map<string, DriveWriteReceipt>(), remote = new Map<string, { id: string; parents: string[]; version: string; name: string; mimeType: string }>();
  const failures = new Map<string, Record<string, unknown>>();
  const fileMetadata = (fileId: string) => ({ ...(remote.get(fileId) || { id: fileId, parents: [folderId], version: "1", name: "Fuente.txt", mimeType: "text/plain" }), trashed: false, size: String(body.length), sha256Checksum: sha, capabilities: { canDownload: true } });
  try {
    const owner = await prisma.user.create({ data: { email: `${tag}@case-drive.invalid`, name: "Case Drive owner", password: "not-a-login", role: "abogado" } }); users.push(owner.id);
    const reader = await prisma.user.create({ data: { email: `${tag}-reader@case-drive.invalid`, name: "Case Drive reader", password: "not-a-login", role: "abogado" } }); users.push(reader.id);
    const other = await prisma.user.create({ data: { email: `${tag}-other@case-drive.invalid`, name: "Case Drive other", password: "not-a-login", role: "abogado" } }); users.push(other.id);
    const cause = await prisma.causa.create({ data: { titulo: "Synthetic managed Drive", tribunal: "Fixture", materia: "Fixture", acceso: "equipo", abogadoId: owner.id, miembros: { create: [{ userId: reader.id, rol: "lectura" }, { userId: other.id, rol: "colaborador" }] } } }); cases.push(cause.id);
    const second = await prisma.causa.create({ data: { titulo: "Separate synthetic cause", tribunal: "Fixture", materia: "Fixture", acceso: "equipo", abogadoId: owner.id } }); cases.push(second.id);
    const credentialEnc = seal({ token: "fictitious-motor-only-token" }, `altazor:computer:${owner.id}:${workspaceId}:personal`);
    const workspace = await prisma.altazorComputerWorkspace.create({ data: { id: workspaceId, ownerId: owner.id, scopeKey: "personal", enabled: true, endpoint: "http://127.0.0.1:19917", providerName: "fixture-model", credentialEnc, dedicatedDeclaredAt: new Date() } });
    alias = easyConnectionName(owner.id, workspaceId, "google");
    const scopes = ["https://www.googleapis.com/auth/drive"], workspaceBinding = computerOperationHash(owner.id, workspaceId, "oauth-workspace", { scope: "personal", causaId: null, endpoint: workspace.endpoint, credentialEnc, provider: workspace.providerName });
    await prisma.personalConnectorAccount.create({ data: { id: accountId, ownerId: owner.id, provider: `altazor-desktop:${workspaceId}:google`, clientId: process.env.ALTAZOR_GOOGLE_CLIENT_ID!, externalSubject: digest("fixture-google-subject"), name: "Synthetic Google", status: "connected", grantedScopesJson: JSON.stringify(scopes), credentialsEnc: seal({ workspaceBinding, connectionName: alias, expiresAt: null, scopes, autoRefresh: true }, `altazor:desktop:connection:${owner.id}:${accountId}`) } });
    globalThis.fetch = (async (raw, init) => {
      const url = new URL(String(raw)); assert.equal(url.origin, workspace.endpoint, "never contact a real provider");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-motor-only-token");
      if (url.pathname === "/v1/health") return Response.json({ ok: true, lexopen_drive_management: "v1" });
      assert.ok(url.pathname.startsWith(`/v1/lexopen/drive/${alias}/`));
      if (url.pathname.endsWith("/status")) {
        if (revokeBeforeCommand && await prisma.commandExecution.count({ where: { ownerId: owner.id, status: "running" } })) { revokeBeforeCommand = false; await prisma.causa.update({ where: { id: second.id }, data: { abogadoId: other.id } }); }
        return Response.json({ alias, access: "manage", can_read_files: true, can_manage_files: true, account_revision: accountRevision, account_subject_hash: digest(wrongSubject ? "another-subject" : "fixture-google-subject"), scopes });
      }
      const request = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.pathname.endsWith("/read")) {
        readCalls++; assert.equal(request.bindingRevision, accountRevision); assert.equal(request.query.supportsAllDrives, undefined); assert.equal(request.query.includeItemsFromAllDrives, undefined);
        let bytes: Buffer;
        const fileId = request.path.split("/")[4];
        if (metadataMissing && remote.has(fileId)) return Response.json({ error: "synthetic missing" }, { status: 404 });
        if (request.query.alt === "media") bytes = body;
        else if (request.path === "/drive/v3/files") bytes = Buffer.from(JSON.stringify(request.query.q?.includes("mimeType=") ? { files: [{ id: folderId, name: "Carpeta de prueba", mimeType: "application/vnd.google-apps.folder", trashed: false }], incompleteSearch: false } : { files: [fileMetadata(sourceFileId)], incompleteSearch: false }));
        else if (fileId === folderId || fileId?.startsWith("Created_")) bytes = Buffer.from(JSON.stringify({ id: fileId, name: "Carpeta de prueba", mimeType: "application/vnd.google-apps.folder", trashed: false, parents: ["Actual_root_123"] }));
        else bytes = Buffer.from(JSON.stringify(fileMetadata(fileId)));
        return Response.json({ status: 200, mime: "application/json", body_base64: bytes.toString("base64"), bytes: bytes.length, sha256: malformedRead ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex") });
      }
      if (url.pathname.endsWith("/commands") && init?.method === "POST") {
        commandCalls++;
        const claim = await prisma.commandExecution.findFirst({ where: { ownerId: owner.id, status: "running", resultJson: { contains: request.request_id } } });
        assert.ok(claim, "Host receipt must commit before any outgoing mutation");
        assert.equal(claim.resultJson!.includes(body.toString("base64")), false); assert.equal(claim.resultJson!.includes(body.toString("utf8")), false);
        if (rejectNextCommand) { rejectNextCommand = false; failures.set(request.request_id, { state: "failed", request_id: request.request_id, context_key: request.context_key, account_revision: request.bindingRevision, alias }); return Response.json({ error: "Synthetic revision changed before writing" }, { status: 409 }); }
        const bytes = Buffer.from(request.content_base64 || "", "base64"), newId = request.action === "create_folder" ? `Created_${tag}_${commandCalls}` : `Uploaded_${tag}_${commandCalls}`;
        const receipt: DriveWriteReceipt = { schema: "lexopen-drive-write.v1", state: "drive_verified", request_id: request.request_id, context_key: request.context_key, account_revision: accountRevision, alias, action: request.action, folder_id: request.folder_id, parent_id: request.folder_id === "root" ? "Actual_root_123" : request.folder_id, file_id: newId, name: request.name, mime: request.action === "create_folder" ? "application/vnd.google-apps.folder" : request.mime, bytes: bytes.length, ...(request.action === "create_folder" ? {} : { sha256: request.sha256 }), ...(request.action === "save_version" ? { previous_file_id: request.file_id, previous_version: request.expected_version } : {}) };
        remote.set(newId, { id: newId, name: request.name, mimeType: receipt.mime, parents: [request.folder_id], version: "1" }); receipts.set(request.request_id, receipt);
        if (loseNextAck) { loseNextAck = false; throw Error("Synthetic lost acknowledgement, never repeat"); }
        return Response.json({ state: "drive_verified", request_id: request.request_id, receipt });
      }
      const requestId = url.pathname.split("/")[6];
      if (failures.has(requestId)) return Response.json(failures.get(requestId));
      if (url.pathname.endsWith("/reconcile")) return Response.json({ state: "drive_verified", request_id: requestId, receipt: receipts.get(requestId) });
      if (url.pathname.includes("/commands/")) return Response.json({ state: ledgerUnknown ? "unknown" : receipts.has(requestId) ? "drive_verified" : "not_found", request_id: requestId, ...(!ledgerUnknown && receipts.has(requestId) ? { receipt: receipts.get(requestId) } : {}) });
      throw Error("Unexpected fake motor endpoint");
    }) as typeof fetch;
    const account = await resolveAltazorDriveAccount(owner); assert.ok(account); assert.equal(account.connectionId, accountId);
    wrongSubject = true; await assert.rejects(resolveAltazorDriveAccount(owner)); assert.equal(readCalls, 0); assert.equal(commandCalls, 0); wrongSubject = false;
    const folders = await listPersonalDriveFolders(cause.id, owner, {}); assert.equal(folders.account, "altazor"); assert.equal(folders.folders[0].id, folderId);
    await linkAltazorDriveFolder(cause.id, owner, { folderRef: folderId, connectionId: accountId, bindingRevision: accountRevision, caseRevision: folders.caseRevision! });
    const settings = await getDriveSyncSettings(cause.id, owner); assert.equal(settings.account, "altazor");
    const enabled = await configureDriveSync(cause.id, owner, { ...settings, connectionId: settings.connectionId || undefined, bindingRevision: settings.bindingRevision || undefined, account: "altazor", enabled: true });
    await assert.rejects(configureDriveSync(cause.id, owner, { ...settings, connectionId: settings.connectionId || undefined, bindingRevision: settings.bindingRevision || undefined, account: "altazor", enabled: true }), rejected(409));
    const pulled = await processDueDriveSyncSubscriptions({ causaId: cause.id, limit: 1, enqueue: () => true }); assert.equal(pulled[0].imported, 1);
    await assert.rejects(linkAltazorDriveFolder(cause.id, other, { folderRef: folderId, connectionId: "other-account", bindingRevision: accountRevision, caseRevision: (await caseDriveState(cause.id, owner)).caseRevision }, { account: { ...account, ownerId: other.id, connectionId: "other-account", assertActive: async () => {} } }), rejected(403));
    await configureDriveSync(cause.id, owner, { ...enabled, connectionId: enabled.connectionId || undefined, bindingRevision: enabled.bindingRevision || undefined, account: "altazor", enabled: false });
    const state = await caseDriveState(cause.id, owner), create = { action: "create-folder" as const, requestId: randomUUID(), connectionId: accountId, bindingRevision: accountRevision, caseRevision: state.caseRevision, nombre: "Nueva carpeta", confirmed: true as const };
    await assert.rejects(runCaseDriveCommand(cause.id, reader, create), rejected(403));
    const created = await runCaseDriveCommand(cause.id, owner, create); assert.equal(created.state, "completed"); assert.ok(created.folder); assert.equal(commandCalls, 1);
    assert.deepEqual(await runCaseDriveCommand(cause.id, owner, create), created); assert.equal(commandCalls, 1);
    await assert.rejects(runCaseDriveCommand(cause.id, owner, { ...create, requestId: randomUUID() }), rejected(409));
    const storageKey = `fixture/${tag}/draft.txt`; await putObject({ key: storageKey, body, contentType: "text/plain" });
    const document = await prisma.documento.create({ data: { nombre: "Escrito.txt", mimeType: "text/plain", tipo: "otro", storageKey, causaId: cause.id, autorId: owner.id } });
    const preview = await caseDriveState(cause.id, owner, {}, document.id); assert.ok("document" in preview); assert.equal(preview.document.canSave, true);
    const upload = { action: "upload-document" as const, requestId: randomUUID(), connectionId: accountId, bindingRevision: accountRevision, caseRevision: preview.caseRevision, documentoId: document.id, documentVersion: document.version, sourceSha256: sha, confirmed: true as const };
    await assert.rejects(runCaseDriveCommand(cause.id, owner, { ...upload, sourceSha256: "0".repeat(64) }), rejected(409)); assert.equal(commandCalls, 1);
    const copied = await runCaseDriveCommand(cause.id, owner, upload); assert.equal(copied.state, "completed"); assert.ok(copied.file); assert.equal(commandCalls, 2);
    assert.deepEqual(await runCaseDriveCommand(cause.id, owner, upload), copied); assert.equal(commandCalls, 2);
    const versionPreview = await caseDriveState(cause.id, owner, {}, document.id); assert.ok("document" in versionPreview); assert.equal(versionPreview.document.remoteTargetState, "ready");
    const version = { ...upload, action: "save-version" as const, requestId: randomUUID(), fileId: versionPreview.document.remoteId!, expectedVersion: versionPreview.document.remoteVersion! };
    const saved = await runCaseDriveCommand(cause.id, owner, version); assert.equal(saved.state, "completed"); assert.notEqual(saved.file!.id, copied.file!.id); assert.equal(saved.file!.previousFileId, copied.file!.id); assert.ok(remote.has(copied.file!.id));
    metadataMissing = true; const unavailable = await caseDriveState(cause.id, owner, {}, document.id); assert.ok("document" in unavailable); assert.equal(unavailable.document.remoteTargetState, "unavailable"); assert.equal(unavailable.document.canSave, false); metadataMissing = false;
    await assert.rejects(runCaseDriveCommand(cause.id, owner, { ...upload, requestId: randomUUID() }), rejected(409));
    const secondDoc = await prisma.documento.create({ data: { nombre: "Segunda.txt", mimeType: "text/plain", tipo: "otro", storageKey, causaId: cause.id, autorId: owner.id } });
    const lost = { ...upload, requestId: randomUUID(), documentoId: secondDoc.id }; loseNextAck = true;
    const unknown = await runCaseDriveCommand(cause.id, owner, lost); assert.equal(unknown.state, "unknown"); const afterLost = commandCalls;
    assert.equal((await runCaseDriveCommand(cause.id, owner, lost)).state, "unknown"); assert.equal(commandCalls, afterLost);
    await assert.rejects(runCaseDriveCommand(cause.id, owner, { ...lost, requestId: randomUUID() }), rejected(409)); assert.equal(commandCalls, afterLost);
    const pending = await caseDriveState(cause.id, owner); assert.equal(pending.pendingOperation!.documentoId, secondDoc.id); assert.equal(pending.pendingOperation!.requestId, lost.requestId);
    ledgerUnknown = true;
    const reconciled = await runCaseDriveCommand(cause.id, owner, { action: "reconcile", requestId: lost.requestId, connectionId: accountId, bindingRevision: accountRevision, confirmed: true }); assert.equal(reconciled.state, "completed"); assert.equal(commandCalls, afterLost, "reconciliation never repeats provider mutation"); ledgerUnknown = false;
    const thirdDoc = await prisma.documento.create({ data: { nombre: "Tercera.txt", mimeType: "text/plain", tipo: "otro", storageKey, causaId: cause.id, autorId: owner.id } });
    const denied = { ...upload, requestId: randomUUID(), documentoId: thirdDoc.id }; rejectNextCommand = true;
    assert.equal((await runCaseDriveCommand(cause.id, owner, denied)).state, "unknown");
    const failedCount = commandCalls;
    assert.equal((await runCaseDriveCommand(cause.id, owner, { action: "reconcile", requestId: denied.requestId, connectionId: accountId, bindingRevision: accountRevision, confirmed: true })).state, "failed");
    assert.equal(commandCalls, failedCount); assert.equal((await caseDriveState(cause.id, owner)).pendingOperation, undefined);
    assert.equal((await runCaseDriveCommand(cause.id, owner, { ...denied, requestId: randomUUID() })).state, "completed", "a verified pre-write failure permits a newly reviewed action");
    const secondState = await caseDriveState(second.id, owner), beforeRevocation = commandCalls; revokeBeforeCommand = true;
    await assert.rejects(runCaseDriveCommand(second.id, owner, { ...create, requestId: randomUUID(), caseRevision: secondState.caseRevision }), rejected(409));
    assert.equal(commandCalls, beforeRevocation, "revocation between claim and motor POST stops before mutation");
    await prisma.causa.update({ where: { id: second.id }, data: { abogadoId: owner.id } });
    const preCancelled = new AbortController(); preCancelled.abort();
    const beforeCancellation = commandCalls, claimsBeforeCancellation = await prisma.commandExecution.count({ where: { ownerId: owner.id } });
    const cancelInput = { ...create, requestId: randomUUID(), caseRevision: (await caseDriveState(second.id, owner)).caseRevision };
    await assert.rejects(runCaseDriveCommand(second.id, owner, cancelInput, { signal: preCancelled.signal }));
    assert.equal(commandCalls, beforeCancellation); assert.equal(await prisma.commandExecution.count({ where: { ownerId: owner.id } }), claimsBeforeCancellation, "pre-cancellation never claims an operation");
    const midCancelled = new AbortController(); let authorizations = 0;
    const cancelled = { ...cancelInput, requestId: randomUUID() };
    await assert.rejects(runCaseDriveCommand(second.id, owner, cancelled, { signal: midCancelled.signal, authorizeContext: async () => {
      authorizations++;
      if (authorizations === 1) assert.equal(await prisma.commandExecution.count({ where: { ownerId: owner.id, status: "running" } }), 0, "authorization runs before claiming, outside a transaction");
      else { assert.equal(await prisma.commandExecution.count({ where: { ownerId: owner.id, status: "running" } }), 1); midCancelled.abort(); }
    } }), rejected(409));
    assert.equal(authorizations, 2); assert.equal(commandCalls, beforeCancellation, "cancellation after preparation prevents the motor mutation");
    const cancelledRecord = await prisma.commandExecution.findFirstOrThrow({ where: { ownerId: owner.id, key: { endsWith: `:${cancelled.requestId}` } } });
    assert.equal(cancelledRecord.status, "failed", "a cancelled pre-write claim cannot remain unknown");
    malformedRead = true; await assert.rejects((await account.openTransport()).get(`/${folderId}?fields=id,name,mimeType,trashed,parents`, 32768)); malformedRead = false;
    await prisma.causaMiembro.deleteMany({ where: { causaId: cause.id, userId: reader.id } });
    await assert.rejects(caseDriveState(cause.id, reader), rejected(404));
    await prisma.personalConnectorAccount.update({ where: { id: accountId }, data: { status: "disconnected" } });
    const readsBeforeDisconnect = readCalls; await assert.rejects(listPersonalDriveFolders(cause.id, owner, {})); assert.equal(readCalls, readsBeforeDisconnect, "an invalid existing Altazor account never borrows a legacy account");
    console.log("Case Drive PG PASS: canonical account, no token export, folder selection/pull, ACL, stale snapshots, durable preclaim, exact copies, version preservation, idempotency, lost ACK reconciliation and invalid-account isolation.");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.documento.deleteMany({ where: { causaId: { in: cases } } });
    await prisma.causa.deleteMany({ where: { id: { in: cases } } });
    await prisma.personalConnectorAccount.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerWorkspace.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect(); await rm(root, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in priorEnv)) delete process.env[key]; Object.assign(process.env, priorEnv);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
