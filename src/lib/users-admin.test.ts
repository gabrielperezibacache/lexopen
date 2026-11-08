import assert from "node:assert/strict";
import { assertNoSelfEscalation, isUserRole, pickAvatarColor } from "./users-admin";
import { FOUNDER_ADMIN_GRANTS } from "./auth/permissions";

assert.equal(isUserRole("admin"), true);
assert.equal(isUserRole("socio"), true);
assert.equal(isUserRole("abogado"), true);
assert.equal(isUserRole("procurador"), true);
assert.equal(isUserRole("asistente"), true);
assert.equal(isUserRole("contabilidad"), true);
assert.equal(isUserRole("externo"), true);
assert.equal(isUserRole("cliente"), true);
assert.equal(isUserRole(""), false);
assert.equal(isUserRole("paralegal"), false);

const a = pickAvatarColor("Ana Pérez");
const b = pickAvatarColor("Ana Pérez");
const c = pickAvatarColor("Bruno López");
assert.equal(a, b);
assert.match(a, /^#[0-9a-f]{6}$/i);
assert.ok(typeof c === "string");

assert.throws(() => assertNoSelfEscalation({ role: "admin" }, { role: "admin", capabilityGrants: "doc.privileged.read" }), /ampliar sus propios permisos/);
assert.throws(() => assertNoSelfEscalation({ role: "admin" }, { role: "socio" }), /ampliar sus propios permisos/);
assert.throws(() => assertNoSelfEscalation({ role: "admin", capabilityRevokes: "assistant.use" }, { role: "admin" }), /ampliar sus propios permisos/);
assert.doesNotThrow(() => assertNoSelfEscalation({ role: "admin" }, { role: "admin", capabilityRevokes: "assistant.use" }));
const founder = { role: "admin", capabilityGrants: FOUNDER_ADMIN_GRANTS.join(",") };
assert.doesNotThrow(() => assertNoSelfEscalation(founder, { ...founder }));
assert.doesNotThrow(() => assertNoSelfEscalation(founder, { ...founder, capabilityGrants: "" }));

console.log("users-admin.test.ts OK");
