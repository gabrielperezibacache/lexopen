import {
  calcularVencimiento,
  isDiaHabil,
  isWeekend,
  easterSunday,
  isFeriado,
} from "./plazos";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const friday = new Date(2026, 6, 24, 12); // Fri Jul 24 2026
assert(!isWeekend(friday), "friday weekday");
const saturday = new Date(2026, 6, 25, 12);
assert(isWeekend(saturday), "saturday");

const v = calcularVencimiento({ desde: friday, dias: 5, tipoComputo: "habiles" });
assert(v.getDate() === 31 && v.getMonth() === 6, `expected Jul 31 got ${v.toISOString()}`);

const corridos = calcularVencimiento({
  desde: friday,
  dias: 5,
  tipoComputo: "corridos",
});
assert(corridos.getDate() === 29, `corridos day ${corridos.getDate()}`);

assert(isDiaHabil(new Date(2026, 0, 2, 12)), "Jan 2 2026 weekday");
assert(!isDiaHabil(new Date(2026, 0, 1, 12)), "New Year feriado");

const easter2026 = easterSunday(2026);
assert(
  easter2026.getFullYear() === 2026 &&
    easter2026.getMonth() === 3 &&
    easter2026.getDate() === 5,
  `Easter 2026 expected Apr 5 got ${easter2026.toISOString()}`
);
assert(isFeriado(new Date(2026, 3, 3, 12)), "Good Friday 2026");

console.log("plazos.test.ts OK");
