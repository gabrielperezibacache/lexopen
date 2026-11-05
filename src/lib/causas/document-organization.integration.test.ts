/** PostgreSQL-only fixture for filing and citation continuity. No remote account or model. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { automaticAltazorSources } from "@/lib/altazor/automatic-context";
import { resolveAltazorSources, verifyAltazorSources } from "@/lib/altazor/resources";
import { prisma } from "@/lib/db";
import { pushDocumentoToDrive } from "@/lib/integrations/google";
import { encryptGoogleToken } from "@/lib/integrations/google-crypto";
import { putObject } from "@/lib/storage";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { organizeCaseDocuments } from "./document-organization";

const status = (expected: number) => (error: unknown) => (error as { status?: number }).status === expected;

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  assert.ok(![process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean));
  const storage = await mkdtemp(path.join(tmpdir(), "lexopen-case-organizer-"));
  const previousStorage = process.env.STORAGE_PATH;
  process.env.STORAGE_PATH = storage;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("No external connection in this test"); };
  const tag = randomUUID(), users: string[] = [], cases: string[] = [], documents: string[] = [];

  try {
    async function addUser(name: string, role = "abogado") {
      const user = await prisma.user.create({ data: { name, role, email: `${tag}-${name}@organization.invalid`, password: "fixture-no-login" } });
      users.push(user.id);
      return user;
    }
    const owner = await addUser("Titular");
    const assistant = await addUser("Ayudante", "asistente");
    const outsider = await addUser("Otro");
    async function addCase(name: string) {
      const cause = await prisma.causa.create({ data: { titulo: name, materia: "civil", tribunal: "Órgano ficticio", abogadoId: owner.id, acceso: "equipo" } });
      cases.push(cause.id);
      return cause;
    }
    const cause = await addCase("Principal"), foreign = await addCase("Distinto");
    await prisma.causaMiembro.create({ data: { causaId: cause.id, userId: assistant.id, rol: "colaborador", desde: new Date(0) } });
    const organize = (action: Parameters<typeof organizeCaseDocuments>[2]) => organizeCaseDocuments(cause.id, owner, action);
    async function newFolder(name: string, parentId: string | null = null, causaId = cause.id) {
      const result = await organizeCaseDocuments(causaId, owner, { action: "create-folder", name, parentId });
      assert.ok(result.folder);
      return result.folder;
    }
    const archive = await newFolder("Evidencia");
    const child = await newFolder("Prueba de pago", archive.id);
    const external = await newFolder("Otra carpeta", null, foreign.id);
    await assert.rejects(newFolder("evidencia"), status(409));
    await assert.rejects(organize({ action: "move-folder", folderId: archive.id, parentId: child.id }), status(409));
    await assert.rejects(organize({ action: "move-folder", folderId: archive.id, parentId: external.id }), status(404));
    await assert.rejects(organizeCaseDocuments(cause.id, outsider, { action: "create-folder", name: "Sin permiso", parentId: null }), status(404));
    await organize({ action: "rename-folder", folderId: child.id, name: "Comprobantes" });
    await organize({ action: "move-folder", folderId: child.id, parentId: null });
    const organized = await prisma.caseDocumentFolder.findUniqueOrThrow({ where: { id: child.id } });
    assert.equal(organized.name, "Comprobantes");
    assert.equal(organized.parentId, null);

    async function newDocument(name: string, causaId = cause.id, confidencial = false) {
      const content = `Nebulosa es el comprobante ficticio del pago en ${name}.`;
      const doc = await prisma.documento.create({ data: { nombre: name, contenido: content, extractedMarkdown: content, extractionStatus: "completed", mimeType: "text/plain", causaId, autorId: owner.id, confidencial } });
      documents.push(doc.id);
      return doc;
    }
    const manual = await newDocument("manual.txt");
    const pjud = await newDocument("ojv.txt");
    const drive = await newDocument("drive.txt");
    const restricted = await newDocument("reservado.txt", cause.id, true);
    const wrongCase = await newDocument("otro expediente.txt", foreign.id);
    const movement = await prisma.causaMovimiento.create({ data: { causaId: cause.id, titulo: "Resolución de prueba", fuente: "pjud", documentoRef: `doc:${pjud.id}`, fecha: new Date() } });
    const receipt = await prisma.pjudDocumentJob.create({ data: { causaId: cause.id, movimientoId: movement.id, status: "saved", sourceRefHash: tag, documentoId: pjud.id } });
    const driveReceipt = await prisma.driveDocumentImport.create({ data: { causaId: cause.id, documentoId: drive.id, folderId: "fixture-folder", driveFileId: tag, driveVersion: "2", exportMimeType: "", sourceSha256: tag } });

    const prepared: Awaited<ReturnType<typeof automaticAltazorSources>>[] = [];
    for (const doc of [manual, pjud, drive]) {
      prepared.push(await automaticAltazorSources(owner, { causaId: cause.id, documentoId: doc.id, text: "Revisa el pago Nebulosa" }));
    }
    for (const sources of prepared) assert.ok(sources.some(source => source.kind === "document" && source.quote.includes("Nebulosa")));
    const citations = await Promise.all(prepared.map(sources => resolveAltazorSources(owner, sources, { causaId: cause.id })));
    await assert.rejects(organize({ action: "move-documents", documentIds: [manual.id, wrongCase.id], folderId: child.id }), status(404));
    await assert.rejects(organizeCaseDocuments(cause.id, assistant, { action: "move-documents", documentIds: [manual.id, restricted.id], folderId: child.id }), status(404));
    assert.equal(await prisma.caseDocumentPlacement.count({ where: { documentoId: manual.id } }), 0, "mixed unauthorized move is atomic");
    const ids = [manual.id, pjud.id, drive.id];
    assert.deepEqual(await organize({ action: "move-documents", documentIds: ids, folderId: child.id }), { moved: 3 });
    assert.equal(await prisma.caseDocumentPlacement.count({ where: { folderId: child.id } }), 3);
    assert.deepEqual(await organize({ action: "move-documents", documentIds: ids, folderId: child.id }), { moved: 0 });
    assert.equal(await prisma.documento.count({ where: { causaId: cause.id } }), 4);
    assert.deepEqual(await prisma.pjudDocumentJob.findUniqueOrThrow({ where: { id: receipt.id } }), receipt);
    assert.deepEqual(await prisma.driveDocumentImport.findUniqueOrThrow({ where: { id: driveReceipt.id } }), driveReceipt);
    for (const [index, doc] of [manual, pjud, drive].entries()) {
      assert.deepEqual(await prisma.documento.findUniqueOrThrow({ where: { id: doc.id } }), doc);
      assert.deepEqual(await verifyAltazorSources(owner, citations[index].refs, { causaId: cause.id }), citations[index]);
      await assert.rejects(verifyAltazorSources(outsider, citations[index].refs, { causaId: cause.id }), status(404));
    }
    await organize({ action: "move-documents", documentIds: ids, folderId: null });
    assert.equal(await prisma.caseDocumentPlacement.count({ where: { folderId: child.id } }), 0);

    const priorConfig = await prisma.integrationConfig.findUnique({ where: { provider: "google" } });
    const mockConfig = JSON.stringify({ syncDrive: true, accessToken: encryptGoogleToken("local-fixture-only"), tokenExpiresAt: Date.now() + 3600_000 });
    const driveFolderId = `Folder_${tag}`;
    await prisma.causa.update({ where: { id: cause.id }, data: { googleDriveFolderId: driveFolderId } });
    await prisma.integrationConfig.upsert({
      where: { provider: "google" }, create: { provider: "google", enabled: true, configJson: mockConfig },
      update: { enabled: true, configJson: mockConfig },
    });
    try {
      const original = Buffer.from("Original binario de demostración. Se mantiene byte por byte.");
      const storageKey = `fixtures/${tag}/original.txt`;
      await putObject({ key: storageKey, body: original });
      const source = await prisma.documento.update({ where: { id: manual.id }, data: { storageKey } });
      const hash = createHash("sha256").update(original).digest("hex");
      let generated = 0, uploadCalls = 0;
      const provider = new Map<string, { id: string; name: string; parents: string[]; sha256Checksum: string; trashed: boolean }>();
      globalThis.fetch = async (resource, init) => {
        const requested = new URL(String(resource));
        assert.equal(requested.hostname, "www.googleapis.com");
        if (requested.pathname.endsWith("/generateIds")) {
          generated++;
          return Response.json({ ids: [`ReservedFile_${generated}_${tag}`] });
        }
        if (requested.pathname.startsWith("/upload/") && init?.method === "POST") {
          uploadCalls++;
          const body = Buffer.from(init.body as Uint8Array).toString();
          const match = body.match(/\r\n\r\n({[^\r\n]+})\r\n/);
          assert.ok(match);
          const metadata = JSON.parse(match[1]);
          assert.deepEqual(metadata.parents, [driveFolderId]);
          assert.equal(metadata.mimeType, "text/plain");
          assert.ok(body.includes(original.toString()));
          if (provider.has(metadata.id)) return Response.json({ error: "reserved id already exists" }, { status: 409 });
          provider.set(metadata.id, { ...metadata, sha256Checksum: hash, trashed: false });
          throw new Error("Fixture: lost response after Drive created the file");
        }
        const found = provider.get(requested.pathname.split("/").at(-1)!);
        return found ? Response.json(found) : new Response(null, { status: 404 });
      };
      const copy = () => pushDocumentoToDrive(manual.id, { role: owner.role, scopedCopy: { actorId: owner.id, folderId: driveFolderId } });
      await assert.rejects(copy(), /lost response/);
      assert.equal((await prisma.documento.findUniqueOrThrow({ where: { id: manual.id } })).googleDriveId, null);
      const retry = await Promise.allSettled([copy(), copy()]);
      assert.ok(retry.some(result => result.status === "fulfilled" && result.value.status === "uploaded"));
      assert.equal(provider.size, 1, "concurrent retries preserve the same remote file");
      assert.equal(generated, 1, "a failed response keeps the same durable reservation");
      assert.ok(uploadCalls >= 2);
      const filed = await prisma.documento.findUniqueOrThrow({ where: { id: manual.id } });
      assert.equal(filed.storageKey, storageKey);
      assert.equal(filed.updatedAt.getTime(), source.updatedAt.getTime(), "a copy leaves the evidence revision identity stable");
      assert.ok(filed.googleDriveId && provider.has(filed.googleDriveId));
    } finally {
      if (priorConfig) {
        await prisma.integrationConfig.update({ where: { provider: "google" }, data: { enabled: priorConfig.enabled, configJson: priorConfig.configJson } });
      } else await prisma.integrationConfig.delete({ where: { provider: "google" } });
    }
    console.log("Case organizer: folder hierarchy, ACL, atomic filing, citation continuity and idempotent Drive copy after an ambiguous response passed.");
  } finally {
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: users }, key: { startsWith: "drive-original:" } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.documento.deleteMany({ where: { id: { in: documents } } });
    await prisma.causa.deleteMany({ where: { id: { in: cases } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    globalThis.fetch = originalFetch;
    if (previousStorage === undefined) delete process.env.STORAGE_PATH;
    else process.env.STORAGE_PATH = previousStorage;
    await rm(storage, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
