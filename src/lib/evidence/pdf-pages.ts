import { createHash } from "node:crypto";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ocrCommandTimeout, ocrPageLimit, pdftoppmBinCandidates, prependOcrPath, tesseractBinCandidates } from "@/lib/local-ocr";

const execFile = promisify(execFileCallback);
export const PDF_PAGE_EXTRACTOR_VERSION = "lexopen-pdf-pages-3";
export const PDF_MAX_BYTES = 25 * 1024 * 1024;
export const PDF_MAX_PHYSICAL_PAGES = 500;
const MAX_TEXT = 2_000_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
let nativeActive = 0;
let renderActive = 0;

export type PdfEvidencePage = {
  pageNumber: number;
  text: string;
  textSha256: string;
  method: "native" | "ocr" | "empty" | "failed";
  status: "completed" | "empty" | "needs_ocr" | "failed" | "limit";
  reason?: string;
};
export type PdfPageOptions = {
  maxPages?: number;
  maxOcrPages?: number;
  maxTextCharacters?: number;
  timeoutMs?: number;
  ocr?: boolean;
  language?: string;
  rendererBin?: string;
  tesseractBin?: string;
  pdfinfoBin?: string;
  pdftotextBin?: string;
  signal?: AbortSignal;
  expectedSourceSha256?: string;
};
export type PdfPageExtraction = {
  pages: PdfEvidencePage[];
  pageCount: number;
  partial: boolean;
  extractorVersion: string;
  sourceSha256: string;
};
function failure(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}
function hash(value: Buffer | string) { return createHash("sha256").update(value).digest("hex"); }
function checkBytes(bytes: Buffer, expectedSourceSha256?: string) {
  if (!Buffer.isBuffer(bytes) || bytes.length > PDF_MAX_BYTES) throw failure("El PDF supera el límite de 25 MB", 413, "pdf_byte_limit");
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw failure("El archivo no es un PDF válido", 422, "invalid_pdf");
  if (expectedSourceSha256 && hash(bytes) !== expectedSourceSha256) throw failure("El original no coincide con la versión registrada", 409, "pdf_source_changed");
}
function bounded(value: number | undefined, fallback: number, min: number, max: number, name: string) {
  const actual = value ?? fallback;
  if (!Number.isSafeInteger(actual) || actual < min || actual > max) throw new RangeError(`${name} inválido`);
  return actual;
}
function notCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw failure("Procesamiento PDF cancelado", 499, "pdf_cancelled");
}

type NativePage = { pageNumber: number; text: string; needsOcr: boolean; hasImages: boolean; reason?: string };
type NativeResult = { pageCount: number; pages: NativePage[] };
// The native parser runs in a killable local process. No document text enters a
// command argument, shell, network request or error message. Physical ordinals
// come from the PDF parser (positions are 1-based; markdown metadata is 0-based).
const INSPECTOR_SCRIPT = String.raw`
const fs = require('node:fs');
async function main() {
 let inspector;
 try { inspector = require('@firecrawl/pdf-inspector'); }
 catch { process.stdout.write(JSON.stringify({error:'engine_unavailable'})); return; }
 try {
  const bytes = fs.readFileSync(0);
  const count = inspector.classifyPdf(bytes).pageCount;
  if (!Number.isInteger(count) || count < 1) throw Error('invalid_pdf');
  if (count > 500) { process.stdout.write(JSON.stringify({error:'page_limit'})); return; }
  const limit = Number(process.argv[1]);
  if (!limit) { process.stdout.write(JSON.stringify({pageCount:count,pages:[]})); return; }
  const numbers = Array.from({length:Math.min(count,limit)},(_,i)=>i+1);
  const markdown = inspector.extractPagesMarkdown(bytes,numbers.map(n=>n-1));
  const positions = inspector.extractTextWithPositions(bytes,numbers);
  const pageMap = new Map(markdown.pages.map(p=>[p.page+1,p]));
  let remaining = Number(process.argv[2]);
  const pages = numbers.map(pageNumber=>{
   const items=positions.filter(item=>item.page===pageNumber);
   let text='',previous=null;
   for (const item of items) {
    if (item.itemType!=='Text' || !item.text) continue;
    let separator='';
    if (previous) {
     const sameLine=Math.abs(item.y-previous.y)<Math.max(1,Math.min(item.fontSize,previous.fontSize)*.15);
     const gap=item.x-(previous.x+previous.width);
     separator=sameLine && gap>=-.5 && gap<Math.max(item.fontSize,previous.fontSize)*4
       ? gap>Math.min(item.fontSize,previous.fontSize)*.15 ? ' ' : '' : '\n';
    }
    text+=separator+item.text;
    previous=item;
   }
   text=text.replace(/\u0000/g,'\uFFFD').trim();
   if (text.length>remaining) return {pageNumber,text:'',hasImages:items.some(i=>i.itemType==='Image'),needsOcr:false,reason:'text_limit'};
   remaining-=text.length;
   const meta=pageMap.get(pageNumber);
   return {pageNumber,text,hasImages:items.some(i=>i.itemType==='Image'),needsOcr:Boolean(meta?.needsOcr),reason:meta ? meta.ocrReason : 'page_unavailable'};
  });
  process.stdout.write(JSON.stringify({pageCount:count,pages}));
 } catch { process.stdout.write(JSON.stringify({error:'invalid_pdf'})); }
}
main().catch(()=>{process.stdout.write(JSON.stringify({error:'invalid_pdf'}));});
`;

async function inspectNative(bytes: Buffer, maxPages: number, maxText: number, timeout: number, signal?: AbortSignal): Promise<NativeResult> {
  notCancelled(signal);
  if (nativeActive >= 2) throw failure("El motor PDF está ocupado; vuelva a intentar", 429, "pdf_busy");
  nativeActive++;
  try {
    return await new Promise<NativeResult>((resolve, reject) => {
      const child = spawn(process.execPath, ["--max-old-space-size=256", "-e", INSPECTOR_SCRIPT, String(maxPages), String(maxText)], {
        cwd: process.cwd(), stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
      });
      let settled = false, size = 0;
      const output: Buffer[] = [];
      const finish = (error?: Error, value?: NativeResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancelled);
        if (error) { child.kill("SIGKILL"); reject(error); }
        else resolve(value!);
      };
      const cancelled = () => finish(failure("Procesamiento PDF cancelado", 499, "pdf_cancelled"));
      const timer = setTimeout(() => finish(failure("El PDF agotó el tiempo de extracción", 504, "pdf_timeout")), timeout);
      signal?.addEventListener("abort", cancelled, { once: true });
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) finish(failure("El texto PDF supera el límite de extracción", 413, "pdf_text_limit"));
        else output.push(chunk);
      });
      child.stdin.on("error", () => undefined);
      child.once("error", () => finish(failure("El motor local de PDF no está disponible", 503, "pdf_engine_unavailable")));
      child.once("close", (code) => {
        if (settled) return;
        try {
          if (code !== 0) throw new Error();
          const result = JSON.parse(Buffer.concat(output).toString("utf8")) as NativeResult & { error?: string };
          if (result.error === "engine_unavailable") return finish(failure("El motor local de PDF no está disponible", 503, "pdf_engine_unavailable"));
          if (result.error === "page_limit") return finish(failure(`El PDF supera el límite de ${PDF_MAX_PHYSICAL_PAGES} páginas físicas`, 413, "pdf_page_limit"));
          if (result.error || !Number.isInteger(result.pageCount) || !Array.isArray(result.pages)) throw new Error();
          finish(undefined, result);
        } catch { finish(failure("No se pudo leer el PDF; compruebe que no esté dañado o cifrado", 422, "invalid_pdf")); }
      });
      child.stdin.end(bytes);
      if (signal?.aborted) cancelled();
    });
  } finally { nativeActive--; }
}

// Poppler is already an optional local rendering/OCR prerequisite. Its parser,
// never textual separators, supplies the physical page count and ordinals.
async function inspectPoppler(bytes: Buffer, maxPages: number, maxText: number, timeout: number, options: PdfPageOptions): Promise<NativeResult> {
  notCancelled(options.signal);
  if (nativeActive >= 2) throw failure("El motor PDF está ocupado; vuelva a intentar", 429, "pdf_busy");
  nativeActive++;
  const started = Date.now();
  let root: string | undefined;
  const remaining = () => {
    notCancelled(options.signal);
    const value = timeout - (Date.now() - started);
    if (value <= 0) throw failure("El PDF agotó el tiempo de extracción", 504, "pdf_timeout");
    return value;
  };
  const candidates = (name: "pdfinfo" | "pdftotext", configured?: string) => configured ? [configured] : [
    process.env[name === "pdfinfo" ? "OCR_PDFINFO_BIN" : "OCR_PDFTOTEXT_BIN"],
    ...pdftoppmBinCandidates().map(bin => path.join(path.dirname(bin), process.platform === "win32" ? `${name}.exe` : name)),
  ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  const resolve = async (bins: string[]) => {
    prependOcrPath();
    for (const bin of bins) {
      try {
        await execFile(bin, ["-v"], { timeout: Math.min(2_000, remaining()), maxBuffer: 128 * 1024, windowsHide: true, signal: options.signal, killSignal: "SIGKILL" });
        return bin;
      } catch { remaining(); }
    }
    throw failure("El motor PDF nativo no está disponible y faltan las herramientas locales Poppler (pdfinfo/pdftotext). Instale Poppler o configure OCR_PDFINFO_BIN y OCR_PDFTOTEXT_BIN en el Host", 503, "pdf_engine_unavailable");
  };
  try {
    const infoBin = await resolve(candidates("pdfinfo", options.pdfinfoBin));
    const textBin = maxPages ? await resolve(candidates("pdftotext", options.pdftotextBin)) : null;
    root = await fs.mkdtemp(path.join(os.tmpdir(), `lexopen-pdf-poppler-${process.pid}-`));
    await fs.chmod(root, 0o700);
    const input = path.join(root, "original.pdf");
    await fs.writeFile(input, bytes, { mode: 0o600 });
    const commandOptions = () => ({ timeout: remaining(), maxBuffer: MAX_IMAGE_BYTES, encoding: "utf8" as const, windowsHide: true, signal: options.signal, killSignal: "SIGKILL" as const, env: { ...process.env, LC_ALL: "C", LANG: "C" } });
    const info = await execFile(infoBin, [input], commandOptions());
    const pageCount = Number(/^Pages:\s+(\d+)\s*$/m.exec(info.stdout)?.[1]);
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw failure("No se pudo verificar el número de páginas físicas del PDF", 422, "invalid_pdf");
    if (pageCount > PDF_MAX_PHYSICAL_PAGES) throw failure(`El PDF supera el límite de ${PDF_MAX_PHYSICAL_PAGES} páginas físicas`, 413, "pdf_page_limit");
    const pages: NativePage[] = [];
    let textRemaining = maxText;
    for (let pageNumber = 1; pageNumber <= Math.min(pageCount, maxPages); pageNumber++) {
      try {
        const result = await execFile(textBin!, ["-f", String(pageNumber), "-l", String(pageNumber), "-enc", "UTF-8", "-nopgbrk", input, "-"], commandOptions());
        const text = result.stdout.replace(/\u0000/g, "\uFFFD").trim();
        if (text.length > textRemaining) pages.push({ pageNumber, text: "", hasImages: false, needsOcr: false, reason: "text_limit" });
        else {
          textRemaining -= text.length;
          // No text does not prove an empty page: retain the ordinal for OCR.
          pages.push({ pageNumber, text, hasImages: false, needsOcr: !text, reason: text ? undefined : "text_unavailable" });
        }
      } catch (error) {
        remaining();
        if ((error as { code?: string }).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") pages.push({ pageNumber, text: "", hasImages: false, needsOcr: false, reason: "text_limit" });
        else throw error;
      }
    }
    return { pageCount, pages };
  } catch (error) {
    notCancelled(options.signal);
    if (error && typeof error === "object" && "status" in error) throw error;
    const timedOut = Boolean((error as { killed?: boolean }).killed || (error as { code?: string }).code === "ETIMEDOUT");
    throw failure(timedOut ? "El PDF agotó el tiempo de extracción" : "No se pudo leer el PDF con Poppler; compruebe que no esté dañado o cifrado", timedOut ? 504 : 422, timedOut ? "pdf_timeout" : "invalid_pdf");
  } finally {
    nativeActive--;
    if (root) await fs.rm(root, { recursive: true, force: true });
  }
}

async function inspectPdf(bytes: Buffer, maxPages: number, maxText: number, timeout: number, options: PdfPageOptions): Promise<NativeResult> {
  const started = Date.now();
  try { return await inspectNative(bytes, maxPages, maxText, timeout, options.signal); }
  catch (error) {
    if ((error as { code?: string }).code !== "pdf_engine_unavailable") throw error;
    const remaining = timeout - (Date.now() - started);
    if (remaining <= 0) throw failure("El PDF agotó el tiempo de extracción", 504, "pdf_timeout");
    return inspectPoppler(bytes, maxPages, maxText, remaining, options);
  }
}

async function resolveBin(candidates: string[], versionArgs: string[]) {
  prependOcrPath();
  for (const bin of candidates) {
    try { await execFile(bin, versionArgs, { timeout: 2_000, maxBuffer: 128 * 1024, windowsHide: true }); return bin; }
    catch { /* Only local executables are probed; never download a fallback. */ }
  }
  return null;
}
async function renderer(options: PdfPageOptions) {
  const found = await resolveBin(options.rendererBin ? [options.rendererBin] : pdftoppmBinCandidates(), ["-v"]);
  if (!found) throw failure("La vista de páginas requiere Poppler local (pdftoppm). Configure OCR_PDFTOPPM_BIN en el Host", 503, "pdf_renderer_unavailable");
  return found;
}
async function renderFromFile(bin: string, input: string, prefix: string, pageNumber: number, timeoutMs: number, signal?: AbortSignal) {
  notCancelled(signal);
  if (renderActive >= 2) throw failure("El renderizador PDF está ocupado; vuelva a intentar", 429, "pdf_busy");
  renderActive++;
  const imagePath = `${prefix}.png`;
  try {
    await execFile(bin, ["-f", String(pageNumber), "-l", String(pageNumber), "-png", "-r", "180", "-scale-to", "2000", "-singlefile", input, prefix],
      { timeout: timeoutMs, maxBuffer: 128 * 1024, windowsHide: true, signal });
    const stat = await fs.stat(imagePath);
    if (stat.size > MAX_IMAGE_BYTES) throw failure("La imagen de página supera el límite", 413, "pdf_image_limit");
    const image = await fs.readFile(imagePath);
    if (image.length < 24 || !image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || image.readUInt32BE(16) < 1 || image.readUInt32BE(20) < 1 || image.readUInt32BE(16) > 2000 || image.readUInt32BE(20) > 2000) {
      throw failure("El renderizador no devolvió una página PNG válida", 502, "pdf_invalid_image");
    }
    return image;
  } finally { renderActive--; }
}

/** Render a physical page from these exact source bytes; never a text preview. */
export async function renderPdfPage(bytes: Buffer, pageNumber: number, options: PdfPageOptions = {}): Promise<Buffer> {
  checkBytes(bytes, options.expectedSourceSha256);
  bounded(pageNumber, 1, 1, PDF_MAX_PHYSICAL_PAGES, "Número de página");
  const timeout = bounded(options.timeoutMs, 30_000, 1, 120_000, "Tiempo de renderizado");
  const started = Date.now();
  const metadata = await inspectPdf(bytes, 0, 0, timeout, options);
  if (pageNumber > metadata.pageCount) throw failure("La página solicitada no existe en este PDF", 404, "pdf_page_not_found");
  const bin = await renderer(options);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `lexopen-pdf-page-${process.pid}-`));
  try {
    const input = path.join(root, "original.pdf");
    await fs.writeFile(input, bytes);
    const remaining = timeout - (Date.now() - started);
    if (remaining <= 0) throw failure("El PDF agotó el tiempo de renderizado", 504, "pdf_timeout");
    try { return await renderFromFile(bin, input, path.join(root, "page"), pageNumber, remaining, options.signal); }
    catch (error) {
      notCancelled(options.signal);
      if (error && typeof error === "object" && "status" in error) throw error;
      const timedOut = Boolean((error as { killed?: boolean; code?: string }).killed || (error as { code?: string }).code === "ETIMEDOUT");
      throw failure(timedOut ? "El PDF agotó el tiempo de renderizado" : "No se pudo renderizar la página del PDF", timedOut ? 504 : 502, timedOut ? "pdf_timeout" : "pdf_render_failed");
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

/** All extraction and optional OCR stay on the Host. Empty/unprocessed pages remain explicit. */
export async function extractPdfPages(bytes: Buffer, options: PdfPageOptions = {}): Promise<PdfPageExtraction> {
  checkBytes(bytes, options.expectedSourceSha256);
  const maxPages = bounded(options.maxPages, 100, 1, PDF_MAX_PHYSICAL_PAGES, "Límite de páginas");
  const maxOcrPages = bounded(options.maxOcrPages, ocrPageLimit(), 0, 100, "Límite de páginas OCR");
  const maxText = bounded(options.maxTextCharacters, MAX_TEXT, 64, MAX_TEXT, "Límite de texto");
  const timeout = bounded(options.timeoutMs, 120_000, 1, 120_000, "Tiempo de extracción");
  const started = Date.now();
  const native = await inspectPdf(bytes, maxPages, maxText, timeout, options);
  const nativeByNumber = new Map(native.pages.map(page => [page.pageNumber, page]));
  const pages: PdfEvidencePage[] = [];
  let remainingText = maxText;
  let ocrAttempts = 0;
  let tools: { renderer: string; tesseract: string } | null | undefined;
  let toolsReason = "ocr_unavailable";
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `lexopen-pdf-extract-${process.pid}-`));
  const input = path.join(root, "original.pdf");
  try {
    await fs.writeFile(input, bytes);
    for (let pageNumber = 1; pageNumber <= native.pageCount; pageNumber++) {
      notCancelled(options.signal);
      const item = nativeByNumber.get(pageNumber);
      const page: PdfEvidencePage = { pageNumber, text: item?.text || "", textSha256: "", method: "native", status: "completed" };
      pages.push(page);
      if (!item || item.reason === "text_limit") {
        Object.assign(page, { text: "", method: "failed", status: "limit", reason: item ? "text_limit" : "page_limit" });
        continue;
      }
      if (item.reason === "page_unavailable") {
        Object.assign(page, { text: "", method: "failed", status: "failed", reason: "page_unavailable" });
        continue;
      }
      if (!item.text && !item.hasImages && !item.reason) {
        Object.assign(page, { method: "empty", status: "empty" });
        continue;
      }
      if (item.needsOcr || (!item.text && item.hasImages)) {
        if (!item.text) page.method = "failed";
        page.status = "needs_ocr";
        page.reason = item.reason || "text_unreliable";
        if (options.ocr === false || process.env.OCR_ENABLED === "0") {
          page.reason = "ocr_disabled";
        } else if (ocrAttempts >= maxOcrPages) {
          page.reason = "ocr_page_limit";
        } else if (Date.now() - started >= timeout) {
          page.status = "limit"; page.reason = "time_limit";
        } else {
          if (tools === undefined) {
            try {
              const render = await renderer(options);
              const tesseract = await resolveBin(options.tesseractBin ? [options.tesseractBin] : tesseractBinCandidates(), ["--version"]);
              tools = tesseract ? { renderer: render, tesseract } : null;
              if (!tesseract) toolsReason = "tesseract_unavailable";
            } catch { tools = null; toolsReason = "pdf_renderer_unavailable"; }
          }
          if (!tools) page.reason = toolsReason;
          else {
            // Count attempts, including failures: broken pages must not bypass the budget.
            ocrAttempts++;
            const prefix = path.join(root, `page-${pageNumber}`);
            try {
              const remaining = timeout - (Date.now() - started);
              if (remaining <= 0) throw failure("Tiempo de OCR agotado", 504, "pdf_timeout");
              await renderFromFile(tools.renderer, input, prefix, pageNumber, Math.min(remaining, ocrCommandTimeout()), options.signal);
              const language = options.language || process.env.OCR_LANGUAGE || "spa+eng";
              if (!/^[A-Za-z0-9_+.-]{1,100}$/.test(language)) throw failure("Idioma OCR inválido", 400, "ocr_language_invalid");
              const result = await execFile(tools.tesseract, [`${prefix}.png`, "stdout", "-l", language, "--psm", "3"], {
                timeout: Math.max(1, Math.min(timeout - (Date.now() - started), ocrCommandTimeout())), maxBuffer: 8 * 1024 * 1024, encoding: "utf8", windowsHide: true, signal: options.signal,
              });
              const text = result.stdout.replace(/\u0000/g, "\uFFFD").trim();
              if (text && text.length <= remainingText) Object.assign(page, { text, method: "ocr", status: "completed", reason: undefined });
              else if (text.length > remainingText) Object.assign(page, { text: "", method: "failed", status: "limit", reason: "text_limit" });
              else Object.assign(page, { method: "ocr", status: "needs_ocr", reason: "ocr_no_text" });
            } catch {
              notCancelled(options.signal);
              Object.assign(page, { status: "needs_ocr", reason: Date.now() - started >= timeout ? "time_limit" : "ocr_failed" });
            } finally { await fs.rm(`${prefix}.png`, { force: true }); }
          }
        }
      }
      if (page.text.length > remainingText) Object.assign(page, { text: "", method: "failed", status: "limit", reason: "text_limit" });
      remainingText -= page.text.length;
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
  for (const page of pages) page.textSha256 = hash(page.text);
  return { pages, pageCount: native.pageCount, partial: pages.some(page => !["completed", "empty"].includes(page.status)), extractorVersion: PDF_PAGE_EXTRACTOR_VERSION, sourceSha256: hash(bytes) };
}
