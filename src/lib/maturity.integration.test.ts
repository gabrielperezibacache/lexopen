import assert from "node:assert/strict";
import {
  clientSiteWhere,
  clientVisibleFileWhere,
  confidentialFileWhere,
  isClientAllowedPath,
} from "@/lib/auth/access";
import { FOUNDER_ADMIN_GRANTS } from "@/lib/auth/permissions";
import { validarRuc, validarRut } from "@/lib/chile";
import { calcularVencimiento } from "@/lib/plazos";

const clientWhere = clientSiteWhere("user_1");
assert.deepEqual(clientWhere, {
  isClientVisible: true,
  members: { some: { userId: "user_1" } },
});

assert.deepEqual(confidentialFileWhere("cliente"), {
  confidencial: false,
  privilegio: false,
});
// Admin técnico (D9): ve confidencial, no privilegio salvo grant fundador.
assert.deepEqual(confidentialFileWhere("admin"), { privilegio: false });
assert.deepEqual(
  confidentialFileWhere({
    role: "admin",
    capabilityGrants: FOUNDER_ADMIN_GRANTS.join(","),
  }),
  {}
);
// Socio y abogado (incl. privilegio scoped) siguen viendo todo en listados 1.0.
assert.deepEqual(confidentialFileWhere("socio"), {});
assert.deepEqual(confidentialFileWhere("abogado"), {});
assert.deepEqual(clientVisibleFileWhere("cliente"), {
  AND: [
    { confidencial: false, privilegio: false },
    {
      OR: [
        { tags: "cliente" },
        { tags: { startsWith: "cliente," } },
        { tags: { startsWith: "cliente;" } },
        { tags: { endsWith: ",cliente" } },
        { tags: { endsWith: ";cliente" } },
        { tags: { contains: ",cliente," } },
        { tags: { contains: ";cliente;" } },
        { tags: { contains: ",cliente;" } },
        { tags: { contains: ";cliente," } },
      ],
    },
  ],
});
assert.deepEqual(clientVisibleFileWhere("asistente"), {
  confidencial: false,
  privilegio: false,
});
assert.deepEqual(clientVisibleFileWhere("abogado"), {});
assert.deepEqual(clientVisibleFileWhere("socio"), {});

assert.equal(isClientAllowedPath("/portal"), true);
assert.equal(isClientAllowedPath(""), false);
assert.equal(isClientAllowedPath("/notificaciones"), true);
assert.equal(isClientAllowedPath("/sites/site_1"), false);
assert.equal(isClientAllowedPath("/sites/site_1/archivos"), true);
assert.equal(isClientAllowedPath("/sites/site_1/qa"), true);
assert.equal(isClientAllowedPath("/facturacion"), false);

assert.equal(validarRut("12.345.678-5"), true);
assert.equal(validarRut("12.345.678-9"), false);
assert.equal(validarRuc("25001234567-8"), true);
assert.equal(validarRuc("RUC-INVALIDO"), false);

const due = calcularVencimiento({
  desde: new Date(2026, 6, 24, 12),
  dias: 3,
  tipoComputo: "habiles",
});
assert.equal(due.toISOString().slice(0, 10), "2026-07-29");

console.log("maturity integration tests ok");
