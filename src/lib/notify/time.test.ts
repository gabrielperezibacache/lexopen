import assert from "node:assert/strict";
import {
  addDaysYmd,
  parseHhmm,
  wallParts,
  zonedTime,
  isValidHhmm,
} from "./time";

assert.equal(addDaysYmd("2026-06-15", 1), "2026-06-16");
assert.equal(addDaysYmd("2026-06-15", -7), "2026-06-08");
assert.equal(parseHhmm("21:00", "08:00"), 21 * 60);
assert.equal(isValidHhmm("08:00"), true);
assert.equal(isValidHhmm("24:00"), false);

// 09:00 Chile en invierno (UTC−4): 2026-06-15 09:00 = 13:00 UTC
{
  const slot = zonedTime("2026-06-15", "09:00", "America/Santiago");
  const parts = wallParts(slot, "America/Santiago");
  assert.equal(parts.ymd, "2026-06-15");
  assert.equal(parts.hour, 9);
  assert.equal(parts.minute, 0);
}

// Transición DST Chile 2026-09-06 (hacia UTC−3): 09:00 sigue resolviendo.
{
  const slot = zonedTime("2026-09-07", "09:00", "America/Santiago");
  const parts = wallParts(slot, "America/Santiago");
  assert.equal(parts.ymd, "2026-09-07");
  assert.equal(parts.hour, 9);
}

console.log("notify/time.test.ts OK");
