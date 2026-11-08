import test from "node:test";
import assert from "node:assert/strict";
import { explicitDriveIntent } from "./drive-intent";

test("direct Drive requests enter Host tools without inventing source identities", () => {
  assert.deepEqual(explicitDriveIntent('Guarda el documento "Demanda final.pdf" en mi Drive'), { toolId: "drive.guardarDocumento", confidence: 1, slots: { documento: "Demanda final.pdf" } });
  assert.equal(explicitDriveIntent("Sube contrato.docx a Drive")?.slots.documento, "contrato.docx");
  assert.deepEqual(explicitDriveIntent("Guarda este documento en Drive")?.slots, {});
  assert.deepEqual(explicitDriveIntent('Crea una carpeta "Expediente Andes" en Drive')?.slots, { nombre: "Expediente Andes" });
  assert.deepEqual(explicitDriveIntent("Crea una carpeta en Drive")?.slots, {});
  assert.equal(explicitDriveIntent("Comprueba mi conexión de Google Drive")?.toolId, "drive.estado");
});
test("explanations, source text, other providers and multi-action requests are not silently reduced to a Drive write", () => {
  for (const text of ["¿Cómo guardo un documento en Drive?", "Explica cómo crear carpetas en Drive", "El documento dice: crea una carpeta en Drive", "Guarda documento.pdf en Dropbox", "Guarda el documento en Drive y envía un correo", "Revisa la conexión de Drive y guarda el documento", "Busca PDFs en Drive", "Lee el contenido de contrato.pdf en Drive"]) assert.equal(explicitDriveIntent(text), undefined, text);
});
