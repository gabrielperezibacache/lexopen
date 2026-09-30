import assert from "node:assert/strict";
import {
  calcularVencimiento,
  calcularVencimientoYmd,
  clasificarUrgencia,
  diasRestantes,
  easterSunday,
  feriadosMoviles,
  isDiaHabil,
  isFeriado,
  isWeekend,
  labelDiasRestantes,
  labelUrgencia,
  pueblosIndigenasYmd,
} from "./plazos";

function assertYmd(actual: Date, ymd: string, msg: string) {
  const iso = `${actual.getFullYear()}-${String(actual.getMonth() + 1).padStart(2, "0")}-${String(actual.getDate()).padStart(2, "0")}`;
  assert.equal(iso, ymd, msg);
}

const friday = new Date(2026, 6, 24, 12); // vie 24 jul 2026
assert.equal(isWeekend(friday), false);
const saturday = new Date(2026, 6, 25, 12);
assert.equal(isWeekend(saturday), true);

const habiles = calcularVencimiento({
  desde: friday,
  dias: 5,
  tipoComputo: "habiles",
});
assertYmd(habiles, "2026-07-31", "5 hábiles desde el viernes saltan el fin de semana");

const corridos = calcularVencimiento({
  desde: friday,
  dias: 5,
  tipoComputo: "corridos",
});
assertYmd(corridos, "2026-07-29", "5 corridos caen miércoles hábil");

assert.equal(
  calcularVencimientoYmd({
    desde: "2026-07-24",
    dias: 1,
    tipoComputo: "corridos",
  }),
  "2026-07-27",
  "corrido que cae sábado se corre al lunes"
);

assert.equal(
  calcularVencimientoYmd({
    desde: "2026-12-24",
    dias: 1,
    tipoComputo: "corridos",
  }),
  "2026-12-28",
  "Navidad 2026 es viernes; el corrido corre a lunes"
);

assert.equal(
  calcularVencimientoYmd({
    desde: "2025-12-30",
    dias: 2,
    tipoComputo: "habiles",
  }),
  "2026-01-02",
  "Año Nuevo no se cuenta como hábil"
);

assert.equal(
  calcularVencimientoYmd({
    desde: "2026-04-01",
    dias: 2,
    tipoComputo: "habiles",
  }),
  "2026-04-06",
  "Viernes y Sábado Santo quedan fuera del cómputo hábil"
);

assert.equal(
  calcularVencimientoYmd({
    desde: "2026-09-04",
    dias: 1,
    tipoComputo: "habiles",
  }),
  "2026-09-07",
  "el cambio de hora de septiembre no se come un día"
);

assert.equal(isDiaHabil(new Date(2026, 0, 2, 12)), true);
assert.equal(isDiaHabil(new Date(2026, 0, 1, 12)), false);

const easter2026 = easterSunday(2026);
assert.equal(easter2026.getFullYear(), 2026);
assert.equal(easter2026.getMonth(), 3);
assert.equal(easter2026.getDate(), 5);
assert.equal(isFeriado(new Date(2026, 3, 3, 12)), true, "Viernes Santo");
assert.equal(isFeriado(new Date(Date.UTC(2026, 3, 4, 12))), true, "Sábado Santo");

assert.equal(pueblosIndigenasYmd(2024), "2024-06-20");
assert.equal(pueblosIndigenasYmd(2025), "2025-06-20");
assert.equal(pueblosIndigenasYmd(2026), "2026-06-21");
assert.equal(feriadosMoviles(2026).has("2026-06-22"), false);

const sanPedro2027 = feriadosMoviles(2027);
assert.equal(sanPedro2027.has("2027-06-28"), true, "29 jun 2027 martes → lunes 28");
assert.equal(sanPedro2027.has("2027-06-29"), false);
assert.equal(sanPedro2027.has("2027-07-05"), false);

assert.equal(feriadosMoviles(2024).has("2024-06-29"), true, "sábado no se mueve al lunes");
assert.equal(feriadosMoviles(2024).has("2024-07-01"), false);
assert.equal(feriadosMoviles(2026).has("2026-06-29"), true);
assert.equal(feriadosMoviles(2026).has("2026-10-12"), true);
assert.equal(feriadosMoviles(2018).has("2018-10-15"), true, "12 oct 2018 viernes → lunes 15");
assert.equal(feriadosMoviles(2022).has("2022-10-10"), true, "12 oct 2022 miércoles → lunes 10");
assert.equal(feriadosMoviles(2025).has("2025-06-29"), true, "domingo 2025 se mantiene");
assert.equal(feriadosMoviles(2025).has("2025-06-30"), false);

assert.equal(isFeriado(new Date(Date.UTC(2024, 8, 17, 12))), false, "no inventa puente del 17 sep");
assert.equal(isFeriado(new Date(Date.UTC(2024, 8, 18, 12))), true);
assert.equal(isFeriado(new Date(Date.UTC(2024, 8, 19, 12))), true);

const limite = new Date("2026-09-30T15:00:00.000Z");
const noche = new Date("2026-10-01T01:00:00.000Z");
assert.equal(diasRestantes(limite, noche), 0);
assert.equal(clasificarUrgencia(limite, noche), "critico");
assert.equal(labelUrgencia("critico", 0), "Vence hoy");
assert.equal(labelUrgencia("critico", 2), "Urgente");
assert.equal(labelUrgencia("proximo"), "Próximo");
assert.equal(labelUrgencia("vencido"), "Vencido");
assert.equal(labelDiasRestantes(0), "vence hoy");
assert.equal(labelDiasRestantes(-3), "venció hace 3 días");

console.log("plazos.test.ts OK");
