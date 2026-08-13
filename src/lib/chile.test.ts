import { normalizarRut, validarRit, validarRut } from "./chile";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(validarRut("11.111.111-1"), "11111111-1 valid");
assert(!validarRut("11.111.111-2"), "bad dv");
assert(validarRut("111111111"), "sin guion ni puntos");
assert(validarRut("12.345.678-5"), "dv 5");
assert(!validarRut("12.345.678-9"), "placeholder dv 9 es inválido");
assert(validarRut("12.345.678\u20135"), "en-dash");
assert(normalizarRut("11.111.111-1") === "11111111-1", "normalize");
assert(normalizarRut("123456785") === "12345678-5", "normalize sin guion");
assert(normalizarRut("12.345.678\u20135") === "12345678-5", "normalize en-dash");
assert(validarRit("C-4521-2025"), "rit letter");
assert(validarRit("71345-2025"), "rit corte");
assert(!validarRit("abc"), "bad rit");

import { TRIBUNALES_CHILE } from "./chile";
assert(TRIBUNALES_CHILE.length >= 40, "tribunales ampliados para paridad CM");

console.log("chile.test.ts OK");
