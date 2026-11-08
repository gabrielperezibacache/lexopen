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
  const outputName = (text: string) => {
    const task = prepare(text);
    assert.ok(task?.kind === "google-workspace");
    return task.args.name;
  };
  assert.equal(outputName(`Descarga ${ordinary} con nombre "Mi resolución.pdf"`), "Mi resolución.pdf");
  assert.equal(outputName(`Descarga ${ordinary} como Sentencia.pdf`), "Sentencia.pdf");
  assert.equal(outputName(`Download ${ordinary} as Judgment.pdf`), "Judgment.pdf");
  assert.equal(outputName(`Descarga ${ordinary}`), undefined);
  for (const name of ["../x.pdf", "/tmp/x.pdf", "dir/x.pdf", "dir\\x.pdf", ".bashrc", "x\u0001.pdf", "x\u007f.pdf", "x".repeat(161)]) assert.equal(prepare(`Descarga ${ordinary} con nombre "${name}"`), null);
  assert.equal(prepare("Descarga " + "x".repeat(15_001)), null);
  assert.equal(prepareExplicitFileTask(`Descarga ${ordinary}`, "", workspace, selected), null);
});

test("Dropbox stages only an exact literal account path in the selected account", () => {
  const dropbox = `altazor-dropbox-${suffix}`, connectors = [...selected, dropbox];
  for (const text of ['Descarga el archivo "/Docencia/Curso.pdf" de Dropbox', 'Por favor, descarga desde Dropbox el archivo /Docencia/Curso.pdf', 'Download the file `/Docencia/Curso.pdf` from Dropbox']) assert.deepEqual(prepare(text, connectors), { kind: "dropbox", connector: dropbox, action: "download_file", args: { path: "/Docencia/Curso.pdf" } });
  const exact = "/Docencia/Programa de teoría jurídica.pdf";
  const quoted = prepare(`Descarga el archivo "${exact}" de Dropbox y verifica cuántas páginas tiene.`, connectors); assert.equal(quoted?.kind, "dropbox"); assert.equal(quoted?.kind === "dropbox" ? quoted.args.path : null, exact);
  for (const scopes of [[], ["-"], selected, ["altazor-dropbox-0123456789abcdef"]]) assert.equal(prepare('Descarga el archivo "/Docencia/Curso.pdf" de Dropbox', scopes), null);
  assert.equal(prepareExplicitFileTask('Descarga el archivo "/Docencia/Curso.pdf" de Dropbox', "other-owner", workspace, connectors), null);
  assert.equal(prepareExplicitFileTask('Descarga el archivo "/Docencia/Curso.pdf" de Dropbox', owner, "other-workspace", connectors), null);
});
test("Dropbox never resolves shared links, searches titles or changes an ambiguous path", () => {
  const connectors = [...selected, `altazor-dropbox-${suffix}`];
  for (const text of [
    'Descarga el archivo "Curso.pdf" de Dropbox', 'Busca y descarga el archivo "/Docencia/Curso.pdf" de Dropbox',
    'No descargues el archivo "/Docencia/Curso.pdf" de Dropbox', 'Descarga el archivo "/Docencia/Curso.pdf" de Dropbox si te confirmo',
    'Descarga el archivo /Docencia/Curso.pdf. de Dropbox', 'Descarga el archivo "/Docencia/../Curso.pdf" de Dropbox',
    "Descarga el archivo /Docencia/O'Brien.pdf de Dropbox", 'Descarga el archivo /Docencia/Curso.pdf<extra de Dropbox',
    'Descarga el archivo /Docencia/Programa de teoría.pdf de Dropbox',
    'Descarga desde Dropbox el archivo /Docencia/Programa de teoría.pdf',
    'Descarga el archivo /Docencia/Programa de teoría.pdf de Dropbox y verifica sus páginas',
    'Descarga el archivo /Docencia/Programa de Dropbox teoría.pdf',
    'Descarga desde Dropbox el archivo /Docencia/Programa verifica teoría.pdf',
    'Descarga desde Dropbox el archivo /Docencia/Programa y verifica teoría.pdf',
    'Descarga el archivo /Docencia/Programa.pdf de Dropbox y verifica sus páginas',
    'Descarga el archivo "/Docencia/Programa.pdf" texto adicional de Dropbox',
    'Descarga el archivo "/Docencia/Programa.pdf" de Dropbox texto adicional',
    'Descarga el archivo "/Docencia//Curso.pdf" de Dropbox', 'Descarga el archivo "/Docencia/%2e%2e/Curso.pdf" de Dropbox',
    'Descarga el archivo "/Docencia/Curso.pdf?dl=1" de Dropbox', 'Descarga el archivo "/Docencia/Curso.pdf#x" de Dropbox',
    'Descarga el archivo "/Docencia/Curso.pdf" de Dropbox y el archivo "/Docencia/Otro.pdf"',
    'Descarga el archivo "/Docencia/Curso.pdf" de Dropbox o /Docencia/Otro.pdf',
    'Descarga el archivo "/Docencia/Curso.pdf" de Dropbox con nombre Otro.pdf',
    'Descarga el archivo "/Docencia/Curso.pdf" de Dropbox como Otro.pdf',
    'Descarga el archivo "/Docencia/Curso.pdf" de Dropbox y envía el resultado por correo',
    'Descarga el archivo "/Docencia/Curso.pdf" de Dropbox usando altazor-dropbox-0123456789abcdef',
    'Descarga https://www.dropbox.com/scl/fi/example/Curso.pdf?dl=1',
    'Descarga el archivo "/Docencia/Curso.pdf" de Dropbox desde https://www.dropbox.com/scl/fi/example/Curso.pdf',
  ]) assert.equal(prepare(text, connectors), null, text);
  // A word in an existing Drive output filename must not steal its provider.
  assert.equal(prepare(`Descarga ${ordinary} con nombre "Notas de Dropbox.pdf"`, connectors)?.kind, "google-workspace");
});
test("Dropbox preserves quoted spaces and JSON-special Unicode paths without repairing malformed Unicode", () => {
  const dropbox = `altazor-dropbox-${suffix}`, connectors = [dropbox];
  for (const path of ["/Docencia/Programa de teoría.pdf", '/Docencia/Teoría & <prueba> "citada".pdf']) {
    const task = prepare('Descarga el archivo `' + path + '` de Dropbox y verifica cuántas páginas tiene.', connectors);
    assert.deepEqual(task, { kind: "dropbox", connector: dropbox, action: "download_file", args: { path } });
    assert.equal(JSON.parse(JSON.stringify(task)).args.path, path);
  }
  assert.equal(prepare('Descarga el archivo `/Docencia/Programa\ud800.pdf` de Dropbox', connectors), null);
});
