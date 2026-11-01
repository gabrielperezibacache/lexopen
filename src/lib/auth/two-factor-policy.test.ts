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
