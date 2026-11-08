import assert from "node:assert/strict";
import test from "node:test";
import { digest } from "@/lib/personal-connectors/core";
import { prepareExplicitFileTask } from "./file-task";

const owner = "fixture-owner", workspace = "fixture-workspace";
const suffix = digest(`${owner}:${workspace}`).slice(0, 16);
const google = `altazor-google-${suffix}`, github = `altazor-github-${suffix}`;
const selected = [google, github];
const prepare = (text: string, connectors: readonly string[] = selected) => prepareExplicitFileTask(text, owner, workspace, connectors);
const id = "1qJ_Resolucion-2026_fixture";
const ordinary = `https://drive.google.com/file/d/${id}/view?usp=sharing`;
const native = `https://docs.google.com/document/d/${id}/edit`;

test("a real-shaped Drive PDF link keeps its exact id and never requests conversion", () => {
  assert.deepEqual(prepare(`Descarga el PDF ${ordinary}`), { kind: "google-workspace", connector: google, action: "download_file", args: { id } });
  assert.deepEqual(prepare(`Descarga el archivo ${ordinary}`), { kind: "google-workspace", connector: google, action: "download_file", args: { id } });
  assert.equal(prepare(`¿Puedes descargar el archivo ${ordinary}?`)?.kind, "google-workspace");
  assert.deepEqual(prepare(`Por favor, descarga ${ordinary} en PDF con el nombre Sentencia.pdf`), { kind: "google-workspace", connector: google, action: "download_file", args: { id, name: "Sentencia.pdf" } });
  assert.equal(prepare(`Descarga https://drive.google.com/open?id=${id}`)?.args && "id" in prepare(`Descarga https://drive.google.com/open?id=${id}`)!.args, true);
});
test("native Google links export to the requested format or a reviewable PDF default", () => {
  for (const [words, format] of [["en PDF", "pdf"], ["en formato DOCX", "docx"], ["en Word", "docx"], ["como texto plano", "text"], ["en TXT", "text"], ["as plain text", "text"]]) {
    assert.deepEqual(prepare(`Descárgame ${native} ${words}`), { kind: "google-workspace", connector: google, action: "download_file", args: { id, format } });
  }
  assert.deepEqual(prepare(`Quiero descargar ${native}`), { kind: "google-workspace", connector: google, action: "download_file", args: { id, format: "pdf" } });
  for (const type of ["spreadsheets", "presentation"]) assert.equal(prepare(`Descarga https://docs.google.com/${type}/d/${id}/edit en PDF`)?.kind, "google-workspace");
  assert.equal(prepare(`Descarga ${native} en PDF y como DOCX`), null);
  assert.equal(prepare(`Descarga el original ${native}`), null);
  assert.equal(prepare(`Descarga ${native} sin convertir`), null);
  assert.equal(prepare(`Descarga el original ${ordinary}`)?.args && "format" in prepare(`Descarga el original ${ordinary}`)!.args, false);
});
test("GitHub blob URLs preserve the supplied repository, reference and full path", () => {
  assert.deepEqual(prepare("Download https://github.com/fictitious/lexopen/blob/review-2026/docs/README.md"), { kind: "github", connector: github, action: "download_file", args: { repo: "fictitious/lexopen", ref: "review-2026", path: "docs/README.md" } });
  assert.deepEqual(prepare("Descarga https://github.com/fictitious/lexopen/blob/a12b34c5/README.md guárdalo como Readme-local.md"), { kind: "github", connector: github, action: "download_file", args: { repo: "fictitious/lexopen", ref: "a12b34c5", path: "README.md", name: "Readme-local.md" } });
  assert.equal(prepare("Descarga https://github.com/fictitious/lexopen/blob/main/docs%2Fsecret.md"), null);
  assert.equal(prepare("Descarga https://github.com/fictitious/lexopen/blob/main/README.md en la rama other"), null);
});
test("an explicit README goal does not invent a branch or replace the selected repository", () => {
  const goal = "Descarga desde GitHub el README.md de fictitious/lexopen y verifica su primera línea.";
  assert.deepEqual(prepare(goal), { kind: "github", connector: github, action: "download_file", args: { repo: "fictitious/lexopen", path: "README.md" } });
  assert.deepEqual(prepare('Descarga el archivo "docs/My syllabus.md" del repositorio fictitious/lexopen rama "feature/course"'), { kind: "github", connector: github, action: "download_file", args: { repo: "fictitious/lexopen", path: "docs/My syllabus.md", ref: "feature/course" } });
  for (const text of ["Descarga README.md", "Descarga el repositorio fictitious/lexopen", "Descarga README.md de fictitious/lexopen y other/repository", "Descarga README.md y LICENSE.md de fictitious/lexopen"]) assert.equal(prepare(text), null);
});
test("negation, hypothetical requests and multiple targets never become a prepared operation", () => {
  for (const text of [
    `No descargues ${ordinary}`, `Descarga ${ordinary}, pero no lo hagas todavía`, `Download ${ordinary} if I confirm`, `Please don't download ${ordinary}`,
    `Cómo puedo descargar ${ordinary}`, `El documento dice: descarga ${ordinary}`, `Descarga ambos documentos ${ordinary}`,
    `Descarga ${ordinary} y ${native}`, `Descarga ${ordinary} y https://github.com/fictitious/lexopen/blob/main/README.md`,
    `Descarga ${ordinary} y el archivo README.md del repositorio fictitious/lexopen`, `Descarga ${native} con el nombre a.pdf con el nombre b.pdf`,
  ]) assert.equal(prepare(text), null, text);
});
test("canonical HTTPS hosts, unambiguous ids and safe literal paths are required", () => {
  for (const text of [
    `Descarga http://drive.google.com/file/d/${id}/view`, `Descarga https://drive.google.com.attacker.invalid/file/d/${id}`,
    `Descarga https://docs.google.com.attacker.invalid/document/d/${id}/edit`, `Descarga https://user:password@drive.google.com/file/d/${id}`,
    `Descarga https://drive.google.com:8443/file/d/${id}`, `Descarga https://drive.google.com/open?id=${id}&id=another`,
    `Descarga https://drive.google.com/file/d/invalid%2Fid/view`, `Descarga https://drive.google.com/file/d/../${id}`,
    `Descarga https://drive.google.com/file/d/${id}?id=another`, `Descarga https://docs.google.com/document/d/${"x".repeat(201)}`,
    "Descarga https://github.com.attacker.invalid/fictitious/lexopen/blob/main/README.md", "Descarga https://user@github.com/fictitious/lexopen/blob/main/README.md",
    "Descarga https://github.com/fictitious/lexopen/blob/main/docs/../README.md", "Descarga https://github.com/fictitious/lexopen/blob/main/docs/.%2e/README.md",
    "Descarga https://github.com/fictitious/lexopen/blob/main/docs/%252e%252e/README.md", "Descarga archivo ../README.md del repositorio fictitious/lexopen",
    "Descarga archivo docs/%2e%2e/README.md del repositorio fictitious/lexopen", "Descarga archivo docs\\README.md del repositorio fictitious/lexopen",
  ]) assert.equal(prepare(text), null, text);
});
test("selection is bound to the same owner and workspace; another alias cannot be substituted", () => {
  for (const connectors of [[], ["-"], ["advanced-google"], ["altazor-google-0123456789abcdef"], [github]]) assert.equal(prepare(`Descarga ${ordinary}`, connectors), null);
  assert.equal(prepareExplicitFileTask(`Descarga ${ordinary}`, "other-owner", workspace, selected), null);
  assert.equal(prepareExplicitFileTask(`Descarga ${ordinary}`, owner, "other-workspace", selected), null);
  assert.equal(prepare(`Descarga ${ordinary} usando altazor-google-0123456789abcdef`), null);
});
test("output names must be simple, bounded and explicitly supplied", () => {
  assert.equal(prepare(`Descarga ${ordinary} con nombre "Mi resolución.pdf"`)?.args.name, "Mi resolución.pdf");
  assert.equal(prepare(`Descarga ${ordinary} como Sentencia.pdf`)?.args.name, "Sentencia.pdf");
  assert.equal(prepare(`Download ${ordinary} as Judgment.pdf`)?.args.name, "Judgment.pdf");
  assert.equal(prepare(`Descarga ${ordinary}`)?.args.name, undefined);
  for (const name of ["../x.pdf", "/tmp/x.pdf", "dir/x.pdf", "dir\\x.pdf", ".bashrc", "x\u0001.pdf", "x\u007f.pdf", "x".repeat(161)]) assert.equal(prepare(`Descarga ${ordinary} con nombre "${name}"`), null);
  assert.equal(prepare("Descarga " + "x".repeat(15_001)), null);
  assert.equal(prepareExplicitFileTask(`Descarga ${ordinary}`, "", workspace, selected), null);
});
