import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractBook, readBookZip, BOOK_MAX_BYTES } from "./formats";
import { readBookUpload } from "./ingest";
import { sha256 } from "@/lib/evidence/fragments";
const status = (value: number) => (e: unknown) => (e as { status?: number }).status === value;
async function main() {
  const fixture = (ext: string) => readFile(path.join(process.cwd(), `src/lib/books/fixtures/juridical-fixture.${ext}`));
  const text = Buffer.from("📚 Primera cláusula jurídica.\n\nLa buena fe rige el contrato.");
  const plain = await extractBook("tratado.txt", text); assert.equal(plain.text, text.toString()); assert.equal(plain.pageCount, null); assert.equal(plain.locatorKind, "text-offset");
  for (const f of plain.fragments) { assert.equal(plain.text.slice(f.startOffset, f.endOffset), f.text); assert.equal(sha256(f.text), f.textSha256); assert.equal(f.pageNumber, null); }
  const epub = await extractBook("tratado.epub", await fixture("epub")); assert.equal(epub.locatorKind, "epub-section"); assert.equal(epub.pageCount, null); assert.equal(epub.fragments.every(f => f.pageNumber === null), true); assert.ok(epub.text.indexOf("buena fe") < epub.text.indexOf("prueba")); assert.match(epub.fragments[0].locatorLabel, /Sección 1/);
  const docx = await extractBook("doctrina.docx", await fixture("docx")); assert.ok(docx.text.trim()); assert.equal(docx.pageCount, null);
  const html = await extractBook("doctrina.html", Buffer.from('<html><head><title>Ignore</title></head><body><h1>Capítulo</h1><script>fetch("https://evil.invalid")</script><p>Una cita &amp; el contrato</p></body></html>')); assert.match(html.text, /Una cita & el contrato/); assert.doesNotMatch(html.text, /fetch|Ignore/);
  await assert.rejects(extractBook("bad.txt", Buffer.from([0xff, 0xfe, 0x00])), status(422));
  await assert.rejects(extractBook("unknown.exe", Buffer.from("text")), status(415));
  await assert.rejects(extractBook("too-large.txt", Buffer.alloc(BOOK_MAX_BYTES + 1)), status(413));
  await assert.rejects(extractBook("empty.txt", Buffer.from("   ")), status(422));
  await assert.rejects(extractBook("xxe.xml", Buffer.from('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>')), status(422));
  const zip = await fixture("epub");
  const encrypted = Buffer.from(zip), central = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 1, central + 8); assert.throws(() => readBookZip(encrypted), status(422));
  const bomb = Buffer.from(zip); bomb.writeUInt32LE(40 * 1024 * 1024, central + 24); assert.throws(() => readBookZip(bomb), status(413));
  const unsafe = Buffer.from(zip); const name = Buffer.from("META-INF/container.xml"); let offset = -1; while ((offset = unsafe.indexOf(name, offset + 1)) >= 0) unsafe.write("../../../../secret.xml", offset, "utf8"); assert.throws(() => readBookZip(unsafe));
  const form = new FormData(); form.set("file", new File([text], "Tratado.txt")); form.set("requestId", "fixture-request-123"); form.set("author", "Autor ficticio");
  const upload = await readBookUpload(new Request("http://fixture.invalid", { method: "POST", body: form })); assert.equal(upload.title, "Tratado"); assert.equal(upload.author, "Autor ficticio"); assert.deepEqual(upload.bytes, text);
  let cancelled = false; const oversized = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
  await assert.rejects(readBookUpload(new Request("http://fixture.invalid", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=fixture" }, body: oversized, duplex: "half" } as RequestInit)), status(413)); assert.equal(cancelled, true);
  const pdf = await extractBook("physical.pdf", await readFile("src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf")); assert.equal(pdf.locatorKind, "pdf-page"); assert.equal(pdf.pageCount, 3); assert.ok(pdf.fragments.some(f => f.pageNumber === 2)); for (const f of pdf.fragments) assert.equal(pdf.text.slice(f.startOffset, f.endOffset), f.text);
  console.log("Book formats PASS: UTF8/Unicode exact offsets, EPUB spine order and section locators, DOCX, safe HTML, PDF physical/OCR page2, unsupported/encrypted/XXE/traversal/size abstention and chunked multipart bounded/cancelled; no remote fetch.");
}
void main().catch(e => { console.error(e); process.exitCode = 1; });
