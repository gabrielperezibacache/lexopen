import assert from "node:assert/strict";
import {
  folderSegmentsFromRuta,
  inferDocumentoTipo,
  normalizeIngestPath,
  shouldSkipIngestFile,
  sortIngestFiles,
} from "@/lib/document-ingest";

function main() {
  assert.equal(normalizeIngestPath(""), null);
  assert.deepEqual(normalizeIngestPath("demanda.pdf"), {
    ruta: null,
    nombre: "demanda.pdf",
    relativePath: "demanda.pdf",
  });
  assert.deepEqual(normalizeIngestPath("Carpeta/Escritos/demanda.pdf"), {
    ruta: "Carpeta/Escritos",
    nombre: "demanda.pdf",
    relativePath: "Carpeta/Escritos/demanda.pdf",
  });
  assert.deepEqual(normalizeIngestPath("Carpeta\\Escritos\\demanda.pdf"), {
    ruta: "Carpeta/Escritos",
    nombre: "demanda.pdf",
    relativePath: "Carpeta/Escritos/demanda.pdf",
  });
  assert.equal(normalizeIngestPath(".DS_Store"), null);
  assert.equal(normalizeIngestPath("Carpeta/.DS_Store"), null);
  assert.equal(normalizeIngestPath("Carpeta/._hidden.pdf"), null);
  assert.equal(normalizeIngestPath("node_modules/pkg/index.js"), null);

  assert.equal(inferDocumentoTipo("Escritos/demanda.pdf"), "escrito");
  assert.equal(inferDocumentoTipo("contratos/mandato.docx"), "contrato");
  assert.equal(inferDocumentoTipo("evidencia/captura.png"), "evidencia");
  assert.equal(inferDocumentoTipo("fotos/sala.jpg"), "evidencia");
  assert.equal(inferDocumentoTipo("varios/memo.txt"), "otro");

  assert.equal(
    shouldSkipIngestFile({ name: ".DS_Store", size: 12, webkitRelativePath: ".DS_Store" }),
    true
  );
  assert.equal(
    shouldSkipIngestFile({ name: "a.pdf", size: 0, webkitRelativePath: "a.pdf" }),
    true
  );
  assert.equal(
    shouldSkipIngestFile({
      name: "a.pdf",
      size: 10,
      webkitRelativePath: "Escritos/a.pdf",
    }),
    false
  );

  const sorted = sortIngestFiles([
    { name: "b.pdf", webkitRelativePath: "B/b.pdf" },
    { name: "a.pdf", webkitRelativePath: "A/a.pdf" },
  ]);
  assert.equal(sorted[0]!.webkitRelativePath, "A/a.pdf");

  assert.deepEqual(folderSegmentsFromRuta("Escritos/Anexos"), ["Escritos", "Anexos"]);
  assert.deepEqual(folderSegmentsFromRuta(null), []);

  console.log("document-ingest.test.ts OK");
}

main();
