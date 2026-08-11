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

const env = process.env as Record<string, string | undefined>;
const previousNodeEnv = env.NODE_ENV;
const previousDemo = env.PJUD_ALLOW_DEMO;
env.NODE_ENV = "production";
env.PJUD_ALLOW_DEMO = "0";
assert.equal(pjudDemoAllowed(), false);
env.PJUD_ALLOW_DEMO = "1";
assert.equal(pjudDemoAllowed(), true);
if (previousNodeEnv === undefined) delete env.NODE_ENV;
else env.NODE_ENV = previousNodeEnv;
if (previousDemo === undefined) delete env.PJUD_ALLOW_DEMO;
else env.PJUD_ALLOW_DEMO = previousDemo;

console.log("pjud/provider.test.ts OK");
