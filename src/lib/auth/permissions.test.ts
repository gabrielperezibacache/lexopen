import assert from "node:assert/strict";
import {
  can,
  canSome,
  capabilityLevel,
  CAPABILITIES,
  FOUNDER_ADMIN_GRANTS,
  parseCapabilityCsv,
  presetLevel,
} from "./permissions";
import { ROLES } from "./roles";

// Matriz §3.3 — muestras clave admin ≠ socio
assert.equal(presetLevel("admin", "host.admin"), "all");
assert.equal(presetLevel("socio", "host.admin"), "none");
assert.equal(presetLevel("admin", "causa.override_walls"), "none");
assert.equal(presetLevel("socio", "causa.override_walls"), "all");
assert.equal(presetLevel("admin", "doc.privileged.read"), "none");
assert.equal(presetLevel("socio", "doc.privileged.read"), "all");
assert.equal(presetLevel("abogado", "doc.confidential.read"), "all");
assert.equal(presetLevel("asistente", "doc.confidential.read"), "none");
assert.equal(presetLevel("procurador", "escrito.draft"), "all");
assert.equal(presetLevel("contabilidad", "billing.manage"), "all");
assert.equal(presetLevel("contabilidad", "causa.read"), "scoped");
assert.equal(presetLevel("externo", "assistant.use"), "none");
assert.equal(presetLevel("cliente", "assistant.use"), "none");

// Grants / revokes
assert.equal(
  can({ role: "admin", capabilityGrants: "causa.override_walls" }, "causa.override_walls"),
  true
);
assert.equal(
  can(
    { role: "socio", capabilityRevokes: "causa.override_walls" },
    "causa.override_walls"
  ),
  false
);
assert.equal(
  can(
    {
      role: "abogado",
      capabilityGrants: "host.admin",
      capabilityRevokes: "host.admin",
    },
    "host.admin"
  ),
  false,
  "revokes ganan"
);

// Scoped
assert.equal(can("abogado", "causa.write"), false);
assert.equal(can("abogado", "causa.write", { causaRol: "colaborador" }), true);
assert.equal(can("abogado", "causa.write", { causaRol: "lectura" }), false);
assert.equal(can("abogado", "causa.team.manage", { causaRol: "colaborador" }), false);
assert.equal(can("abogado", "causa.team.manage", { causaRol: "responsable" }), true);
assert.equal(canSome("abogado", "causa.write"), true);
assert.equal(canSome("cliente", "causa.write"), false);

assert.ok(FOUNDER_ADMIN_GRANTS.includes("causa.override_walls"));
assert.deepEqual(parseCapabilityCsv(" a,b , causa.read,x "), ["causa.read"]);

for (const role of ROLES) {
  for (const cap of CAPABILITIES) {
    const level = capabilityLevel(role, cap);
    assert.ok(
      level === "all" || level === "scoped" || level === "none",
      `${role}/${cap}`
    );
  }
}

console.log("permissions.test.ts OK");
