import assert from "node:assert/strict";
import { extractJson } from "./parse";

assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
assert.deepEqual(extractJson("```json\n{\"tramites\":[]}\n```"), { tramites: [] });
assert.deepEqual(extractJson('Aquí va: {"ok":true} fin'), { ok: true });
assert.equal(extractJson("sin json"), null);

console.log("ai/parse.test.ts OK");
