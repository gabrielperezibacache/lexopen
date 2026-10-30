import assert from "node:assert/strict";
import {
  getRequestId,
  log,
  newRequestId,
  runWithRequestId,
  setRequestId,
} from "./log";

const id = newRequestId();
assert.match(id, /^[a-z0-9]+-[a-z0-9]+$/i);

assert.equal(getRequestId(), null);

const seen: string[] = [];
const prevLog = console.log;
console.log = (line: string) => {
  seen.push(String(line));
};

runWithRequestId("req-test-1", () => {
  assert.equal(getRequestId(), "req-test-1");
  log.info("hello", { foo: 1 });
});

console.log = prevLog;
assert.equal(getRequestId(), null);
assert.equal(seen.length, 1);
const parsed = JSON.parse(seen[0]) as {
  level: string;
  msg: string;
  requestId: string;
  foo: number;
};
assert.equal(parsed.level, "info");
assert.equal(parsed.msg, "hello");
assert.equal(parsed.requestId, "req-test-1");
assert.equal(parsed.foo, 1);

setRequestId("req-enter");
assert.equal(getRequestId(), "req-enter");

console.log("log.test.ts OK");
