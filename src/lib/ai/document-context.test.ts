import assert from "node:assert/strict";
import {
  buildFolderIndex,
  documentExtractionAlerts,
  documentRelativePath,
  excerptBudgetForUtility,
  filterDocumentsByScope,
  rankDocumentsForAi,
  tokenizeAiQuery,
} from "@/lib/ai/document-context";

function main() {
  assert.equal(
    documentRelativePath({ nombre: "demanda.pdf", ruta: "Escritos/2024" }),
    "Escritos/2024/demanda.pdf"
  );
  assert.equal(documentRelativePath({ nombre: "x.pdf", ruta: null }), "x.pdf");

  const tokens = tokenizeAiQuery("Según el escrito de demanda, ¿qué montos?");
  assert.ok(tokens.includes("escrito") || tokens.includes("demanda") || tokens.includes("montos"));
  assert.ok(!tokens.includes("según") && !tokens.includes("segun"));

  const ranked = rankDocumentsForAi(
    [
      {
        id: "1",
        nombre: "foto.png",
        ruta: "Evidencia",
        extractedMarkdown: "",
        extractionStatus: "needs_ocr",
        updatedAt: "2026-01-01",
      },
      {
        id: "2",
        nombre: "demanda.pdf",
        ruta: "Escritos",
        extractedMarkdown: "La demanda reclama montos por daño moral...",
        extractionStatus: "completed",
        updatedAt: "2026-08-01",
      },
      {
        id: "3",
        nombre: "contrato.pdf",
        ruta: "Contratos",
        extractedMarkdown: "Contrato de mandato...",
        extractionStatus: "completed",
        updatedAt: "2026-07-01",
      },
    ],
    "qué dice la demanda sobre montos"
  );
  assert.equal(ranked[0]!.id, "2");
  assert.ok(ranked[0]!.score > ranked[1]!.score);

  const scoped = filterDocumentsByScope(
    [
      { id: "a", nombre: "1.pdf", ruta: "Escritos/Anexos" },
      { id: "b", nombre: "2.pdf", ruta: "Evidencia" },
    ],
    { rutaPrefix: "Escritos" }
  );
  assert.deepEqual(
    scoped.map((d) => d.id),
    ["a"]
  );

  const byId = filterDocumentsByScope(
    [
      { id: "a", nombre: "1.pdf" },
      { id: "b", nombre: "2.pdf" },
    ],
    { documentoIds: ["b"] }
  );
  assert.equal(byId.length, 1);
  assert.equal(byId[0]!.id, "b");

  const index = buildFolderIndex([
    { nombre: "a.pdf", ruta: "Escritos", hasText: true, extractionStatus: "completed" },
    { nombre: "b.pdf", ruta: "Escritos/Anexos", hasText: false, extractionStatus: "needs_ocr" },
    { nombre: "c.pdf", ruta: null, hasText: true },
  ]);
  assert.equal(index.Escritos?.count, 2);
  assert.equal(index.Escritos?.needsOcr, 1);
  assert.equal(index["(raíz)"]?.count, 1);

  const budget = excerptBudgetForUtility("doc_qa");
  assert.ok(budget.maxDocs >= 10);
  assert.ok(budget.includeExcerpts);

  const alerts = documentExtractionAlerts(
    [
      {
        nombre: "scan.pdf",
        extractionStatus: "needs_ocr",
        hasText: false,
        extractedMarkdown: "",
      },
    ],
    "doc_qa"
  );
  assert.ok(alerts.some((a) => /OCR/i.test(a)));

  console.log("ai/document-context.test.ts OK");
}

main();
