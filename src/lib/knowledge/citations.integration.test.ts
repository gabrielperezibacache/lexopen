/** Real, disposable PostgreSQL/storage; no model, Google or public network. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { captureDocumentEvidence, captureSiteFileEvidence } from "@/lib/evidence/service";
import { sha256 } from "@/lib/evidence/fragments";
import { S3Client } from "@aws-sdk/client-s3";
import { getObject, getObjectBounded, putObject, MAX_STORAGE_OBJECT_BYTES } from "@/lib/storage";
import { importLegalSource } from "@/lib/research/service";
import { resolveCitation, toStoredCitation, verifyStoredCitation } from "./citations";

assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Citation integration requires isolated local storage");
const status = (expected: number) => (error: unknown) => (error as { status?: number }).status === expected;

async function testBoundedStorage(directory: string) {
  const bytes = Buffer.alloc(128 * 1024 + 123, 97), key = "bounded/chunks.bin";
  await putObject({ key, body: bytes });
  assert.deepEqual(await getObjectBounded(key, bytes.length), bytes);
  await assert.rejects(getObjectBounded(key, bytes.length - 1), status(413));
  assert.equal(await getObjectBounded("missing-original", 10), null);
  assert.equal(await getObjectBounded("../outside", 10), null);
  await assert.rejects(getObjectBounded(key, 0), RangeError);

  // Exercise growth after stat using a real file and real read handles. Only
  // this fixture's stat is wrapped; no document or database IO is substituted.
  const growingKey = "bounded/growing.bin", growingPath = path.join(directory, growingKey);
  await putObject({ key: growingKey, body: "tiny" });
  const priorOpen = fs.open;
  fs.open = (async (...args: Parameters<typeof fs.open>) => {
    const handle = await priorOpen(...args);
    if (String(args[0]) === growingPath) {
      const realStat = handle.stat.bind(handle);
      handle.stat = (async (...statArgs: Parameters<typeof handle.stat>) => {
        const beforeGrowth = await realStat(...statArgs);
        await appendFile(growingPath, Buffer.alloc(64, 98));
        return beforeGrowth;
      }) as typeof handle.stat;
    }
    return handle;
  }) as typeof fs.open;
  try { await assert.rejects(getObjectBounded(growingKey, 16), status(413)); }
  finally { fs.open = priorOpen; }

  // S3 wire behavior is explicitly simulated; there is no live bucket or
  // credential lookup. Check cancellation on both declared and streamed size.
  const names = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ENDPOINT"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const priorSend = S3Client.prototype.send;
  let response: { Body: { transformToWebStream: () => ReadableStream<Uint8Array> }; ContentLength?: number };
  let cancelled = false, pulls = 0, calls = 0;
  const fixture = (chunks: Uint8Array[], contentLength?: number) => {
    cancelled = false; pulls = 0;
    return { ContentLength: contentLength, Body: { transformToWebStream: () => new ReadableStream<Uint8Array>({ pull(controller) { pulls++; const chunk = chunks.shift(); if (chunk) controller.enqueue(chunk); else controller.close(); }, cancel() { cancelled = true; } }) } };
  };
  process.env.S3_BUCKET = "knowledge-fixture-only"; process.env.S3_ACCESS_KEY_ID = "fixture-public-access"; process.env.S3_SECRET_ACCESS_KEY = "fixture-public-secret"; delete process.env.S3_ENDPOINT;
  S3Client.prototype.send = (async () => { calls++; return response; }) as typeof S3Client.prototype.send;
  try {
    response = fixture([Buffer.alloc(8)], 11);
    await assert.rejects(getObjectBounded("known-too-large", 10), status(413)); assert.equal(cancelled, true);
    response = fixture([Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8)]);
    await assert.rejects(getObjectBounded("stream-too-large", 10), status(413)); assert.equal(cancelled, true); assert.ok(pulls <= 3);
    response = fixture([Buffer.from("1234"), Buffer.from("567890")], 10);
    assert.equal((await getObjectBounded("exact-size", 10))!.toString(), "1234567890");
    assert.equal(calls, 3);
  } finally {
    S3Client.prototype.send = priorSend;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
}

async function main() {
  const tag = randomUUID(), users: string[] = [], cases: string[] = [];
  const directory = await mkdtemp(path.join(tmpdir(), "lexopen-knowledge-citations-"));
  const previousStorage = process.env.STORAGE_PATH, previousOcr = process.env.OCR_ENABLED;
  process.env.STORAGE_PATH = directory; delete process.env.OCR_ENABLED;
  let siteId = "", legalSourceId = "";
  try {
    await testBoundedStorage(directory);
    const owner = await prisma.user.create({ data: { name: "Citation owner fixture", email: `${tag}@knowledge-citation.invalid`, password: "unused", role: "abogado" } }); users.push(owner.id);
    const member = await prisma.user.create({ data: { name: "Citation reader fixture", email: `${tag}-member@knowledge-citation.invalid`, password: "unused", role: "abogado" } }); users.push(member.id);
    const outsider = await prisma.user.create({ data: { name: "Citation excluded fixture", email: `${tag}-other@knowledge-citation.invalid`, password: "unused", role: "abogado" } }); users.push(outsider.id);
    const portal = await prisma.user.create({ data: { name: "Citation portal fixture", email: `${tag}-portal@knowledge-citation.invalid`, password: "unused", role: "cliente" } }); users.push(portal.id);
    const matter = await prisma.causa.create({ data: { titulo: `Private citation matter ${tag}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id, miembros: { create: { userId: member.id, rol: "lectura" } } } }); cases.push(matter.id);
    const otherMatter = await prisma.causa.create({ data: { titulo: `Other citation matter ${tag}`, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); cases.push(otherMatter.id);
    const site = await prisma.site.create({ data: { name: "Private citation space", slug: `citation-${tag}`, causaId: matter.id } }); siteId = site.id;
    const quote = "El contrato fue firmado el 12 de mayo de 2025.";
    const whole = `😀 ${"Antecedente ficticio. ".repeat(150)}\n\n${quote}`;
    const doc = await prisma.documento.create({ data: { nombre: "UTF-16 citation fixture.txt", contenido: whole, extractedMarkdown: whole, extractionStatus: "completed", causaId: matter.id, autorId: owner.id } });
    const capture = await captureDocumentEvidence(doc.id, owner);
    const version = await prisma.documentEvidenceVersion.findUniqueOrThrow({ where: { id: capture.id }, include: { fragments: { orderBy: { ordinal: "asc" } } } });
    const fragment = version.fragments.find(row => row.text.includes(quote)); assert.ok(fragment); assert.ok(fragment.startOffset > 0);
    assert.equal(whole.slice(fragment.startOffset, fragment.endOffset), fragment.text);
    assert.ok(Array.from(whole.slice(0, fragment.startOffset)).length < fragment.startOffset, "An astral character precedes this JS/UTF-16 offset");
    const input = { kind: "document" as const, fragmentId: fragment.id, quote };
    const resolved = await resolveCitation(input, owner, { causaId: matter.id });
    assert.equal(resolved.quote, quote); assert.equal(resolved.isCurrent, true); assert.equal(resolved.pageNumber, null); assert.equal(resolved.resourceId, version.resourceId);
    assert.equal(resolved.sourceKind, "case_document"); assert.equal(resolved.causaId, matter.id); assert.match(resolved.href, new RegExp(`/documentos/${doc.id}/fuentes`));
    const stored = toStoredCitation(resolved);
    assert.deepEqual(toStoredCitation(await verifyStoredCitation(stored, owner, { causaId: matter.id })), stored);
    await assert.rejects(resolveCitation({ ...input, quote: "Una cita inventada" }, owner), status(409));
    await assert.rejects(resolveCitation(input, owner, { causaId: otherMatter.id }), status(404));
    await assert.rejects(resolveCitation(input, owner, { publicOnly: true }), status(404));
    await assert.rejects(resolveCitation(input, outsider), status(404));
    await assert.rejects(resolveCitation(input, portal), status(403));
    for (const changes of [{ versionId: "changed-version" }, { quoteSha256: "0".repeat(64) }, { textSha256: "0".repeat(64) }, { sourceSha256: "0".repeat(64) }, { sourceKey: "0".repeat(64) }, { quote: "Altered quotation" }, { pageNumber: 2 }]) {
      await assert.rejects(verifyStoredCitation({ ...stored, ...changes }, owner), status(409));
    }
    const transactionValue = await prisma.$transaction(tx => resolveCitation(input, owner, { causaId: matter.id, client: tx, cache: new Map() }));
    assert.equal(transactionValue.sourceKey, stored.sourceKey);

    // Expected whole-text hash and JS offsets must both agree, independently of
    // the fragment's own hash or literal quote match.
    await prisma.documentEvidenceVersion.update({ where: { id: version.id }, data: { extractedText: `${whole} tampered` } });
    await assert.rejects(resolveCitation(input, owner), status(409));
    await prisma.documentEvidenceVersion.update({ where: { id: version.id }, data: { extractedText: whole } });
    await prisma.documentEvidenceFragment.update({ where: { id: fragment.id }, data: { startOffset: fragment.startOffset - 1, endOffset: fragment.endOffset - 1 } });
    await assert.rejects(resolveCitation(input, owner), status(409));
    await prisma.documentEvidenceFragment.update({ where: { id: fragment.id }, data: { startOffset: fragment.startOffset, endOffset: fragment.endOffset } });
    await prisma.documentEvidenceVersion.update({ where: { id: version.id }, data: { textSha256: "0".repeat(64) } });
    await assert.rejects(resolveCitation(input, owner), status(409));
    await prisma.documentEvidenceVersion.update({ where: { id: version.id }, data: { textSha256: version.textSha256 } });
    const oversizedText = "x".repeat(2_000_001);
    await prisma.documentEvidenceVersion.update({ where: { id: version.id }, data: { extractedText: oversizedText, textSha256: sha256(oversizedText) } });
    await assert.rejects(resolveCitation(input, owner), status(409));
    await prisma.documentEvidenceVersion.update({ where: { id: version.id }, data: { extractedText: whole, textSha256: version.textSha256 } });
    const original = await getObject(version.sourceStorageKey!); assert.ok(original);
    await putObject({ key: version.sourceStorageKey!, body: "changed retained source" });
    await assert.rejects(resolveCitation(input, owner), status(409));
    await putObject({ key: version.sourceStorageKey!, body: original });
    await writeFile(path.join(directory, version.sourceStorageKey!), Buffer.alloc(MAX_STORAGE_OBJECT_BYTES + 1));
    await assert.rejects(resolveCitation(input, owner), status(409));
    await putObject({ key: version.sourceStorageKey!, body: original });
    await rm(path.join(directory, version.sourceStorageKey!), { force: true });
    await assert.rejects(resolveCitation(input, owner), status(409));
    await putObject({ key: version.sourceStorageKey!, body: original });

    // An optimization cache is never an authorization cache, even with a stale
    // actor value retained by the caller after capability or membership changes.
    const shared = new Map<string, unknown>(); await resolveCitation(input, member, { cache: shared });
    await prisma.causaMiembro.deleteMany({ where: { causaId: matter.id, userId: member.id } });
    await assert.rejects(resolveCitation(input, member, { cache: shared }), status(404));
    await assert.rejects(resolveCitation(input, outsider, { cache: shared }), status(404));
    await resolveCitation(input, owner, { cache: shared });
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    await assert.rejects(resolveCitation(input, owner, { cache: shared }), status(403));
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    await prisma.documento.update({ where: { id: doc.id }, data: { confidencial: true } });
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "doc.confidential.read" } });
    await assert.rejects(resolveCitation(input, owner, { cache: shared }), status(404));
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    await prisma.documento.update({ where: { id: doc.id }, data: { confidencial: false } });
    await prisma.causa.update({ where: { id: matter.id }, data: { abogadoId: outsider.id } });
    await assert.rejects(resolveCitation(input, owner, { cache: shared }), status(404));
    await prisma.causa.update({ where: { id: matter.id }, data: { abogadoId: owner.id } });
    const oldAfterRecordChange = await verifyStoredCitation(stored, owner);
    assert.equal(oldAfterRecordChange.isCurrent, false, "Changed source-record revision does not silently make an old citation current");
    await prisma.documentEvidenceVersion.update({ where: { id: version.id }, data: { sourceRevision: "legacy" } });
    assert.equal((await verifyStoredCitation(stored, owner)).isCurrent, false, "A legacy snapshot is not current after a source record changed, even without another capture");
    const nextText = "El contrato fue firmado el 14 de mayo de 2025.";
    await prisma.documento.update({ where: { id: doc.id }, data: { version: 2, contenido: nextText, extractedMarkdown: nextText } });
    const nextCapture = await captureDocumentEvidence(doc.id, owner); assert.notEqual(nextCapture.id, version.id);
    const nextFragment = await prisma.documentEvidenceFragment.findFirstOrThrow({ where: { versionId: nextCapture.id } });
    assert.equal((await resolveCitation({ kind: "document", fragmentId: nextFragment.id, quote: nextText }, owner)).isCurrent, true);
    assert.equal((await verifyStoredCitation(stored, owner)).isCurrent, false);
    assert.equal((await getObject(version.sourceStorageKey!))!.toString(), whole);

    const pdf = await readFile(path.join(process.cwd(), "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf"));
    const pdfKey = `knowledge-citation/${tag}/physical.pdf`; await putObject({ key: pdfKey, body: pdf, contentType: "application/pdf" });
    const file = await prisma.siteFile.create({ data: { siteId, name: "Physical citation fixture.pdf", mimeType: "application/pdf", storageKey: pdfKey, sizeBytes: pdf.length } });
    const pdfCapture = await captureSiteFileEvidence(siteId, file.id, owner);
    const page = await prisma.documentEvidencePage.findFirstOrThrow({ where: { versionId: pdfCapture.id, pageNumber: 2 } });
    const pdfFragment = await prisma.documentEvidenceFragment.findFirst({ where: { versionId: pdfCapture.id, pageId: page.id } });
    if (process.env.LEXOPEN_PDF_REQUIRE_TOOLS === "1") { assert.equal(page.method, "ocr"); assert.ok(pdfFragment); }
    if (pdfFragment) {
      const pdfInput = { kind: "document" as const, fragmentId: pdfFragment.id, quote: pdfFragment.text };
      const physical = await resolveCitation(pdfInput, owner, { causaId: matter.id, siteId });
      assert.equal(physical.sourceKind, "space_file"); assert.equal(physical.pageNumber, 2); assert.equal(physical.extractionMethod, "ocr"); assert.match(physical.href, /page=2/); assert.ok(physical.warnings.some(warning => /OCR/.test(warning)));
      const pinned = toStoredCitation(physical);
      await prisma.documentEvidencePage.update({ where: { id: page.id }, data: { textSha256: "0".repeat(64) } });
      await assert.rejects(resolveCitation(pdfInput, owner), status(409));
      await prisma.documentEvidencePage.update({ where: { id: page.id }, data: { textSha256: page.textSha256, pageNumber: 4 } });
      await assert.rejects(verifyStoredCitation(pinned, owner), status(409));
      await prisma.documentEvidencePage.update({ where: { id: page.id }, data: { pageNumber: 2 } });
      assert.equal((await verifyStoredCitation(pinned, owner)).sourceKey, pinned.sourceKey);
      await assert.rejects(resolveCitation(pdfInput, owner, { causaId: otherMatter.id }), status(404));
      await assert.rejects(resolveCitation(pdfInput, owner, { publicOnly: true }), status(404));
    }

    const legalUrl = `https://www.bcn.cl/leychile/navegar?idNorma=${8_000_000_000 + Number.parseInt(tag.slice(0, 7), 16)}`;
    const legalText = `Texto público ficticio: una fuente identificada para probar citas literales. ${tag}`;
    const legal = await importLegalSource({ canonicalUrl: legalUrl, retrievalUrl: legalUrl, title: "Fuente jurídica ficticia", organism: "Fixture identificada", kind: "legislation", text: legalText, rawBytes: Buffer.from(legalText), mimeType: "text/plain", retrievedAt: new Date(), coverageWarnings: [], acquisitionMethod: "manual" }, owner); legalSourceId = legal.sourceId;
    const legalFragment = await prisma.legalSourceFragment.findFirstOrThrow({ where: { versionId: legal.id } });
    const publicInput = { kind: "legal" as const, fragmentId: legalFragment.id, quote: "una fuente identificada" };
    const legalCitation = await resolveCitation(publicInput, owner, { publicOnly: true });
    assert.equal(legalCitation.resourceId, null); assert.equal(legalCitation.acquisitionMethod, "manual"); assert.ok(legalCitation.warnings.some(warning => /manual/.test(warning)));
    assert.equal(legalCitation.isCurrent, true); assert.equal(legalCitation.pageNumber, null);
    assert.equal((await verifyStoredCitation(toStoredCitation(legalCitation), owner, { causaId: matter.id })).sourceKey, legalCitation.sourceKey);
    await assert.rejects(resolveCitation({ ...publicInput, quote: "una interpretación inventada" }, owner), status(409));
    const raw = await prisma.legalSourceVersion.findUniqueOrThrow({ where: { id: legal.id } });
    assert.equal(raw.sourceSha256, sha256(legalText));
    await prisma.legalSourceVersion.update({ where: { id: legal.id }, data: { text: `${legalText} changed` } });
    await assert.rejects(resolveCitation(publicInput, owner), status(409));
    await prisma.legalSourceVersion.update({ where: { id: legal.id }, data: { text: legalText } });
    await putObject({ key: raw.sourceStorageKey!, body: "changed legal original" });
    await assert.rejects(resolveCitation(publicInput, owner), status(409));
    console.log("knowledge citations PostgreSQL OK: exact literal/whole text/original SHA, UTF-16 offsets after emoji, pinned key/hash/page integrity, private case/space/public scope, stale actor+cache ACL/capability revocation, old revision retained, physical PDF OCR, manual legal provenance, no network or model");
  } finally {
    if (legalSourceId) await prisma.legalSource.deleteMany({ where: { id: legalSourceId } });
    if (siteId) await prisma.site.deleteMany({ where: { id: siteId } });
    await prisma.causa.deleteMany({ where: { id: { in: cases } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect(); await rm(directory, { recursive: true, force: true });
    if (previousStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = previousStorage;
    if (previousOcr === undefined) delete process.env.OCR_ENABLED; else process.env.OCR_ENABLED = previousOcr;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
