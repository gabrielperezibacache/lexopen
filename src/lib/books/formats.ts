import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { Parser } from "htmlparser2";
import { toMarkdownBytes, formatFromExtension } from "@firecrawl/anydoc";
import { extractPdfPages, type PdfPageExtraction } from "@/lib/evidence/pdf-pages";
import { sha256, splitEvidenceText } from "@/lib/evidence/fragments";
import { httpError } from "@/lib/auth/access";
export const BOOK_MAX_BYTES = 25 * 1024 * 1024;
export const BOOK_FORMATS = ["pdf", "epub", "doc", "docx", "odt", "rtf", "txt", "md", "html", "htm", "csv", "json", "xml", "xlsx", "ods", "pptx", "odp"] as const;
const ZIP_MAX = 32 * 1024 * 1024;
const MAX_TEXT = 2_000_000;
export type ExtractedBook = { text: string; status: string; mimeType: string; locatorKind: string; pageCount: number | null; pages: PdfPageExtraction["pages"]; fragments: { ordinal: number; text: string; textSha256: string; startOffset: number; endOffset: number; pageNumber: number | null; pageStartOffset: number | null; pageEndOffset: number | null; locatorLabel: string }[] };
const malformed = () => httpError("El archivo está dañado, cifrado o no permite una extracción segura", 422);
function utf8(bytes: Buffer) { try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (text.includes("\0")) throw Error(); return text; } catch { throw httpError("El texto debe usar UTF-8 y no contener bytes binarios", 422); } }
/** Read a ZIP wholly in memory; never extracts paths or executes/fetches embedded content. */
export function readBookZip(bytes: Buffer) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0 || eocd + 22 + bytes.readUInt16LE(eocd + 20) !== bytes.length || bytes.readUInt16LE(eocd + 4) || bytes.readUInt16LE(eocd + 6)) throw malformed();
  const count = bytes.readUInt16LE(eocd + 10), size = bytes.readUInt32LE(eocd + 12), start = bytes.readUInt32LE(eocd + 16);
  if (count !== bytes.readUInt16LE(eocd + 8) || count > 2000 || start + size > eocd || start + size < start) throw malformed();
  const entries = new Map<string, Buffer>(); let offset = start, total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > start + size || bytes.readUInt32LE(offset) !== 0x02014b50) throw malformed();
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), packed = bytes.readUInt32LE(offset + 20), unpacked = bytes.readUInt32LE(offset + 24), nameSize = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32), local = bytes.readUInt32LE(offset + 42), external = bytes.readUInt32LE(offset + 38);
    if (offset + 46 + nameSize + extra + comment > start + size) throw malformed();
    const name = utf8(bytes.subarray(offset + 46, offset + 46 + nameSize));
    if (!name || name.includes("\\") || name.startsWith("/") || name.split("/").some(p => p === "..") || /^[a-zA-Z]:/.test(name) || ((external >>> 16) & 0xf000) === 0xa000 || flags & 1 || ![0, 8].includes(method) || entries.has(name)) throw malformed();
    total += unpacked;
    if (total > ZIP_MAX || unpacked > ZIP_MAX || packed > BOOK_MAX_BYTES || unpacked > Math.max(1_000_000, packed * 250)) throw httpError("El archivo comprimido supera los límites de extracción", 413);
    if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) throw malformed();
    const begin = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28), end = begin + packed;
    if (begin < local || end > start || end < begin) throw malformed();
    let value: Buffer;
    try { value = method === 0 ? Buffer.from(bytes.subarray(begin, end)) : inflateRawSync(bytes.subarray(begin, end), { maxOutputLength: Math.min(ZIP_MAX, unpacked + 1) }); } catch { throw malformed(); }
    if (value.length !== unpacked) throw malformed();
    entries.set(name, value); offset += 46 + nameSize + extra + comment;
  }
  if (offset !== start + size) throw malformed();
  for (const [name, data] of entries) if (/\.(xml|opf|xhtml|html)$/i.test(name) && /<!ENTITY|<!DOCTYPE[^>]*\[/i.test(data.toString("utf8"))) throw malformed();
  return entries;
}
function textFromMarkup(markup: string) {
  let text = "", skip = 0;
  const blocked = new Set(["script", "style", "noscript", "iframe", "object", "head"]);
  const blocks = new Set(["p", "div", "section", "article", "h1", "h2", "h3", "h4", "li", "tr", "br"]);
  const parser = new Parser({ onopentag(name) { if (blocked.has(name)) skip++; if (!skip && blocks.has(name)) text += "\n"; }, ontext(value) { if (!skip) { text += value; if (text.length > MAX_TEXT) throw httpError("El texto extraído supera dos millones de caracteres", 413); } }, onclosetag(name) { if (blocked.has(name)) skip = Math.max(0, skip - 1); if (!skip && blocks.has(name)) text += "\n"; } }, { decodeEntities: true });
  parser.write(markup); parser.end();
  return text.replace(/[\t ]+/g, " ").replace(/\n[\t ]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function attributes(xml: string, tag: string) { const rows: Record<string, string>[] = []; const parser = new Parser({ onopentag(name, attrs) { if (name.split(":").pop() === tag) rows.push(attrs); } }, { xmlMode: true, decodeEntities: true }); parser.write(xml); parser.end(); return rows; }
function epubSegments(entries: Map<string, Buffer>) {
  if (entries.get("mimetype")?.toString("ascii").trim() !== "application/epub+zip" || entries.has("META-INF/encryption.xml")) throw malformed();
  const container = entries.get("META-INF/container.xml"); if (!container) throw malformed();
  const packagePath = attributes(utf8(container), "rootfile")[0]?.["full-path"];
  if (!packagePath || !entries.has(packagePath)) throw malformed();
  const opf = utf8(entries.get(packagePath)!), items = new Map(attributes(opf, "item").map(item => [item.id, item])), spine = attributes(opf, "itemref");
  if (!spine.length || spine.length > 500) throw malformed();
  const segments: { text: string; label: string }[] = [];
  for (const [index, ref] of spine.entries()) {
    if (ref.linear === "no") continue;
    const item = items.get(ref.idref); if (!item || !["application/xhtml+xml", "text/html"].includes(item["media-type"])) throw malformed();
    let href: string; try { href = decodeURIComponent(item.href.split("#")[0]); } catch { throw malformed(); }
    if (!href || /^(?:[a-z]+:|\/\/)/i.test(href) || href.includes("\\") || href.includes("?")) throw malformed();
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(packagePath), href));
    if (resolved.startsWith("../") || !entries.has(resolved)) throw malformed();
    const text = textFromMarkup(utf8(entries.get(resolved)!));
    if (text) segments.push({ text, label: `Sección ${index + 1} · ${path.posix.basename(resolved)}` });
  }
  return segments;
}
export async function extractBook(name: string, bytes: Buffer, options: { signal?: AbortSignal } = {}): Promise<ExtractedBook> {
  options.signal?.throwIfAborted();
  if (!bytes.length || bytes.length > BOOK_MAX_BYTES) throw httpError("Seleccione un archivo de hasta 25 MiB", 413);
  const extension = path.extname(name).toLowerCase().slice(1);
  if (!(BOOK_FORMATS as readonly string[]).includes(extension)) throw httpError("Formato no admitido. Use PDF, EPUB, Word, OpenDocument o texto", 415);
  let pdf: PdfPageExtraction | undefined, segments: { text: string; label: string; pageNumber?: number }[] = [], mimeType = "text/plain", locatorKind = "text-offset";
  if (extension === "pdf") {
    pdf = await extractPdfPages(bytes, { signal: options.signal }); mimeType = "application/pdf"; locatorKind = "pdf-page";
    segments = pdf.pages.map(page => ({ text: page.text, label: `Página ${page.pageNumber}`, pageNumber: page.pageNumber }));
  } else if (extension === "epub") { segments = epubSegments(readBookZip(bytes)); mimeType = "application/epub+zip"; locatorKind = "epub-section"; }
  else if (["txt", "md", "csv", "json", "xml", "html", "htm"].includes(extension)) {
    const text = utf8(bytes); if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) throw malformed();
    segments = [{ text: ["html", "htm"].includes(extension) ? textFromMarkup(text) : text, label: "Texto importado" }];
    mimeType = extension === "md" ? "text/markdown" : "text/plain";
  } else {
    if (["docx", "odt", "xlsx", "ods", "pptx", "odp"].includes(extension)) readBookZip(bytes);
    try { const text = await toMarkdownBytes(bytes, formatFromExtension(extension)); segments = [{ text, label: "Texto extraído · ubicación sin página" }]; }
    catch { throw malformed(); }
    mimeType = ({ doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", odt: "application/vnd.oasis.opendocument.text", rtf: "application/rtf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ods: "application/vnd.oasis.opendocument.spreadsheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", odp: "application/vnd.oasis.opendocument.presentation" } as Record<string, string>)[extension];
  }
  options.signal?.throwIfAborted();
  const text = segments.map(segment => segment.text).join("\n\n");
  if (!text.trim()) throw httpError("No se encontró texto legible. Revise el original o importe una copia con texto", 422);
  if (text.length > MAX_TEXT) throw httpError("El texto extraído supera dos millones de caracteres; divida la obra en volúmenes", 413);
  let offset = 0, ordinal = 0;
  const fragments = segments.flatMap((segment, index) => {
    const start = offset; offset += segment.text.length + (index < segments.length - 1 ? 2 : 0);
    return splitEvidenceText(segment.text).map(fragment => ({ ...fragment, ordinal: ++ordinal, startOffset: start + fragment.startOffset, endOffset: start + fragment.endOffset, pageNumber: segment.pageNumber || null, pageStartOffset: segment.pageNumber ? fragment.startOffset : null, pageEndOffset: segment.pageNumber ? fragment.endOffset : null, locatorLabel: segment.label }));
  });
  if (!fragments.length) throw malformed();
  // Retain the exact extracted representation; hashes bind locators, not guessed pagination.
  return { text, status: pdf?.partial ? "partial" : "completed", mimeType, locatorKind, pageCount: pdf?.pageCount || null, pages: pdf?.pages || [], fragments: fragments.map(fragment => ({ ...fragment, textSha256: sha256(fragment.text) })) };
}
