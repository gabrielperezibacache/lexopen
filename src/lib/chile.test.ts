import { normalizarRut, validarRit, validarRut } from "./chile";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(validarRut("11.111.111-1"), "11111111-1 valid");
assert(!validarRut("11.111.111-2"), "bad dv");
assert(normalizarRut("11.111.111-1") === "11111111-1", "normalize");
assert(validarRit("C-4521-2025"), "rit letter");
assert(validarRit("71345-2025"), "rit corte");
assert(!validarRit("abc"), "bad rit");

import { TRIBUNALES_CHILE } from "./chile";
assert(TRIBUNALES_CHILE.length >= 40, "tribunales ampliados para paridad CM");

console.log("chile.test.ts OK");
