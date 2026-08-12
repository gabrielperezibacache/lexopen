import assert from "node:assert/strict";
import { assertSafeSalasUrl, defaultSalasUrl } from "@/lib/pjud/salas-url";

assert.match(defaultSalasUrl(), /salas\.pjud\.cl/);
assert.match(assertSafeSalasUrl(undefined), /salas\.pjud\.cl/);
assert.match(
  assertSafeSalasUrl("https://www.salas.pjud.cl/agenda"),
  /www\.salas\.pjud\.cl/
);
assert.throws(() => assertSafeSalasUrl("https://evil.com/"), /no permitida/);
assert.throws(
  () => assertSafeSalasUrl("https://user:pass@salas.pjud.cl/"),
  /credenciales/
);
assert.throws(() => assertSafeSalasUrl("javascript:alert(1)"), /inválida|solo/);

console.log("pjud/salas-url.test.ts OK");
