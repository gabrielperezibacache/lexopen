import assert from "node:assert/strict";
import { misCausasCapabilities, manualMisCausasAllowed } from "@/lib/pjud/mis-causas-access";

assert.deepEqual(misCausasCapabilities({ role: "socio" }), { sync: true, credentials: false });
assert.deepEqual(misCausasCapabilities({ role: "admin" }), { sync: false, credentials: true });
assert.deepEqual(misCausasCapabilities({ role: "admin", capabilityGrants: "causa.override_walls" }), { sync: true, credentials: true });
assert.deepEqual(misCausasCapabilities({ role: "abogado" }), { sync: false, credentials: false });
assert.deepEqual(misCausasCapabilities({ role: "abogado", capabilityGrants: "causa.override_walls,causa.write" }), { sync: true, credentials: false });
assert.equal(misCausasCapabilities({ role: "socio", capabilityRevokes: "causa.write" }).sync, false);
assert.equal(misCausasCapabilities({ role: "socio", capabilityRevokes: "causa.override_walls" }).sync, false);
assert.equal(misCausasCapabilities({ role: "asistente", capabilityGrants: "causa.override_walls,causa.write" }).sync, false);
assert.equal(misCausasCapabilities({ role: "admin", capabilityRevokes: "host.admin" }).credentials, false);
assert.equal(misCausasCapabilities({ role: "socio", capabilityGrants: "host.admin" }).credentials, true);
assert.equal(manualMisCausasAllowed({ role: "abogado" }), true);
assert.equal(manualMisCausasAllowed({ role: "abogado", capabilityRevokes: "causa.write" }), false);
assert.equal(manualMisCausasAllowed({ role: "asistente", capabilityGrants: "causa.write,causa.read" }), false);
assert.equal(manualMisCausasAllowed({ role: "cliente" }), false);

console.log("pjud/mis-causas-access.test.ts OK");
