import assert from "node:assert/strict";
import { causaAccessWhere } from "./causa-access";
import { FOUNDER_ADMIN_GRANTS } from "./permissions";

const admin = {
  id: "u-admin",
  role: "admin",
  capabilityGrants: FOUNDER_ADMIN_GRANTS.join(","),
};
const socio = { id: "u-socio", role: "socio" };
const abogado = { id: "u-abog", role: "abogado" };
const conta = { id: "u-conta", role: "contabilidad" };
const cliente = { id: "u-cli", role: "cliente" };

// Socio con override: sin filtro (ve todo, incluido muro).
assert.deepEqual(causaAccessWhere(socio), {});

// Admin con founder grants también override.
assert.deepEqual(causaAccessWhere(admin), {});

// Abogado (all causa.read, sin override): estudio + membresía.
const abogWhere = causaAccessWhere(abogado);
assert.ok(abogWhere.OR);
assert.ok(
  (abogWhere.OR as unknown[]).some(
    (x) => (x as { acceso?: string }).acceso === "estudio"
  )
);

// Contabilidad (scoped): solo miembro / abogado.
const contaWhere = causaAccessWhere(conta);
assert.ok(contaWhere.OR);
assert.equal(
  (contaWhere.OR as unknown[]).some(
    (x) => (x as { acceso?: string }).acceso === "estudio"
  ),
  false
);

// Cliente: bloqueado en helper de staff.
assert.deepEqual(causaAccessWhere(cliente), { id: "__none__" });

console.log("causa-access.test.ts OK");
