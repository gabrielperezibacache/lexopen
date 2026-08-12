import assert from "node:assert/strict";
import { resolveDocumentoExport } from "@/lib/integrations/obsidian-docs";

function main() {
  assert.equal(resolveDocumentoExport({ nombre: "x.pdf", contenido: "" }), null);
  assert.equal(
    resolveDocumentoExport({
      nombre: "scan.pdf",
      extractedMarkdown: "",
      contenido: null,
    }),
    null
  );

  const fromMd = resolveDocumentoExport({
    nombre: "demanda.pdf",
    ruta: "Escritos/2024",
    contenido: "viejo",
    extractedMarkdown: "# Demanda\n\nHechos…",
  });
  assert.ok(fromMd);
  assert.equal(fromMd!.body, "# Demanda\n\nHechos…");
  assert.equal(fromMd!.relativeFile, "Escritos/2024/demanda.md");

  const fallback = resolveDocumentoExport({
    nombre: "nota.md",
    ruta: null,
    contenido: "solo contenido",
  });
  assert.equal(fallback!.relativeFile, "nota.md");
  assert.equal(fallback!.body, "solo contenido");

  console.log("obsidian-docs.test.ts OK");
}

main();
