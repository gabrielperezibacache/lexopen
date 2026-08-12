import assert from "node:assert/strict";
import {
  MAX_PROCESSING_BYTES,
  processDocumentBytes,
} from "@/lib/document-processing";
import { getOcrCapability, ocrPdfPages } from "@/lib/local-ocr";

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
  process.env.OCR_ENABLED = "0";
  const capability = await getOcrCapability();
  assert.equal(capability.provider, "disabled");
  assert.equal(capability.available, false);
  const disabledOcr = await ocrPdfPages(Buffer.from("pdf"), 1, [0]);
  assert.equal(disabledOcr.status, "unavailable");
  assert.equal(disabledOcr.reason, "disabled");
  if (previousOcrEnabled === undefined) delete process.env.OCR_ENABLED;
  else process.env.OCR_ENABLED = previousOcrEnabled;

  console.log("document-processing.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
