import assert from "node:assert/strict";
import { hitoDueYmd, isHitoReady } from "./plazos";
import { zonedTime } from "./time";

// Plazo vence 2026-06-20 → T-1 = 2026-06-19
assert.equal(
  hitoDueYmd(new Date("2026-06-20T15:00:00.000Z"), "T-1"),
  "2026-06-19"
);
assert.equal(
  hitoDueYmd(new Date("2026-06-20T15:00:00.000Z"), "T-7"),
  "2026-06-13"
);

{
  const fechaLimite = zonedTime("2026-06-20", "23:59", "America/Santiago");
  const before = zonedTime("2026-06-19", "08:59", "America/Santiago");
  const after = zonedTime("2026-06-19", "09:01", "America/Santiago");
  assert.equal(
    isHitoReady({ fechaLimite, hito: "T-1", now: before }),
    false
  );
  assert.equal(
    isHitoReady({ fechaLimite, hito: "T-1", now: after }),
    true
  );
}

console.log("notify/plazos-hitos.test.ts OK");
