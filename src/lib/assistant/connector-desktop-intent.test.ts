import assert from "node:assert/strict";
import { connectorDesktopIntent } from "./connector-desktop-intent";
import { desktopConnectorTask } from "./tools/desktop-connector-task";
import { digest } from "@/lib/personal-connectors/core";
import test from "node:test";

for (const text of ["Busca en Drive el syllabus de este curso", "Lee de Google Drive mi documento de trabajo", "Revisa en GitHub el repositorio elegido y prepara un resumen", "Por favor, lista mis repositorios en GitHub"]) {
  const result = connectorDesktopIntent(text);
  assert.equal(result?.toolId, "escritorio.encargar");
  assert.equal(result?.slots.texto, text);
}
for (const text of ["No leas en Drive", "¿Cómo conecto GitHub?", "Explica qué es Drive", "Busca mis documentos", "Lista mis causas", `Busca en Drive ${"a".repeat(4000)}`]) assert.equal(connectorDesktopIntent(text), undefined);
const suffix = digest("owner:workspace").slice(0, 16);
const ownGoogle = `altazor-google-${suffix}`, ownGithub = `altazor-github-${suffix}`;
assert.equal(desktopConnectorTask("Mi tarea", "owner", "workspace", []), "Mi tarea");
assert.equal(desktopConnectorTask("Mi tarea", "other-owner", "workspace", [ownGoogle, ownGithub]), "Mi tarea");
const google = desktopConnectorTask("Mi tarea", "owner", "workspace", [ownGoogle]);
assert.ok(google.includes(ownGoogle)); assert.equal(google.includes(ownGithub), false);
assert.ok(google.endsWith("ENCARGO DE LA PERSONA:\nMi tarea"));
assert.ok(google.includes("No accedas a correo"));
const github = desktopConnectorTask("Mi tarea", "owner", "workspace", [ownGithub]);
assert.ok(github.includes("sólo repositorios públicos")); assert.equal(github.includes(ownGoogle), false);
console.log("Connector requests retain complete text, reviewed routing and selected account recipes PASS.");

test("an explicit GitHub target goes to complete-file download before account discovery", () => {
  const task = "Lee README.md de other-public-owner/legal-research en GitHub y prepara un resumen.";
  const wrapped = desktopConnectorTask(task, "owner", "workspace", [ownGithub]);
  const recipe = wrapped.split("\n\nENCARGO DE LA PERSONA:\n")[0];
  assert.ok(recipe.indexOf("función download_file") < recipe.indexOf("función request"));
  assert.ok(recipe.includes("sin listar repositorios antes"));
  assert.ok(recipe.includes("aunque no aparezca en /user/repos"));
  assert.ok(recipe.includes("Usa ref sólo si la persona indicó"));
  assert.ok(wrapped.endsWith(`ENCARGO DE LA PERSONA:\n${task}`));
});

test("an explicit Drive link or id does not need a preliminary file listing", () => {
  const task = "Lee en Google Drive https://drive.google.com/file/d/user_supplied_id/view y conserva su origen.";
  const wrapped = desktopConnectorTask(task, "owner", "workspace", [ownGoogle]);
  const recipe = wrapped.split("\n\nENCARGO DE LA PERSONA:\n")[0];
  assert.ok(recipe.indexOf("función download_file") < recipe.indexOf("función request"));
  assert.ok(recipe.includes("sin listar ni buscar antes"));
  assert.ok(recipe.includes("nunca conviertas un título en un identificador inventado"));
  assert.ok(recipe.includes("En PDFs y archivos normales omite format"));
  assert.ok(wrapped.endsWith(`ENCARGO DE LA PERSONA:\n${task}`));
});

test("native function recipes do not mix fixed actions or invent a local reader", () => {
  const recipe = desktopConnectorTask("Lee mis archivos", "owner", "workspace", [ownGoogle, ownGithub]).split("\n\nENCARGO DE LA PERSONA:\n")[0];
  assert.doesNotMatch(recipe, /action=(?:request|get_file|download_file)/);
  assert.ok(recipe.includes("no agregues un campo action"));
  assert.equal(recipe.includes("artifact_read"), false);
  assert.ok(recipe.includes("ruta local verificada que devuelva el recibo"));
  assert.ok(recipe.includes("función run del contenedor"));
  assert.ok(recipe.includes("máximo 4 MiB y nunca descargas parciales"));
  assert.ok(recipe.includes("SHA-256"));
  assert.ok(recipe.includes(ownGoogle)); assert.ok(recipe.includes(ownGithub));
  const unselected = desktopConnectorTask("Lee mis archivos", "different-owner", "workspace", [ownGoogle, ownGithub]);
  assert.equal(unselected, "Lee mis archivos");
});
