import assert from "node:assert/strict";
import {
  addDaysYmd,
  mondayOfWeek,
  shiftWeek,
  weekDays,
} from "./week";

assert.equal(mondayOfWeek("2026-09-30"), "2026-09-28"); // miércoles → lunes 28
assert.equal(mondayOfWeek("2026-09-28"), "2026-09-28");
assert.equal(mondayOfWeek("2026-09-27"), "2026-09-21"); // domingo → lunes previo
assert.deepEqual(weekDays("2026-09-28"), [
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
]);
assert.equal(addDaysYmd("2026-09-30", 1), "2026-10-01");
assert.equal(shiftWeek("2026-09-28", 1), "2026-10-05");

console.log("calendario/week.test.ts OK");
