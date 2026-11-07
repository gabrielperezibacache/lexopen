import assert from "node:assert/strict";
import { connectorDesktopIntent } from "./connector-desktop-intent";
import { desktopConnectorTask } from "./tools/desktop-connector-task";
import { digest } from "@/lib/personal-connectors/core";

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
