import assert from "node:assert/strict";
import { assertCausaAccess, assertCausaCapability, causaAccessWhere } from "./causa-access";
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

async function boundaries() {
  let queries = 0;
  const data = { id: "cause", acceso: "equipo", abogadoId: "responsible", miembros: [{ id: "member", rol: "lectura" }] };
  const client = {
    causa: { findUnique: async () => { queries++; return data; } },
  } as unknown as NonNullable<Parameters<typeof assertCausaAccess>[3]>;

  await assert.rejects(assertCausaAccess("cause", { id: "portal", role: "cliente", capabilityGrants: "causa.read,causa.override_walls" }, { auditOverride: false }, client), /No encontrada/);
  assert.equal(queries, 0, "el portal no consulta expedientes internos aunque tenga un grant");
  await assert.rejects(assertCausaAccess("cause", { id: "unknown", role: "desconocido", capabilityGrants: "causa.read" }, { auditOverride: false }, client), /No encontrada/);
  assert.equal(queries, 0);

  const responsible = await assertCausaAccess("cause", { id: "responsible", role: "abogado" }, { auditOverride: false }, client);
  assert.equal(responsible.causaRol, "responsable", "abogadoId es la autoridad del responsable aunque haya una membresía antigua");
  await assertCausaCapability("cause", { id: "responsible", role: "abogado" }, "causa.team.manage", client);
  await assert.rejects(assertCausaCapability("cause", { id: "reader", role: "asistente" }, "escrito.draft", client), /Prohibido/);
  await assert.rejects(assertCausaCapability("cause", { id: "reader", role: "asistente" }, "plazo.edit", client), /Prohibido/);
  data.miembros[0].rol = "colaborador";
  await assertCausaCapability("cause", { id: "writer", role: "asistente" }, "escrito.draft", client);
  data.miembros[0].rol = "desconocido";
  await assert.rejects(assertCausaCapability("cause", { id: "writer", role: "abogado" }, "causa.write", client), /No encontrada/);
  const scopedOverride = { id: "limited", role: "contabilidad", capabilityGrants: "causa.override_walls" };
  data.miembros = [];
  for (const acceso of ["equipo", "estudio"]) {
    data.acceso = acceso;
    await assert.rejects(assertCausaAccess("cause", scopedOverride, { auditOverride: false }, client), /No encontrada/, `${acceso}: override no amplía lectura scoped`);
  }
  assert.notDeepEqual(causaAccessWhere(scopedOverride), {});
  data.miembros = [{ id: "member", rol: "lectura" }];
  await assertCausaAccess("cause", scopedOverride, { auditOverride: false }, client);
  console.log("causa-access.test.ts OK");
}
void boundaries().catch(error => { console.error(error); process.exitCode = 1; });
