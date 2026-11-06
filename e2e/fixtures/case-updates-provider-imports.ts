import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { importSelectedDriveFile } from "../../src/lib/integrations/drive-import";
import { parseMimeBuffer } from "../../src/lib/mail/mime";
import { pjudDocumentRefHash } from "../../src/lib/pjud/document-identity";
import { ingestPjudDocumentBuffer } from "../../src/lib/pjud/pdf-backup";
import { assertDisposableDatabaseUrl } from "../../src/lib/testing/disposable-db";

async function run() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(new URL(process.env.DATABASE_URL!).toString(), url);
  assert.ok(path.isAbsolute(process.env.STORAGE_PATH || ""), "A disposable local storage directory is required");
  assert.ok(![process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean));
  const [causaId, documentoId] = process.argv.slice(2);
  const cause = await prisma.causa.findUniqueOrThrow({ where: { id: causaId }, include: { abogado: true } });
  const owner = cause.abogado;
  assert.ok(owner && cause.titulo === "Novedades de la causa ficticia");
  const original = await prisma.documento.findFirstOrThrow({ where: { id: documentoId, causaId } });
  assert.equal(original.version, 1);

  globalThis.fetch = async () => { throw new Error("Browser fixtures must not use external providers"); };
  const mail = await parseMimeBuffer(await readFile(path.join(process.cwd(), "src/lib/mail/fixtures/pjud-notice.eml")));
  const bytes = mail.attachments[0]!.content;
  const folderId = `NovedadesFolder_${causaId}`;
  const fileId = `NovedadesFile_${documentoId}`;
  await prisma.causa.update({ where: { id: causaId }, data: {
    googleDriveFolderId: folderId,
    pjudMonitoreoActivo: true,
    pjudDocumentDownloadsEnabled: true,
    pjudDocumentDownloadOwnerId: owner.id,
  } });
  const settings = await prisma.firmSettings.findFirstOrThrow({ select: { id: true, caseManagementMode: true } });
  if (settings.caseManagementMode !== "pjud_cl") {
    await prisma.firmSettings.update({ where: { id: settings.id }, data: { caseManagementMode: "pjud_cl" } });
  }

  try {
    let body = bytes;
    let version = "7";
    let name = "Resolución de Drive.pdf";
    const fixtureFetch: typeof fetch = async (input, init) => {
      const resource = new URL(String(input));
      assert.equal(resource.origin, "https://www.googleapis.com");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-only");
      if (resource.pathname === `/drive/v3/files/${folderId}`) {
        return Response.json({ id: folderId, mimeType: "application/vnd.google-apps.folder", trashed: false });
      }
      assert.equal(resource.pathname, `/drive/v3/files/${fileId}`);
      if (resource.searchParams.get("alt") === "media") return new Response(new Uint8Array(body));
      return Response.json({
        id: fileId, name, version, mimeType: "application/pdf", size: String(body.length), parents: [folderId],
        trashed: false, sha256Checksum: createHash("sha256").update(body).digest("hex"), capabilities: { canDownload: true },
      });
    };
    const importDrive = () => importSelectedDriveFile({ causaId, folderId, fileId, version }, owner, {
      fetch: fixtureFetch,
      session: async () => ({ scopes: ["https://www.googleapis.com/auth/drive.file"], syncDrive: true, syncCalendar: false, accessToken: "fixture-only" }),
      enqueue: () => true,
    });
    assert.equal((await importDrive()).documentoId, documentoId);
    const repeat = await importDrive();
    assert.equal(repeat.documentoId, documentoId);
    assert.equal(repeat.reused, true);

    const ref = "https://oficinajudicialvirtual.pjud.cl/resolucion-ficticia.pdf?ticket=ejemplo";
    const movement = await prisma.causaMovimiento.create({ data: {
      causaId, titulo: "Resolución ficticia de OJV", documentoRef: ref, fuente: "pjud", fecha: new Date(),
    } });
    await prisma.pjudDocumentJob.create({ data: {
      causaId, movimientoId: movement.id, actorId: owner.id, status: "pending",
      sourceRefHash: pjudDocumentRefHash(causaId, movement.id, ref),
    } });
    const importOjv = () => ingestPjudDocumentBuffer({
      causaId, movimientoId: movement.id, bytes, filename: "Resolucion-OJV.pdf", requireReceipt: true, enqueue: () => true,
    });
    assert.equal(await importOjv(), documentoId);
    assert.equal(await importOjv(), documentoId);
    const saved = await prisma.pjudDocumentJob.findUniqueOrThrow({ where: { movimientoId: movement.id } });
    assert.equal(saved.status, "saved");
    assert.equal(saved.documentoId, documentoId);

    body = Buffer.concat([bytes, Buffer.from("\n% Fixture de la revision 8\n")]);
    version = "8";
    name = "Resolución Drive revisión 8.pdf";
    const revised = await importDrive();
    assert.notEqual(revised.documentoId, documentoId);
    assert.equal((await importDrive()).documentoId, revised.documentoId);
    assert.equal(await prisma.documento.count({ where: { causaId } }), 2);
    return revised.documentoId;
  } finally {
    if (settings.caseManagementMode !== "pjud_cl") {
      await prisma.firmSettings.update({ where: { id: settings.id }, data: { caseManagementMode: settings.caseManagementMode } });
    }
  }
}

void run().then(documentoId => console.log(JSON.stringify({ documentoId }))).catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
