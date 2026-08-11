/**
 * Contrato: LEXOPEN_TRUSTED_ORIGINS + igualdad estricta de origen.
 */
import assert from "node:assert/strict";
import { buildAllowedOrigins, isAllowedOrigin } from "./csrf";

const allowed = buildAllowedOrigins({
  host: "pc-estudio.tailXXXX.ts.net:3000",
  appUrl: "http://pc-estudio.tailXXXX.ts.net:3000",
  trustedCsv: "http://127.0.0.1:3000,http://localhost:3000",
});

assert.ok(allowed.includes("http://pc-estudio.tailXXXX.ts.net:3000"));
assert.ok(allowed.includes("http://127.0.0.1:3000"));
assert.ok(isAllowedOrigin("http://pc-estudio.tailXXXX.ts.net:3000", allowed));
assert.equal(
  isAllowedOrigin("http://pc-estudio.tailXXXX.ts.net:3000.attacker", allowed),
  false
);

console.log("api.csrf-origins.test.ts OK");
