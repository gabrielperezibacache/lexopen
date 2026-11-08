// Dedicated inert OOXML profile with native footnotes. The five-part recipe
// checker remains unchanged; ZIP bounds/CRC checks follow that same profile.
import { inflateRawSync } from "node:zlib";
import { Parser } from "htmlparser2";
const MAX = 2_000_000;
const PARTS = new Set(["word/footnotes.xml", "[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"]);
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", REL = "http://schemas.openxmlformats.org/package/2006/relationships", CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const invalid = () => new Error("El archivo Word no coincide con el formato seguro de escritos");
function crc32(bytes: Buffer) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function utf8(bytes: Buffer) { try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw invalid(); return text; } catch { throw invalid(); } }
/** Strict, in-memory ZIP reader for the six known writing parts. Never extracts a path. */
export function readWritingDocxParts(bytes: Buffer) {
  if (bytes.length < 22 || bytes.length > MAX) throw invalid();
  const end = bytes.length - 22;
  if (bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 20) || bytes.readUInt16LE(end + 8) !== 6 || bytes.readUInt16LE(end + 10) !== 6) throw invalid();
  const start = bytes.readUInt32LE(end + 16), size = bytes.readUInt32LE(end + 12);
  if (start + size !== end) throw invalid();
  const result = new Map<string, string>(), ranges: [number, number][] = []; let offset = start, total = 0;
  for (let index = 0; index < 6; index++) {
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

import { httpError } from "@/lib/auth/access";
import type { WritingDraftView, WritingReferenceView } from "./types";
const OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const allowedTags: Record<string, string[]> = {
  "w:document": ["xmlns:w"], "w:body": [], "w:p": [], "w:pPr": [], "w:pStyle": ["w:val"], "w:pageBreakBefore": [], "w:r": [], "w:t": ["xml:space"],
  "w:rPr": [], "w:b": [], "w:vertAlign": ["w:val"], "w:footnoteReference": ["w:id"], "w:footnotes": ["xmlns:w"], "w:footnote": ["w:id", "w:type"], "w:footnoteRef": [], "w:separator": [], "w:continuationSeparator": [],
  "w:sectPr": [], "w:pgSz": ["w:w", "w:h"], "w:pgMar": ["w:top", "w:right", "w:bottom", "w:left"],
  "w:styles": ["xmlns:w"], "w:docDefaults": [], "w:rPrDefault": [], "w:rFonts": ["w:ascii", "w:hAnsi"], "w:sz": ["w:val"], "w:lang": ["w:val"], "w:style": ["w:type", "w:default", "w:styleId"], "w:name": ["w:val"],
};
function verifyPart(xml: string, file: string) {
  if (/<!|<\?(?!xml\s)|&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[a-f0-9]+);)/i.test(xml)) throw invalid();
  const rel = file.endsWith(".rels"), ct = file === "[Content_Types].xml";
  const tags = rel ? { Relationships: ["xmlns"], Relationship: ["Id", "Type", "Target"] } : ct ? { Types: ["xmlns"], Default: ["Extension", "ContentType"], Override: ["PartName", "ContentType"] } : allowedTags;
  const root = rel ? "Relationships" : ct ? "Types" : file === "word/styles.xml" ? "w:styles" : file === "word/footnotes.xml" ? "w:footnotes" : "w:document";
  const stack: { name: string; self: boolean }[] = [], relationships = new Set<string>(); let roots = 0, declaration = 0, attributes = new Set<string>();
  const parser = new Parser({
    onopentagname() { attributes = new Set(); },
    onattribute(name, _value, quote) { if (attributes.has(name) || !quote) throw invalid(); attributes.add(name); },
    onopentag(name, attrs) {
      const allowed = (tags as Record<string, string[]>)[name];
      if (!allowed || Object.keys(attrs).some(key => !allowed.includes(key))) throw invalid();
      if (!stack.length) { if (++roots !== 1 || name !== root || attrs[rel || ct ? "xmlns" : "xmlns:w"] !== (rel ? REL : ct ? CT : W)) throw invalid(); }
      else if ("xmlns" in attrs || "xmlns:w" in attrs) throw invalid();
      if (rel && name === "Relationship") {
        const expected = file === "_rels/.rels" ? { rId1: ["officeDocument", "word/document.xml"] } : { rId1: ["styles", "styles.xml"], rId2: ["footnotes", "footnotes.xml"] };
        const pair = (expected as Record<string, string[]>)[attrs.Id];
        if (!pair || relationships.has(attrs.Id) || stack.at(-1)?.name !== "Relationships" || attrs.Type !== OFFICE + pair[0] || attrs.Target !== pair[1] || Object.keys(attrs).length !== 3) throw invalid();
        relationships.add(attrs.Id);
      }
      if (ct && name !== "Types") {
        if (stack.at(-1)?.name !== "Types") throw invalid();
        if (name === "Override" && !["/word/document.xml", "/word/styles.xml", "/word/footnotes.xml"].includes(attrs.PartName) || /macroEnabled|oleObject|external/i.test(attrs.ContentType || "")) throw invalid();
      }
      if (name === "w:t" && stack.at(-1)?.name !== "w:r" || name === "w:body" && stack.at(-1)?.name !== "w:document" || name === "w:footnote" && stack.at(-1)?.name !== "w:footnotes" || ["w:footnoteRef", "w:footnoteReference"].includes(name) && stack.at(-1)?.name !== "w:r") throw invalid();
      if (name === "w:footnoteReference" && !/^[1-9][0-9]{0,4}$/.test(attrs["w:id"])) throw invalid();
      if (name === "w:footnote" && (attrs["w:id"] === "-1" ? attrs["w:type"] !== "separator" : attrs["w:id"] === "0" ? attrs["w:type"] !== "continuationSeparator" : !/^[1-9][0-9]{0,4}$/.test(attrs["w:id"]) || Boolean(attrs["w:type"]))) throw invalid();
      if (attrs["xml:space"] && attrs["xml:space"] !== "preserve") throw invalid();
      stack.push({ name, self: xml.slice(parser.startIndex, parser.endIndex + 1).endsWith("/>") });
    },
    onclosetag(name, implied) { const current = stack.pop(); if (!current || current.name !== name || implied && !current.self) throw invalid(); },
    ontext(text) { if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || stack.at(-1)?.name !== "w:t" && text.trim()) throw invalid(); },
    onprocessinginstruction(name) { if (name !== "?xml" || declaration++ || parser.startIndex !== 0) throw invalid(); },
    oncomment() { throw invalid(); }, oncdatastart() { throw invalid(); }, onerror() { throw invalid(); },
  }, { xmlMode: true, decodeEntities: true, recognizeSelfClosing: true });
  parser.write(xml); parser.end();
  if (roots !== 1 || stack.length || rel && relationships.size !== (file === "_rels/.rels" ? 1 : 2)) throw invalid();
}
export function assertWritingDocx(bytes: Buffer) {
  const records = readWritingDocxParts(bytes);
  for (const [name, xml] of records) verifyPart(xml, name);
  const document = records.get("word/document.xml")!, notes = records.get("word/footnotes.xml")!;
  const refs = [...document.matchAll(/<w:footnoteReference w:id="([1-9][0-9]*)"\/>/g)].map(match => match[1]);
  const ids = [...notes.matchAll(/<w:footnote w:id="([1-9][0-9]*)">/g)].map(match => match[1]);
  if (new Set(ids).size !== ids.length || refs.some(id => !ids.includes(id)) || ids.some(id => !refs.includes(id))) throw invalid();
}
function escapeXml(text: string) {
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw httpError("El texto contiene un carácter no admitido por Word. Revísalo antes de descargar.", 409);
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const run = (text: string) => `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
const paragraph = (text: string, style?: string, newPage = false) => `<w:p>${style || newPage ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${newPage ? "<w:pageBreakBefore/>" : ""}</w:pPr>` : ""}${run(text)}</w:p>`;
function archive(records: Record<string, string>) {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, text] of Object.entries(records)) {
    const filename = Buffer.from(name), data = Buffer.from(text), sum = crc32(data), local = Buffer.alloc(30), record = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt32LE(sum, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8); record.writeUInt32LE(sum, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(filename.length, 28); record.writeUInt32LE(offset, 42);
    locals.push(local, filename, data); central.push(record, filename); offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(6, 8); end.writeUInt16LE(6, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...locals, directory, end]);
  if (bytes.length > MAX) throw httpError("El escrito y sus respaldos exceden el tamaño de una descarga Word. Divide el trabajo en escritos más acotados.", 413);
  return bytes;
}
const labels = { document: "Pasaje del expediente", fact: "Hecho registrado", note: "Nota personal de audiencia", book: "Pasaje de biblioteca" };
const safeHref = (href: string) => /^\/(?!\/)[^\s<>]*$/.test(href) ? href : "";
function shortReference(ref: WritingReferenceView) {
  return [ref.id + ". " + labels[ref.source.kind] + ": " + ref.source.title, ...ref.source.citations.map(citation => `${citation.reference}. ${citation.locator}.${citation.verificationBasis === "retained_text" ? " Cotejada con el texto conservado; original no conservado." : ""}`), ...ref.source.warnings, ...(!ref.source.citations.length ? ["Observación del profesional; sin corroboración documental."] : [])].join("\n");
}
export function renderCaseWritingDocx(draft: WritingDraftView, cause: { titulo: string; rit: string | null }, generatedAt = new Date().toISOString()) {
  const references = new Map(draft.references.map(ref => [ref.id, ref])), used: { referenceId: string; noteId: number }[] = [];
  if (/\[\^R[1-9][0-9]*\]:/.test(draft.body)) throw Object.assign(httpError("Hay una nota al pie escrita manualmente en el texto. Retírala y utiliza las referencias incorporadas desde el cuaderno de fuentes.", 409), { code: "writing_invalid_references" });
  const lines = draft.body.replace(/\r\n?/g, "\n").split("\n"), first = lines.findIndex(line => line.trim());
  if (first >= 0 && lines[first].trim() === `# ${draft.title}`) lines.splice(first, 1);
  const prose = lines.map(line => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line), content = heading ? heading[2] : line;
    let runs = "", after = 0;
    for (const match of content.matchAll(/\[\^(R[1-9][0-9]*)\]/g)) {
      if (!references.has(match[1])) throw Object.assign(httpError("Hay una cita sin fuente incorporada. Corrígela antes de descargar Word.", 409), { code: "writing_invalid_references" });
      const noteId = used.length + 1; used.push({ referenceId: match[1], noteId });
      runs += run(content.slice(after, match.index)) + `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${noteId}"/></w:r>`;
      after = match.index! + match[0].length;
    }
    runs += run(content.slice(after));
    return `<w:p>${heading ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ""}${runs}</w:p>`;
  }).join("");
  const appendix = draft.references.map(ref => [paragraph(`${ref.id} · ${labels[ref.source.kind]} · ${ref.source.title}`, "Heading1"), paragraph(ref.source.text), paragraph(safeHref(ref.source.href)), ...ref.source.citations.flatMap(citation => [paragraph(`${citation.reference}. ${citation.locator}.`), paragraph(`Pasaje literal corroborado: «${citation.quote}»`), paragraph(`Identidad del pasaje: ${citation.quoteSha256}. Texto: ${citation.textSha256}. Fuente: ${citation.sourceKey}.`), paragraph(citation.verificationBasis === "retained_text" ? `Texto conservado: ${citation.retainedSha256}. Original no conservado.` : `Original conservado: ${citation.sourceSha256}.`), paragraph(safeHref(citation.href)), ...citation.warnings.map(warning => paragraph(warning))]), ...ref.source.warnings.map(warning => paragraph(warning))].join("")).join("");
  const notes = used.map(({referenceId,noteId}) => `<w:footnote w:id="${noteId}"><w:p><w:r><w:footnoteRef/></w:r>${run(" " + shortReference(references.get(referenceId)!))}</w:p></w:footnote>`).join("");
  const records = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>',
    "_rels/.rels": `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OFFICE}officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `<w:document xmlns:w="${W}"><w:body>${paragraph(draft.title, "Title")}${paragraph([cause.titulo, cause.rit].filter(Boolean).join(" · "))}${paragraph(`${draft.review?.current && draft.review.decision === "approved" ? "Versión aprobada por " + draft.review.reviewerName : "Borrador de trabajo"} · Versión ${draft.revision} · ${generatedAt}`)}${prose}${paragraph("Fuentes y referencias incorporadas", "Heading1", true)}${appendix || paragraph("Este escrito no incorpora referencias documentales.")}${paragraph("Alcance de la revisión", "Heading1")}${paragraph("Las citas se cotejan con las fuentes conservadas y los permisos actuales. El texto de autor y las notas personales requieren revisión profesional.")}${[...new Set(draft.warnings)].map(warning => paragraph(warning)).join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:body></w:document>`,
    "word/styles.xml": `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="22"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`,
    "word/_rels/document.xml.rels": `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${OFFICE}styles" Target="styles.xml"/><Relationship Id="rId2" Type="${OFFICE}footnotes" Target="footnotes.xml"/></Relationships>`,
    "word/footnotes.xml": `<w:footnotes xmlns:w="${W}"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${notes}</w:footnotes>`,
  };
  const bytes = archive(records); assertWritingDocx(bytes); return bytes;
}
