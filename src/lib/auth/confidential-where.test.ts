import assert from "node:assert/strict";
import {
  confidentialWhere,
  minutaConfidentialWhere,
} from "@/lib/api";
import { FOUNDER_ADMIN_GRANTS } from "@/lib/auth/permissions";

// Admin técnico sin grants: ve confidencial, no privilegio (D9).
assert.deepEqual(confidentialWhere("admin"), { privilegio: false });
assert.deepEqual(
  confidentialWhere({
    role: "admin",
    capabilityGrants: FOUNDER_ADMIN_GRANTS.join(","),
  }),
  {}
);

assert.deepEqual(confidentialWhere("socio"), {});
assert.deepEqual(confidentialWhere("abogado"), {});
assert.deepEqual(confidentialWhere("asistente"), {
  confidencial: false,
  privilegio: false,
});
assert.deepEqual(confidentialWhere("cliente"), {
  confidencial: false,
  privilegio: false,
});

assert.deepEqual(minutaConfidentialWhere("admin"), {});
assert.deepEqual(minutaConfidentialWhere("abogado"), {});
assert.deepEqual(minutaConfidentialWhere("asistente"), {
  confidencial: false,
});
assert.equal(
  "privilegio" in minutaConfidentialWhere("asistente"),
  false,
  "Minuta where must not include privilegio"
);

console.log("confidential-where.test.ts OK");
