import assert from "node:assert/strict";
import { fingerprint, pjudDemoAllowed } from "@/lib/pjud/provider";

assert.equal(
  fingerprint("Resolución", new Date(2026, 7, 11, 12), "R-1"),
  fingerprint(" resolución ", new Date(2026, 7, 11, 12), "R-1")
);
assert.notEqual(
  fingerprint("Resolución", new Date(2026, 7, 11, 12), "R-1"),
  fingerprint("Resolución", new Date(2026, 7, 12, 12), "R-1")
);

const previousNodeEnv = process.env.NODE_ENV;
const previousDemo = process.env.PJUD_ALLOW_DEMO;
process.env.NODE_ENV = "production";
process.env.PJUD_ALLOW_DEMO = "0";
assert.equal(pjudDemoAllowed(), false);
process.env.PJUD_ALLOW_DEMO = "1";
assert.equal(pjudDemoAllowed(), true);
if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;
if (previousDemo === undefined) delete process.env.PJUD_ALLOW_DEMO;
else process.env.PJUD_ALLOW_DEMO = previousDemo;

console.log("pjud/provider.test.ts OK");
