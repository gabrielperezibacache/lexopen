import assert from "node:assert/strict";
import { parseListLimit } from "./list-limit";

assert.equal(parseListLimit(null), 100);
assert.equal(parseListLimit(undefined), 100);
assert.equal(parseListLimit("50"), 50);
assert.equal(parseListLimit("0"), 1);
assert.equal(parseListLimit("-3"), 1);
assert.equal(parseListLimit("9999"), 500);
assert.equal(parseListLimit("abc"), 100);
assert.equal(parseListLimit("80", { default: 40, max: 120 }), 80);
assert.equal(parseListLimit(null, { default: 40, max: 120 }), 40);
assert.equal(parseListLimit("200", { default: 40, max: 120 }), 120);

console.log("api/list-limit.test.ts OK");
