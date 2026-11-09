import assert from "node:assert/strict";
import { searchCommands } from "./command-search";
const items = [
  { id: "case", label: "Mis causas", group: "Causas", keywords: "organizar documentos carpetas Drive" },
  { id: "account", label: "Mi cuenta", group: "Estudio", keywords: "configuración preferencias" },
  { id: "settings", label: "Configuración", group: "Estudio", keywords: "Google Drive permisos" },
];
assert.deepEqual(searchCommands(items, "DRÍVE organizar").map(i => i.id), ["case"]);
assert.equal(searchCommands(items, "configuracion")[0].id, "settings", "exact labels outrank keyword matches");
assert.deepEqual(searchCommands(items, "cuenta mi").map(i => i.id), ["account"]);
assert.deepEqual(searchCommands(items, "Google Documentos"), [], "all terms must occur in the same authorized item");
assert.deepEqual(searchCommands(items.slice(0, 1), "configuracion"), [], "cannot invent hidden entries");
assert.deepEqual(searchCommands(items, "  "), items);
assert.deepEqual(items.map(i => i.id), ["case", "account", "settings"], "does not mutate the permission-filtered catalog");
console.log("Command search: accents, reordered terms, ranking, all terms, stable order and authorized-only input OK");
