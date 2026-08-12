import assert from "node:assert/strict";
import {
  confidentialWhere,
  minutaConfidentialWhere,
} from "@/lib/api";

assert.deepEqual(confidentialWhere("admin"), {});
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
