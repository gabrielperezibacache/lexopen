import assert from "node:assert/strict";
import {
  MAX_PROCESSING_BYTES,
  processDocumentBytes,
} from "@/lib/document-processing";

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

  console.log("document-processing.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
