import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { putObject } from "@/lib/storage";
import { caseDriveState, runCaseDriveCommand } from "./case-drive";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { configureOrganizationDrive, organizationDriveState, organizedDriveName } from "./drive-organization";
import type { ManagedDriveAccount, DriveWriteReceipt } from "@/lib/altazor/connectors/drive-management";
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const storage = await mkdtemp(path.join(os.tmpdir(), "google-shared-test-")), oldStorage = process.env.STORAGE_PATH;
  process.env.STORAGE_PATH = storage;
  const tag = randomUUID(), users: string[] = [], cases: string[] = [], sites: string[] = [];
  let clientId: string | undefined;
  const remote = new Map<string, { id: string; name: string; parents: string[]; mime?: string }>();
  const receipts = new Map<string, DriveWriteReceipt>();
  let commands = 0, loseAck = false, uncertain = false, rejectNext = false;
  const rejectedRequests = new Set<string>();
  const rootId = "RootOrganization12345";
  remote.set(rootId, { id: rootId, name: "Estudio de prueba", parents: ["root"] });
  try {
    const owner = await prisma.user.create({ data: { name: "Owner fixture", email: `${tag}@organization.invalid`, password: "not-a-login", role: "admin" } }); users.push(owner.id);
    const portal = await prisma.user.create({ data: { name: "Portal fixture", email: `${tag}-portal@organization.invalid`, password: "not-a-login", role: "cliente" } }); users.push(portal.id);
    const customer = await prisma.cliente.create({ data: { razonSocial: "Cliente / con nombre común" } }); clientId = customer.id;
    const cause = await prisma.causa.create({ data: { titulo: "Primera causa", materia: "civil", tribunal: "Fixture", clienteId: clientId, abogadoId: owner.id } }); cases.push(cause.id);
    const second = await prisma.causa.create({ data: { titulo: "Segunda causa", materia: "civil", tribunal: "Fixture", clienteId: clientId, abogadoId: owner.id } }); cases.push(second.id);
    const workspace = await prisma.site.create({ data: { name: "Espacio cliente", slug: `org-${tag}`, clienteId: clientId } }); sites.push(workspace.id);
    const account: ManagedDriveAccount = { source: "study", ownerId: owner.id, workspaceId: "workspace", connectionId: "connection", bindingRevision: "a".repeat(64), proofRevision: "b".repeat(64), canRead: true, canManage: true,
      assertActive: async () => {}, openTransport: async () => ({ close() {}, async get(path) { const id = path.split("?")[0].slice(1); const item = remote.get(id); if (!item) throw Error("remote folder missing"); return Buffer.from(JSON.stringify({ ...item, mimeType: item.mime || "application/vnd.google-apps.folder", version: "1", trashed: false })); } }),
      async command(command, before) {
        await before?.(); commands++;
        if (rejectNext) { rejectNext = false; rejectedRequests.add(command.request_id); throw Error("synthetic rejected command with lost response"); }
        const id = `CreatedFolder_${commands.toString().padStart(10, "0")}`;
        remote.set(id, { id, name: command.name, parents: [command.folder_id], mime: command.mime });
        const receipt: DriveWriteReceipt = { schema: "lexopen-drive-write.v1", state: "drive_verified", request_id: command.request_id, context_key: command.context_key, account_revision: command.bindingRevision, alias: "fixture", action: command.action, folder_id: command.folder_id, file_id: id, name: command.name, mime: command.mime || "application/vnd.google-apps.folder", bytes: command.content_base64 ? Buffer.from(command.content_base64, "base64").length : 0, ...(command.sha256 ? { sha256: command.sha256 } : {}) };
        receipts.set(command.request_id, receipt);
        if (loseAck) { loseAck = false; throw Error("synthetic lost acknowledgement"); }
        return receipt;
      }, async reconcile(id: string) { return rejectedRequests.has(id) ? { state: "failed" as const } : uncertain ? null : receipts.get(id) || null; },
    };
    const options = { client: prisma, account };
    const choose = { action: "root" as const, folderRef: rootId, connectionId: account.connectionId, bindingRevision: account.bindingRevision, revision: "", confirmed: true as const };
    await assert.rejects(configureOrganizationDrive(portal, choose, options), (e: unknown) => (e as { status?: number }).status === 403);
    await configureOrganizationDrive(owner, choose, options);
    const first = await organizationDriveState(owner, options);
    await configureOrganizationDrive(owner, { ...choose, revision: first.revision }, options);
    assert.equal((await organizationDriveState(owner, options)).revision, first.revision, "selecting same root is idempotent");
    const organize = { action: "organize" as const, kind: "causa" as const, id: cause.id, revision: first.revision, confirmed: true as const };
    loseAck = true;
    await assert.rejects(configureOrganizationDrive(owner, organize, options), /lost acknowledgement/);
    uncertain = true; assert.equal((await configureOrganizationDrive(owner, organize, options)).state, "unknown"); assert.equal(commands, 1);
    uncertain = false;
    const prepared = await configureOrganizationDrive(owner, organize, options);
    assert.equal(prepared.state, "completed"); assert.equal(commands, 4, "resumes without recreating the first node");
    assert.equal((await prisma.causa.findUniqueOrThrow({ where: { id: cause.id } })).googleDriveFolderId, prepared.folder!.id);
    await configureOrganizationDrive(owner, organize, options); assert.equal(commands, 4, "linked cause is reused");
    await configureOrganizationDrive(owner, { ...organize, id: second.id }, options); assert.equal(commands, 5, "second cause reuses the client's folders");
    await configureOrganizationDrive(owner, { ...organize, kind: "site", id: workspace.id }, options); assert.equal(commands, 7, "workspace uses separate group under same client");
    const clientFolder = [...remote.values()].find(row => row.name.includes("Cliente" ) && row.name !== "Clientes")!;
    clientFolder.parents = ["MovedOutsideOrganization123"];
    await assert.rejects(configureOrganizationDrive(owner, { ...organize, kind: "site", id: workspace.id }, options), /movida/);
    assert.equal(commands, 7);
    await assert.rejects(configureOrganizationDrive(owner, { ...organize, revision: randomUUID() }, options), (e: unknown) => (e as { status?: number }).status === 409);
    clientFolder.parents = [[...remote.values()].find(row => row.name === "Clientes")!.id];
    const colleague = await prisma.user.create({ data: { name: "Colleague fixture", email: `${tag}-colleague@organization.invalid`, password: "not-a-login", role: "abogado" } }); users.push(colleague.id);
    const colleagueAccount = { ...account, ownerId: colleague.id, connectionId: account.connectionId };
    const colleagueOptions = { client: prisma, account: colleagueAccount };
    await assert.rejects(configureOrganizationDrive(colleague, { ...choose, revision: first.revision }, colleagueOptions), (e: unknown) => (e as { status?: number }).status === 403);
    const colleagueRoot = await organizationDriveState(colleague, colleagueOptions);
    await assert.rejects(organizationDriveState(colleague, colleagueOptions, { parentId: "root" }), (e: unknown) => (e as { status?: number }).status === 403);
    const third = await prisma.causa.create({ data: { titulo: "Tercera causa", materia: "civil", tribunal: "Fixture", clienteId: clientId, abogadoId: colleague.id } }); cases.push(third.id);
    await configureOrganizationDrive(colleague, { ...organize, id: third.id, revision: colleagueRoot.revision }, colleagueOptions);
    assert.equal(commands, 8, "different professionals reuse the verified shared hierarchy");
    const personal = await configureOrganizationDrive(owner, { ...organize, kind: "user", id: owner.id }, options);
    assert.equal(personal.state, "completed"); assert.equal(commands, 10);
    await configureOrganizationDrive(owner, { ...organize, kind: "user", id: owner.id }, options); assert.equal(commands, 10);
    await assert.rejects(configureOrganizationDrive(owner, { ...organize, kind: "user", id: portal.id }, options), (e: unknown) => (e as { status?: number }).status === 403);
    const colleaguePersonal = { ...organize, kind: "user" as const, id: colleague.id, revision: colleagueRoot.revision };
    rejectNext = true;
    await assert.rejects(configureOrganizationDrive(colleague, colleaguePersonal, colleagueOptions), /rejected command/);
    await assert.rejects(configureOrganizationDrive(colleague, colleaguePersonal, colleagueOptions), /rechazó/);
    const recovered = await configureOrganizationDrive(colleague, colleaguePersonal, colleagueOptions);
    assert.equal(recovered.state, "completed"); assert.equal(commands, 12, "only a confirmed failed command can be retried with a new request ID");
    const documentKey = `shared-google/${tag}/copy.txt`;
    await putObject({ key: documentKey, body: Buffer.from("Shared exact copy"), contentType: "text/plain" });
    const document = await prisma.documento.create({ data: { nombre: "copy.txt", storageKey: documentKey, mimeType: "text/plain", causaId: third.id, autorId: colleague.id } });
    await prisma.driveSyncSubscription.update({ where: { causaId: third.id }, data: { ownerId: owner.id, enabled: true } });
    const preview = await caseDriveState(third.id, colleague, colleagueOptions, document.id);
    assert.ok("document" in preview && preview.document);
    assert.equal(preview.canConfigure, false, "the other professional retains control of active sync");
    assert.equal(preview.document!.canSave, true, "authorized shared-account writers can still save documents");
    const copied = await runCaseDriveCommand(third.id, colleague, { action: "upload-document", requestId: randomUUID(), connectionId: account.connectionId, bindingRevision: account.bindingRevision, caseRevision: preview.caseRevision, documentoId: document.id, documentVersion: preview.document!.version, sourceSha256: preview.document!.sourceSha256, confirmed: true }, colleagueOptions);
    assert.equal(copied.state, "completed");
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "causa.write" } });
    await assert.rejects(configureOrganizationDrive(owner, organize, options), (e: unknown) => (e as { status?: number }).status === 403);
    assert.ok(Buffer.byteLength(organizedDriveName("ñ".repeat(300), cause.id)) <= 180);
    assert.ok(!/[\/\\\p{Cc}\p{Cf}]/u.test(organizedDriveName("../ a\u0000/b\\c", cause.id)));
    console.log("Organization Drive: admin-owned shared root, cause/client/workspace hierarchy, stable identities, reuse, lost acknowledgement/reconciliation, moved-folder rejection and revocation OK; no real Google");
  } finally {
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.driveSyncSubscription.deleteMany({ where: { causaId: { in: cases } } });
    await prisma.site.deleteMany({ where: { id: { in: sites } } });
    await prisma.documento.deleteMany({ where: { causaId: { in: cases } } });
    await prisma.causa.deleteMany({ where: { id: { in: cases } } });
    if (clientId) await prisma.cliente.delete({ where: { id: clientId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect();
    await rm(storage, { recursive: true, force: true });
    if (oldStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = oldStorage;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
