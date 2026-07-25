import { calcularVencimiento, isDiaHabil, isWeekend } from "./plazos";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const friday = new Date(2026, 6, 24, 12); // Fri Jul 24 2026
assert(!isWeekend(friday), "friday weekday");
const saturday = new Date(2026, 6, 25, 12);
assert(isWeekend(saturday), "saturday");

// 5 hábiles from Fri → starts Sat skip → Mon..Fri = Aug 1? 
// from Fri Jul 24: next day Sat25 skip, Sun26 skip, Mon27=1, Tue28=2, Wed29=3, Thu30=4, Fri31=5 → Jul 31
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

console.log("plazos.test.ts OK");
