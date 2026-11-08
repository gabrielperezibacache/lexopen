import assert from "node:assert/strict";
import {
  isTwoFactorEnrollmentRelaxed,
  isTwoFactorExemptPath,
  mustEnrollTwoFactor,
} from "./two-factor-policy";

const prevE2e = process.env.LEXOPEN_E2E;
delete process.env.LEXOPEN_E2E;
assert.equal(isTwoFactorEnrollmentRelaxed(), false);

assert.equal(
  mustEnrollTwoFactor({
    role: "admin",
    totpEnabled: false,
    policyEnabled: true,
  }),
  true
);
assert.equal(
  mustEnrollTwoFactor({
    role: "socio",
    totpEnabled: false,
    policyEnabled: true,
  }),
  true
);
assert.equal(
  mustEnrollTwoFactor({
    role: "contabilidad",
    totpEnabled: false,
    policyEnabled: true,
  }),
  true
);
assert.equal(
  mustEnrollTwoFactor({
    role: "abogado",
    totpEnabled: false,
    policyEnabled: true,
  }),
  false
);

assert.equal(mustEnrollTwoFactor({ role: "abogado", capabilityGrants: "host.admin", totpEnabled: false, policyEnabled: true }), true, "administrar el Host por delegación también requiere 2FA");
assert.equal(mustEnrollTwoFactor({ role: "abogado", capabilityGrants: "host.admin", capabilityRevokes: "host.admin", totpEnabled: false, policyEnabled: true }), false, "un permiso revocado no activa el privilegio");
assert.equal(mustEnrollTwoFactor({ role: "admin", capabilityRevokes: "host.admin", totpEnabled: false, policyEnabled: true }), true, "la exigencia del rol privilegiado se conserva");
assert.equal(mustEnrollTwoFactor({ role: "abogado", capabilityGrants: "host.admin", totpEnabled: true, policyEnabled: true }), false);
assert.equal(mustEnrollTwoFactor({ role: "abogado", capabilityGrants: "host.admin", totpEnabled: false, policyEnabled: false }), false);
for (const role of ["cliente", "externo", "desconocido"]) {
  assert.equal(mustEnrollTwoFactor({ role, capabilityGrants: "host.admin", totpEnabled: false, policyEnabled: true }), false, `${role}: un grant no abre la administración interna`);
}
assert.equal(
  mustEnrollTwoFactor({
    role: "admin",
    totpEnabled: true,
    policyEnabled: true,
  }),
  false
);
assert.equal(
  mustEnrollTwoFactor({
    role: "admin",
    totpEnabled: false,
    policyEnabled: false,
  }),
  false
);

assert.equal(isTwoFactorExemptPath("/cuenta"), true);
assert.equal(isTwoFactorExemptPath("/cuenta/seguridad"), true);
assert.equal(isTwoFactorExemptPath("/api/auth/totp"), true);
assert.equal(isTwoFactorExemptPath("/api/auth/me"), true);
assert.equal(isTwoFactorExemptPath("/causas"), false);
assert.equal(isTwoFactorExemptPath("/api/causas"), false);

process.env.LEXOPEN_E2E = "1";
assert.equal(isTwoFactorEnrollmentRelaxed(), true);
assert.equal(
  mustEnrollTwoFactor({
    role: "admin",
    totpEnabled: false,
    policyEnabled: true,
  }),
  false,
  "e2e relaja enrolamiento obligatorio"
);
if (prevE2e === undefined) delete process.env.LEXOPEN_E2E;
else process.env.LEXOPEN_E2E = prevE2e;

console.log("two-factor-policy.test.ts OK");
