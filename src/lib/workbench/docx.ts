import { inflateRawSync } from "node:zlib";
import { Parser } from "htmlparser2";
const MAX = 2_000_000;
const PARTS = new Set(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"]);
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", REL = "http://schemas.openxmlformats.org/package/2006/relationships", CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const invalid = () => new Error("El DOCX no coincide con la receta de documentos inertes");
function crc32(bytes: Buffer) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function utf8(bytes: Buffer) { try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw invalid(); return text; } catch { throw invalid(); } }
/** Strict, in-memory ZIP reader for the five known recipe parts. Never extracts a path. */
function parts(bytes: Buffer) {
  if (bytes.length < 22 || bytes.length > MAX) throw invalid();
  const end = bytes.length - 22;
  if (bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 20) || bytes.readUInt16LE(end + 8) !== 5 || bytes.readUInt16LE(end + 10) !== 5) throw invalid();
  const start = bytes.readUInt32LE(end + 16), size = bytes.readUInt32LE(end + 12);
  if (start + size !== end) throw invalid();
  const result = new Map<string, string>(), ranges: [number, number][] = []; let offset = start, total = 0;
  for (let index = 0; index < 5; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw invalid();
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), crc = bytes.readUInt32LE(offset + 16), packed = bytes.readUInt32LE(offset + 20), unpacked = bytes.readUInt32LE(offset + 24), nameSize = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32), local = bytes.readUInt32LE(offset + 42), external = bytes.readUInt32LE(offset + 38);
    if (offset + 46 + nameSize + extra + comment > end || flags & ~0x0800 || ![0, 8].includes(method) || extra || comment || ((external >>> 16) & 0xf000) === 0xa000 || unpacked < 1 || packed < 1 || (total += unpacked) > MAX) throw invalid();
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameSize), name = utf8(nameBytes);
    if (!PARTS.has(name) || result.has(name) || local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) throw invalid();
    const localNameSize = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28), begin = local + 30 + localNameSize + localExtra, finish = begin + packed;
    if (bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== packed || bytes.readUInt32LE(local + 22) !== unpacked || localNameSize !== nameSize || localExtra || finish > start || !bytes.subarray(local + 30, local + 30 + localNameSize).equals(nameBytes)) throw invalid();
    let value: Buffer;
    try { value = method === 0 ? bytes.subarray(begin, finish) : inflateRawSync(bytes.subarray(begin, finish), { maxOutputLength: Math.min(MAX, unpacked + 1) }); } catch { throw invalid(); }
    if (value.length !== unpacked || crc32(value) !== crc) throw invalid();
    ranges.push([local, finish]); result.set(name, utf8(value)); offset += 46 + nameSize;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  if (offset !== end || ranges[0][0] !== 0 || ranges.at(-1)![1] !== start || ranges.some((range, index) => index > 0 && range[0] !== ranges[index - 1][1])) throw invalid();
  return result;
}
const documentTags: Record<string, string[]> = { "w:document": ["xmlns:w"], "w:body": [], "w:p": [], "w:pPr": [], "w:pStyle": ["w:val"], "w:keepNext": [], "w:ind": ["w:left"], "w:r": [], "w:t": ["xml:space"], "w:sectPr": [], "w:pgSz": ["w:w", "w:h"], "w:pgMar": ["w:top", "w:right", "w:bottom", "w:left"] };
const styleTags: Record<string, string[]> = { "w:styles": ["xmlns:w"], "w:docDefaults": [], "w:rPrDefault": [], "w:rPr": [], "w:rFonts": ["w:ascii", "w:hAnsi"], "w:sz": ["w:val"], "w:lang": ["w:val"], "w:style": ["w:type", "w:default", "w:styleId"], "w:name": ["w:val"], "w:b": [] };
function verifyXml(xml: string, file: string) {
  if (/<!|<\?(?!xml\s)|&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[a-f0-9]+);)/i.test(xml)) throw invalid();
  const relationships = file.endsWith(".rels"), contentTypes = file === "[Content_Types].xml", styles = file === "word/styles.xml";
  const tags = relationships ? { Relationships: ["xmlns"], Relationship: ["Id", "Type", "Target"] } : contentTypes ? { Types: ["xmlns"], Default: ["Extension", "ContentType"], Override: ["PartName", "ContentType"] } : styles ? styleTags : documentTags;
  const expectedRoot = relationships ? "Relationships" : contentTypes ? "Types" : styles ? "w:styles" : "w:document";
  const stack: { name: string; selfClosing: boolean }[] = []; let roots = 0, relations = 0, declaration = 0; let attributes = new Set<string>();
  const parser = new Parser({
    onopentagname() { attributes = new Set(); },
    onattribute(name, _value, quote) { if (attributes.has(name) || !quote) throw invalid(); attributes.add(name); },
    onopentag(name, attrs) {
      const allowed = (tags as Record<string, string[]>)[name];
      if (!allowed || Object.keys(attrs).some(key => !allowed.includes(key))) throw invalid();
      if (!stack.length) { if (++roots !== 1 || name !== expectedRoot || attrs[relationships || contentTypes ? "xmlns" : "xmlns:w"] !== (relationships ? REL : contentTypes ? CT : W)) throw invalid(); }
      else if ("xmlns" in attrs || "xmlns:w" in attrs) throw invalid();
      if (relationships && name === "Relationship") {
        const target = file === "_rels/.rels" ? "word/document.xml" : "styles.xml", type = file === "_rels/.rels" ? "officeDocument" : "styles";
        if (stack.at(-1)?.name !== "Relationships" || ++relations !== 1 || Object.keys(attrs).length !== 3 || attrs.Id !== "rId1" || attrs.Target !== target || attrs.Type !== `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}`) throw invalid();
      }
      if (contentTypes && name !== "Types") {
        if (stack.at(-1)?.name !== "Types") throw invalid();
        if (name === "Override" && !["/word/document.xml", "/word/styles.xml"].includes(attrs.PartName) || /macroEnabled|oleObject|external/i.test(attrs.ContentType || "")) throw invalid();
      }
      if (!relationships && !contentTypes) {
        // Whitelisted tags cannot contain fields, DDE/INCLUDETEXT, objects, hyperlinks or altChunk.
        if (name === "w:t" && stack.at(-1)?.name !== "w:r" || name === "w:body" && stack.at(-1)?.name !== "w:document") throw invalid();
        if (attrs["xml:space"] && attrs["xml:space"] !== "preserve") throw invalid();
      }
      stack.push({ name, selfClosing: xml.slice(parser.startIndex, parser.endIndex + 1).endsWith("/>") });
    },
    onclosetag(name, implied) { const current = stack.pop(); if (!current || current.name !== name || implied && !current.selfClosing) throw invalid(); },
    ontext(text) { if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || stack.at(-1)?.name !== "w:t" && text.trim()) throw invalid(); },
    onprocessinginstruction(name) { if (name !== "?xml" || declaration++ || parser.startIndex !== 0) throw invalid(); },
    oncomment() { throw invalid(); }, oncdatastart() { throw invalid(); }, onerror() { throw invalid(); },
  }, { xmlMode: true, decodeEntities: true, recognizeSelfClosing: true });
  parser.write(xml); parser.end();
  if (roots !== 1 || stack.length || relationships && relations !== 1) throw invalid();
}
export function assertPlainDocx(bytes: Buffer) { for (const [name, xml] of parts(bytes)) verifyXml(xml, name); }
