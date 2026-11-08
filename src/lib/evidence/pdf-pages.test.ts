import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractPdfPages, renderPdfPage, PDF_MAX_BYTES, PDF_PAGE_EXTRACTOR_VERSION } from "./pdf-pages";

const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const status = (expected: number) => (error: unknown) => (error as { status?: number }).status === expected;
const fixture = path.join(process.cwd(), "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf");

// An intentionally large page tree exercises the hard physical-page bound.
// No remote content, Python runtime or native authoring dependency is needed.
function blankPdf(pageCount: number) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({length:pageCount},(_,i)=>`${i+3} 0 R`).join(" ")}] >>`];
  for (let i=0;i<pageCount;i++) objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 750] /Resources << >> >>");
  let pdf="%PDF-1.4\n";const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(o=>`${String(o).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function main() {
  const configuredOcr = process.env.OCR_ENABLED;
  delete process.env.OCR_ENABLED;
  try {
  const bytes = await fs.readFile(fixture);
  const native = await extractPdfPages(bytes, { ocr: false });
  assert.equal(native.pageCount, 3);
  assert.equal(native.extractorVersion, PDF_PAGE_EXTRACTOR_VERSION);
  assert.equal(native.sourceSha256, digest(bytes));
  assert.deepEqual(native.pages.map(p=>p.pageNumber), [1,2,3]);
  assert.equal(native.pages[0].method, "native");
  assert.equal(native.pages[0].status, "completed");
  assert.equal(native.pages[0].text, "Página uno: decisión, año y número 42.\nEste texto pertenece únicamente a la primera página.");
  assert.equal(native.pages[0].text.includes("ESCANEADO"), false);
  assert.equal(native.pages[1].status, "needs_ocr");
  assert.equal(native.pages[1].reason, "ocr_disabled");
  assert.equal(native.pages[1].text, "");
  assert.equal(native.pages[2].status, "empty");
  assert.equal(native.partial, true);
  for (const page of native.pages) assert.equal(page.textSha256, digest(page.text));
  assert.deepEqual(await extractPdfPages(bytes, { ocr: false }), native);

  const limited = await extractPdfPages(bytes, { maxPages: 1, ocr: false });
  assert.equal(limited.pageCount, 3);
  assert.equal(limited.pages[0].text, native.pages[0].text);
  assert.deepEqual(limited.pages.slice(1).map(p=>[p.status,p.reason,p.text]), [["limit","page_limit",""],["limit","page_limit",""]]);
  assert.equal(limited.partial, true);
  const noOcrBudget = await extractPdfPages(bytes, { maxOcrPages: 0 });
  assert.equal(noOcrBudget.pages[0].text, native.pages[0].text);
  assert.equal(noOcrBudget.pages[1].reason, "ocr_page_limit");
  assert.equal(noOcrBudget.pages[1].status, "needs_ocr");
  assert.equal(noOcrBudget.pages[2].status, "empty");
  assert.equal(noOcrBudget.partial, true);
  const textLimited = await extractPdfPages(bytes, { maxTextCharacters: 64, ocr: false });
  assert.equal(textLimited.pages[0].reason, "text_limit");
  assert.equal(textLimited.pages[0].text, "");
  await assert.rejects(extractPdfPages(bytes, { maxPages: 0 }), RangeError);
  await assert.rejects(extractPdfPages(bytes, { maxOcrPages: -1 }), RangeError);
  await assert.rejects(extractPdfPages(bytes, { maxTextCharacters: Infinity }), RangeError);
  await assert.rejects(extractPdfPages(Buffer.alloc(PDF_MAX_BYTES+1)), status(413));
  await assert.rejects(extractPdfPages(Buffer.from("not a PDF")), status(422));
  await assert.rejects(extractPdfPages(Buffer.from("%PDF-this is a malformed document")), status(422));
  await assert.rejects(extractPdfPages(blankPdf(501), { ocr: false }), status(413));
  await assert.rejects(extractPdfPages(bytes, { expectedSourceSha256: "different" }), status(409));
  await assert.rejects(extractPdfPages(bytes, { timeoutMs: 1 }), status(504));
  const abort = new AbortController();abort.abort();
  await assert.rejects(extractPdfPages(bytes, { signal: abort.signal }), status(499));
  const concurrent = await Promise.allSettled([extractPdfPages(bytes,{ocr:false}), extractPdfPages(bytes,{ocr:false}), extractPdfPages(bytes,{ocr:false})]);
  assert.equal(concurrent.filter(r=>r.status==="fulfilled").length,2);
  assert.equal(concurrent.filter(r=>r.status==="rejected" && status(429)(r.reason)).length,1);

  await assert.rejects(renderPdfPage(bytes, 0), RangeError);
  await assert.rejects(renderPdfPage(bytes, 4), status(404));
  await assert.rejects(renderPdfPage(bytes, 1, { expectedSourceSha256: "different" }), status(409));
  await assert.rejects(renderPdfPage(bytes, 1, { rendererBin: "lexopen-fixture-missing-pdftoppm" }), status(503));
  let rendered = false, ocrComplete = false;
  try {
    const page1 = await renderPdfPage(bytes,1,{expectedSourceSha256:native.sourceSha256});
    const page2 = await renderPdfPage(bytes,2,{expectedSourceSha256:native.sourceSha256});
    assert.equal(page1.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.notEqual(digest(page1),digest(page2));
    assert.ok(page2.readUInt32BE(16)<=2000 && page2.readUInt32BE(20)<=2000);
    rendered = true;
    const noTesseract = await extractPdfPages(bytes,{tesseractBin:"lexopen-fixture-missing-tesseract"});
    assert.equal(noTesseract.pages[1].reason,"tesseract_unavailable");
    assert.equal(noTesseract.partial,true);
    const previous=process.env.OCR_ENABLED;delete process.env.OCR_ENABLED;
    let ocr;
    try { ocr=await extractPdfPages(bytes,{language:"eng",maxOcrPages:1,expectedSourceSha256:native.sourceSha256}); }
    finally { if(previous===undefined)delete process.env.OCR_ENABLED;else process.env.OCR_ENABLED=previous; }
    if (ocr.pages[1].status==="completed") {
      assert.equal(ocr.pages[1].method,"ocr");
      assert.match(ocr.pages[1].text,/PAGINA DOS - DOCUMENTO ESCANEADO/);
      assert.match(ocr.pages[1].text,/PAGO EL 12 DE MAYO DE 2025/);
      assert.match(ocr.pages[1].text,/25000 PESOS/);
      assert.equal(ocr.pages[0].text,native.pages[0].text);
      assert.equal(ocr.pages[2].status,"empty");
      assert.equal(ocr.partial,false);
      ocrComplete=true;
    } else {
      assert.equal(ocr.partial,true);
      assert.equal(ocr.pages[1].status,"needs_ocr");
      assert.ok(["tesseract_unavailable","ocr_failed"].includes(ocr.pages[1].reason||""));
    }
  } catch(error) {
    if (!status(503)(error)) throw error;
    assert.equal((error as { code?: string }).code,"pdf_renderer_unavailable");
  }
  if(process.env.LEXOPEN_PDF_REQUIRE_TOOLS==="1")assert.ok(rendered && ocrComplete,"This validation requires local Poppler and Tesseract");
  const missing = await extractPdfPages(bytes,{rendererBin:"lexopen-fixture-missing-pdftoppm"});
  assert.equal(missing.pages[0].status,"completed");
  assert.equal(missing.pages[1].reason,"pdf_renderer_unavailable");
  assert.equal(missing.partial,true);
  // A new empty cwd makes the child parser's optional native package unavailable
  // without mocking Poppler: these assertions exercise the real local CLI.
  const cwd = process.cwd();
  const fallbackRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-pdf-fallback-test-"));
  let popplerFallback = false;
  try {
    process.chdir(fallbackRoot);
    await assert.rejects(extractPdfPages(bytes, { ocr: false, pdfinfoBin: "lexopen-fixture-missing-pdfinfo", pdftotextBin: "lexopen-fixture-missing-pdftotext" }),
      (error: unknown) => status(503)(error) && (error as { code?: string }).code === "pdf_engine_unavailable" && /Poppler/.test(String(error)));
    try {
      const fallback = await extractPdfPages(bytes, { ocr: false, expectedSourceSha256: digest(bytes) });
      assert.equal(fallback.pageCount, 3);
      assert.deepEqual(fallback.pages.map(p => p.pageNumber), [1,2,3]);
      assert.match(fallback.pages[0].text, /Página uno: decisión, año y número 42\./);
      assert.equal(fallback.pages[0].text.includes("ESCANEADO"), false);
      assert.equal(fallback.sourceSha256, digest(bytes));
      assert.deepEqual(fallback.pages.slice(1).map(p => [p.status,p.reason,p.text]), [["needs_ocr","ocr_disabled",""],["needs_ocr","ocr_disabled",""]]);
      for (const page of fallback.pages) assert.equal(page.textSha256, digest(page.text));
      const boundedFallback = await extractPdfPages(bytes, { ocr: false, maxPages: 1 });
      assert.deepEqual(boundedFallback.pages.slice(1).map(p => p.reason), ["page_limit","page_limit"]);
      assert.equal((await extractPdfPages(bytes, { ocr: false, maxTextCharacters: 64 })).pages[0].reason, "text_limit");
      await assert.rejects(extractPdfPages(blankPdf(501), { ocr: false }), status(413));
      await assert.rejects(renderPdfPage(bytes, 4), status(404));
      await assert.rejects(extractPdfPages(bytes, { signal: abort.signal }), status(499));
      // Missing text extraction is explicit even when pdfinfo itself is present.
      await assert.rejects(extractPdfPages(bytes, { pdftotextBin: "lexopen-fixture-missing-pdftotext" }), status(503));
      popplerFallback = true;
    } catch (error) {
      if (!status(503)(error) || (error as { code?: string }).code !== "pdf_engine_unavailable") throw error;
      console.log("Poppler fallback CLI test skipped: local pdfinfo/pdftotext unavailable");
    }
  } finally {
    process.chdir(cwd);
    await fs.rm(fallbackRoot, { recursive: true, force: true });
  }
  if(process.env.LEXOPEN_PDF_REQUIRE_TOOLS==="1") assert.ok(popplerFallback, "This validation requires real local pdfinfo and pdftotext");
  const leftovers=(await fs.readdir(os.tmpdir())).filter(n=>n.startsWith(`lexopen-pdf-page-${process.pid}-`)||n.startsWith(`lexopen-pdf-extract-${process.pid}-`)||n.startsWith(`lexopen-pdf-poppler-${process.pid}-`));
  assert.deepEqual(leftovers,[]);
  console.log(`PDF pages OK: physical ordinals, Unicode/native, scanned OCR, empty page, hashes, bounded parsing/render, cancellation, concurrency and cleanup. Render=${rendered}, OCR=${ocrComplete}, PopplerFallback=${popplerFallback}`);
  } finally {
    if (configuredOcr === undefined) delete process.env.OCR_ENABLED;
    else process.env.OCR_ENABLED = configuredOcr;
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
