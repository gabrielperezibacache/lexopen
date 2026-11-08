import assert from "node:assert/strict";
import {
  can,
  canSome,
  capabilityLevel,
  CAPABILITIES,
  effectiveCapabilities,
  FOUNDER_ADMIN_GRANTS,
  parseCapabilityCsv,
  presetLevel,
} from "./permissions";
import { ROLES } from "./roles";
import { isAdmin } from "./rbac";

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

// El rol de causa limita el alcance sin sustituir el rol del estudio.
for (const [role, cap] of [
  ["asistente", "escrito.draft"],
  ["asistente", "plazo.edit"],
  ["abogado", "billing.manage"],
  ["procurador", "task.assign"],
  ["externo", "time.log"],
] as const) {
  assert.equal(can(role, cap, { causaRol: "lectura" }), false, `${role}/${cap}: lectura no muta`);
  assert.equal(can(role, cap, { causaRol: "lectura", own: true }), false, `${role}/${cap}: ser autor no eleva una membresía de lectura`);
  assert.equal(can(role, cap, { causaRol: "desconocido" }), false, `${role}/${cap}: membresía desconocida`);
  assert.equal(can(role, cap, { causaRol: "colaborador" }), true, `${role}/${cap}: colaborador conserva su alcance`);
}
assert.equal(can("contabilidad", "causa.read", { causaRol: "lectura" }), true);
assert.equal(can("abogado", "doc.privileged.read", { causaRol: "lectura" }), true);
assert.equal(can("abogado", "escrito.approve", { causaRol: "supervisor" }), true);
assert.equal(can("abogado", "escrito.approve", { causaRol: "colaborador", own: true }), false);
assert.equal(can("abogado", "causa.team.manage", { own: true }), false);
assert.equal(can("abogado", "evento.manage", { own: true }), true);
assert.equal(can("abogado", "evento.manage", { causaRol: "desconocido", own: true }), false);
assert.equal(can({ role: "abogado", capabilityRevokes: "causa.write" }, "causa.write", { causaRol: "responsable" }), false);

assert.equal(isAdmin("admin"), true);
assert.equal(isAdmin("socio"), false);
assert.equal(isAdmin({ role: "abogado", capabilityGrants: "host.admin" }), true);
assert.equal(isAdmin({ role: "admin", capabilityRevokes: "host.admin" }), false);
for (const role of ["cliente", "externo", "desconocido"]) {
  assert.equal(isAdmin({ role, capabilityGrants: "host.admin" }), false, `${role} no administra el Host con un grant`);
  assert.equal(can({ role, capabilityGrants: "host.admin" }, "host.admin"), false);
  assert.equal(effectiveCapabilities({ role, capabilityGrants: "host.admin" }).find(item => item.cap === "host.admin")?.level, "none");
}

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
