import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPlainDocx } from "./docx";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", R = "http://schemas.openxmlformats.org/package/2006/relationships";
const base: Record<string, string> = {
  "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="${R}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t xml:space="preserve">Hello &amp; fictitious only</w:t></w:r></w:p></w:body></w:document>`,
  "word/styles.xml": `<?xml version="1.0"?><w:styles xmlns:w="${W}"/>`,
  "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships xmlns="${R}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
};
function crc(bytes: Buffer) { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let n = 0; n < 8; n++) value = value >>> 1 ^ (value & 1 ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; }
/** Tiny stored-ZIP fixture writer; no execution, extraction or external references are followed. */
function archive(parts: Record<string, string>) {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    const file = Buffer.from(name), data = Buffer.from(text), sum = crc(data), local = Buffer.alloc(30), record = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(sum, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(file.length, 26);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt32LE(sum, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(file.length, 28); record.writeUInt32LE(offset, 42);
    locals.push(local, file, data); central.push(record, file); offset += local.length + file.length + data.length;
  }
  const records = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(records.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, records, end]);
}
test("inert OOXML fixture is accepted; XML text remains literal", () => assert.doesNotThrow(() => assertPlainDocx(archive(base))));
test("allowed ZIP part names cannot hide an external relationship", () => {
  const relation = `<?xml version="1.0"?><Relationships xmlns="${R}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="https://example.invalid/" TargetMode="External"/></Relationships>`;
  assert.throws(() => assertPlainDocx(archive({ ...base, "word/_rels/document.xml.rels": relation })));
  assert.throws(() => assertPlainDocx(archive({ ...base, "word/_rels/document.xml.rels": relation.replace("External", "&#x45;xternal") })));
});
test("fields, DDE, INCLUDETEXT, objects, altChunk and DTD are refused", () => {
  for (const field of ['<w:fldSimple w:instr="INCLUDETEXT https://example.invalid"/>', '<w:instrText>DDEAUTO</w:instrText>', '<w:object/>', '<w:altChunk/>']) assert.throws(() => assertPlainDocx(archive({ ...base, "word/document.xml": base["word/document.xml"].replace("<w:p>", field + "<w:p>") })));
  assert.throws(() => assertPlainDocx(archive({ ...base, "word/document.xml": '<!DOCTYPE x [<!ENTITY e SYSTEM "https://example.invalid/">]>' + base["word/document.xml"] })));
});
test("local/central disagreement, corrupted CRC, inflated size and trailing payload are refused", () => {
  const mismatch = archive(base); mismatch.write("X", 30); assert.throws(() => assertPlainDocx(mismatch));
  const corrupted = archive(base); corrupted[corrupted.indexOf("Hello")] = 74; assert.throws(() => assertPlainDocx(corrupted));
  const oversized = archive(base), start = oversized.readUInt32LE(oversized.length - 6); oversized.writeUInt32LE(3_000_000, start + 24); assert.throws(() => assertPlainDocx(oversized));
  assert.throws(() => assertPlainDocx(Buffer.concat([archive(base), Buffer.from("trailing payload")])));
});
