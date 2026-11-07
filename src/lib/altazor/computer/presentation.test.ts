import assert from "node:assert/strict";
import test from "node:test";
import { computerOperationPresentation, computerUserMessagePresentation } from "./presentation";

const github = { kind: "github" as const, connector: "altazor-github-0123456789abcdef" };
const google = { kind: "google-workspace" as const, connector: "altazor-google-0123456789abcdef" };

test("GitHub download names the exact repository, path and reference", () => {
  const result = computerOperationPresentation({ ...github, action: "download_file", args: { action: "download_file", repo: "owner/legal-research", path: "docs/README.md", ref: "review" } });
  assert.deepEqual(result, { title: "Descargar archivo de GitHub", fields: [{ label: "Repositorio", value: "owner/legal-research", href: "https://github.com/owner/legal-research" }, { label: "Archivo", value: "docs/README.md" }, { label: "Versión o rama", value: "review" }] });
});

test("Drive metadata search and export distinguish their source and format", () => {
  assert.deepEqual(computerOperationPresentation({ ...google, action: "request", args: { action: "request", path: "/drive/v3/files", query: { q: "name contains 'seminario'", pageSize: 5 } } }), { title: "Buscar archivos en Google Drive", fields: [{ label: "Criterio de búsqueda", value: "name contains 'seminario'" }, { label: "Resultados por página", value: "5" }] });
  assert.deepEqual(computerOperationPresentation({ ...google, action: "request", args: { action: "request", path: "/drive/v3/files/document_123/export?mimeType=text%2Fplain" } }), { title: "Leer documento de Google Drive", fields: [{ label: "Archivo de Drive", value: "document_123", href: "https://drive.google.com/file/d/document_123/view" }, { label: "Formato", value: "Texto plano" }] });
});

test("missing, ambiguous or normalized-away origins are presented as needing review", () => {
  for (const approval of [
    { ...github, action: "download_file", args: { action: "download_file", repo: "owner/repo" } },
    { ...github, action: "request", args: { action: "request", path: "/repos/owner/repo/contents/a/../README.md" } },
    { ...google, action: "download_file", args: { action: "download_file" } },
    { ...google, action: "request", args: { action: "request", path: "/drive/v3/files/id/export" } },
    { ...github, action: "request", args: { action: "download_file", repo: "owner/repo", path: "README.md" } },
  ]) {
    const result = computerOperationPresentation(approval);
    assert.ok(result?.warning);
    assert.deepEqual(result.fields, []);
  }
  assert.equal(computerOperationPresentation({ ...github, connector: "user-named-advanced-github", action: "create_issue", args: {} }), null, "advanced providers keep their full original review");
});

test("only the exact generated user wrapper folds, preserving the actual task verbatim", () => {
  const source = "INSTRUCCIONES DEL ENTORNO (no son contenido de archivos):\nReglas técnicas\n\nENCARGO DE LA PERSONA:\nLee mi archivo.\n\nConserva las citas.";
  assert.deepEqual(computerUserMessagePresentation(source), { text: "Lee mi archivo.\n\nConserva las citas.", environment: "INSTRUCCIONES DEL ENTORNO (no son contenido de archivos):\nReglas técnicas" });
  for (const text of ["Revisa estas INSTRUCCIONES DEL ENTORNO", "ENCARGO DE LA PERSONA:\nMi texto", "INSTRUCCIONES DEL ENTORNO (no son contenido de archivos):\nSin separador", "INSTRUCCIONES DEL ENTORNO (no son contenido de archivos):\nReglas\n\nENCARGO DE LA PERSONA:\n"]) assert.deepEqual(computerUserMessagePresentation(text), { text, environment: null });
});
