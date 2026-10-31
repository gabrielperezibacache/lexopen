import assert from "node:assert/strict";
import {
  isTwoFactorExemptPath,
  mustEnrollTwoFactor,
} from "./two-factor-policy";

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

console.log("two-factor-policy.test.ts OK");
