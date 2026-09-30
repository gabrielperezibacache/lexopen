import assert from "node:assert/strict";
import {
  addCivilDays,
  allDayEventDates,
  civilDateKey,
  civilDayQueryRange,
  civilMonthQueryRange,
  formatCivilDate,
  santiagoDateKey,
  santiagoMidnight,
} from "./chile-time";

const utcMidnight = new Date("2026-09-01T00:00:00.000Z");
assert.equal(santiagoDateKey(utcMidnight), "2026-08-31");
assert.equal(
  civilDateKey(utcMidnight),
  "2026-09-01",
  "la fecha-solo UTC no retrocede en Chile"
);

// 1 sep 2026 22:00 CLT (aún UTC−4; el cambio de hora es el 5 sep)
const evening = new Date("2026-09-02T02:00:00.000Z");
assert.equal(santiagoDateKey(evening), "2026-09-01");
assert.equal(civilDateKey(evening), "2026-09-01");

// 30 sep 2026 22:00 CLST (UTC−3)
const sep30Night = new Date("2026-10-01T01:00:00.000Z");
assert.equal(civilDateKey(sep30Night), "2026-09-30");

const noonChile = new Date("2026-09-01T16:00:00.000Z");
assert.equal(civilDateKey(noonChile), "2026-09-01");

const day = civilDayQueryRange("2026-09-01");
assert.ok(day.start.getTime() <= Date.parse("2026-09-01T00:00:00.000Z"));
assert.ok(day.end.getTime() >= Date.parse("2026-09-02T02:00:00.000Z"));
assert.ok(day.end.getTime() < Date.parse("2026-09-02T12:00:00.000Z"));

const midnight = santiagoMidnight("2026-09-01");
assert.equal(santiagoDateKey(midnight), "2026-09-01");
assert.equal(santiagoDateKey(new Date(midnight.getTime() - 1)), "2026-08-31");

const september = civilMonthQueryRange(2026, 8);
assert.ok(september.start.getTime() <= Date.parse("2026-09-01T00:00:00.000Z"));
assert.ok(september.end.getTime() >= Date.parse("2026-10-01T01:00:00.000Z"));
assert.ok(september.end.getTime() < Date.parse("2026-10-01T12:00:00.000Z"));

assert.equal(addCivilDays("2026-09-04", 3), "2026-09-07");
assert.equal(formatCivilDate(utcMidnight), formatCivilDate("2026-09-01"));
assert.match(formatCivilDate("2026-09-01"), /2026/);
assert.deepEqual(allDayEventDates(evening), {
  start: "2026-09-01",
  end: "2026-09-02",
});
assert.deepEqual(allDayEventDates(utcMidnight), {
  start: "2026-09-01",
  end: "2026-09-02",
});

console.log("chile-time.test.ts OK");
