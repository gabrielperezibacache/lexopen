import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { parseDateInput } from "./date-input";
import { plazoCreateSchema } from "./schemas";
import { calcularVencimientoYmd, MAX_DIAS_PLAZO } from "./plazos";

test("dates reject rollover and malformed clock values", () => {
  for (const value of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-11-00", "2026-11-24T24:00", "2026-11-24T12:60Z", "2026-11-24T12:00:60Z", "2026-11-24garbage", "not a date"]) {
    assert.equal(parseDateInput(value), null, value);
    assert.equal(plazoCreateSchema.safeParse({ titulo: "Prueba", fechaLimite: value, diasPlazo: 5 }).success, false, "An invalid manual date cannot fall back to a calculation");
  }
  assert.equal(parseDateInput("2024-02-29T10:30:00-03:00")?.toISOString(), "2024-02-29T13:30:00.000Z");
});
test("the deadline engine bounds work before iterating", () => {
  for (const dias of [-1, 1.5, NaN, Infinity, MAX_DIAS_PLAZO + 1, 1e12]) {
    assert.throws(() => calcularVencimientoYmd({ desde: "2026-11-24", dias }), RangeError);
  }
  assert.equal(plazoCreateSchema.safeParse({ titulo: "Prueba", diasPlazo: MAX_DIAS_PLAZO + 1 }).success, false);
  assert.equal(calcularVencimientoYmd({ desde: "2026-11-24", dias: 0 }), "2026-11-24");
});
test("date-only deadline input keeps its civil day across host timezones", () => {
  for (const TZ of ["UTC", "America/Santiago", "Asia/Tokyo", "Australia/Sydney"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `import {parseDateInput} from './src/lib/date-input.ts'; import {civilDateKey} from './src/lib/chile-time.ts'; process.stdout.write(civilDateKey(parseDateInput('2026-11-24')));`], { env: { ...process.env, TZ }, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "2026-11-24", TZ);
  }
});
