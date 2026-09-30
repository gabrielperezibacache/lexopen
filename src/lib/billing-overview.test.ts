import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { santiagoDateKey } from "./chile-time";
import {
  billingMonthLabel,
  billingMonthRange,
  receivableFromSums,
  summarizeProvision,
} from "./billing-overview";

const sep30Evening = new Date("2026-10-01T01:00:00.000Z");
assert.equal(santiagoDateKey(sep30Evening), "2026-09-30");
const september = billingMonthRange(sep30Evening);
assert.equal(santiagoDateKey(september.start), "2026-09-01");
assert.equal(september.label, "septiembre de 2026");
assert.ok(sep30Evening.getTime() >= september.start.getTime());
assert.ok(sep30Evening.getTime() <= september.end.getTime());

const oct1Morning = new Date("2026-10-01T03:00:00.000Z");
assert.equal(santiagoDateKey(oct1Morning), "2026-10-01");
const october = billingMonthRange(oct1Morning);
assert.equal(billingMonthLabel(oct1Morning), "octubre de 2026");
assert.ok(oct1Morning.getTime() >= october.start.getTime());
assert.ok(sep30Evening.getTime() < october.start.getTime());

assert.equal(receivableFromSums(160_000, 90_000), 70_000);
assert.equal(receivableFromSums(100_000, 100_000), 0);
assert.equal(receivableFromSums(100_000, 150_000), 0);
assert.equal(receivableFromSums(null, null), 0);

const provision = summarizeProvision([100_000, -40_000, 0, 25_000]);
assert.equal(provision.provisionClp, 125_000);
assert.equal(provision.adeudoClp, 40_000);
assert.equal(provision.netClp, 85_000);
assert.equal(provision.clientsInCredit, 2);
assert.equal(provision.clientsInDebt, 1);
assert.deepEqual(summarizeProvision([]), {
  provisionClp: 0,
  adeudoClp: 0,
  netClp: 0,
  clientsInCredit: 0,
  clientsInDebt: 0,
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const overview = fs.readFileSync(path.join(root, "src/lib/billing-overview.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "src/app/(app)/facturacion/page.tsx"), "utf8");
const summary = fs.readFileSync(path.join(root, "src/app/api/billing/summary/route.ts"), "utf8");
assert.match(overview, /timeEntry\.aggregate/);
assert.match(overview, /expense\.aggregate/);
assert.match(overview, /payment\.aggregate/);
assert.match(overview, /invoice\.aggregate/);
assert.match(overview, /_sum/);
assert.match(overview, /_count/);
assert.match(page, /loadBillingOverview/);
assert.doesNotMatch(page, /timeEntry\.findMany/);
assert.match(summary, /loadBillingOverview/);
assert.doesNotMatch(summary, /timeEntry\.findMany/);

console.log("billing-overview.test.ts OK");
