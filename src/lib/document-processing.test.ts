import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MAX_PROCESSING_BYTES,
  processDocumentBytes,
} from "@/lib/document-processing";
import { getOcrCapability } from "@/lib/local-ocr";

async function main() {
  const csv = await processDocumentBytes(
    "clientes.csv",
    Buffer.from("nombre,rol\nLexOpen,cliente\n", "utf8")
  );
  assert.equal(csv.status, "completed");
  assert.match(csv.markdown || "", /LexOpen/);

  const tooLarge = await processDocumentBytes(
    "archivo.docx",
    Buffer.alloc(MAX_PROCESSING_BYTES + 1)
  );
  assert.equal(tooLarge.status, "failed");
  assert.equal(tooLarge.metadata.errorCode, "resourceLimit");

  const previousOcrEnabled = process.env.OCR_ENABLED;
  const previousOcrLanguage = process.env.OCR_LANGUAGE;
  const bytes = await readFile(new URL("./evidence/pdf-fixtures/mixed-three-pages.pdf", import.meta.url));
  try {
    process.env.OCR_ENABLED = "0";
    const capability = await getOcrCapability();
    assert.equal(capability.provider, "disabled");
    assert.equal(capability.available, false);
    const pending = await processDocumentBytes("mixto.pdf", bytes);
    assert.equal(pending.status, "needs_ocr");
    assert.match(pending.markdown || "", /Página uno: decisión, año y número 42/);
    assert.deepEqual(pending.metadata.pagesNeedingOcr, [1]);
    assert.deepEqual(pending.metadata.ocrPagesFailed, [1]);
    assert.equal(pending.metadata.ocrStatus, "unavailable");
    assert.equal(pending.metadata.partial, true);
    assert.deepEqual(pending.metadata.pages, [
      { pageNumber: 1, method: "native", status: "completed" },
      { pageNumber: 2, method: "failed", status: "needs_ocr", reason: "ocr_disabled" },
      { pageNumber: 3, method: "empty", status: "empty" },
    ]);
    const invalid = await processDocumentBytes("roto.pdf", Buffer.from("%PDF-invalid"));
    assert.equal(invalid.status, "failed");
    assert.equal(invalid.metadata.errorCode, "invalid_pdf");
    const concurrent = await Promise.allSettled(Array.from({ length: 3 }, () => processDocumentBytes("mixto.pdf", bytes)));
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal(concurrent.filter((result) => result.status === "rejected" && result.reason?.code === "pdf_busy").length, 1);

    delete process.env.OCR_ENABLED;
    process.env.OCR_LANGUAGE = "eng";
    const available = await getOcrCapability();
    if (available.available) {
      assert.equal(available.provider, "tesseract-cli");
      // Detect the PDF signature even without an extension, and prepare it only once in physical order.
      const completed = await processDocumentBytes("documento", bytes);
      assert.equal(completed.format, "pdf");
      assert.equal(completed.status, "completed");
      assert.equal(completed.metadata.pageCount, 3);
      assert.equal(completed.metadata.partial, false);
      assert.deepEqual(completed.metadata.ocrPagesProcessed, [1]);
      assert.deepEqual(completed.metadata.ocrPagesFailed, []);
      assert.deepEqual(completed.metadata.pagesNeedingOcr, []);
      assert.deepEqual(completed.markdown?.match(/^## Página \d+$/gm), ["## Página 1", "## Página 2"]);
      assert.equal(completed.markdown?.match(/Página uno: decisión/g)?.length, 1);
      assert.match(completed.markdown || "", /PAGINA DOS - DOCUMENTO ESCANEADO/);
      assert.match(completed.markdown || "", /25000 PESOS/);
    } else if (process.env.LEXOPEN_PDF_REQUIRE_TOOLS === "1") {
      assert.fail(`Local OCR tools required: ${available.reason}`);
    }
  } finally {
    if (previousOcrEnabled === undefined) delete process.env.OCR_ENABLED;
    else process.env.OCR_ENABLED = previousOcrEnabled;
    if (previousOcrLanguage === undefined) delete process.env.OCR_LANGUAGE;
    else process.env.OCR_LANGUAGE = previousOcrLanguage;
  }

  console.log("document-processing.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
