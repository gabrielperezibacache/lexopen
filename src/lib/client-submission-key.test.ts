import assert from "node:assert/strict";
import { createSubmissionKeys, operationKey } from "./client-submission-key";

let generated = 0;
const submission = createSubmissionKeys(() => `operation-${++generated}`);
const payload = { invoiceId: "fixture", amountClp: 5000 };
const first = submission.forPayload(payload);
// Simulate server commit followed by a lost response: do not complete locally.
assert.equal(submission.forPayload({ amountClp: 5000, invoiceId: "fixture" }), first);
assert.equal(submission.forPayload(payload), first, "network/5xx/validation errors preserve the request identity");
const changed = submission.forPayload({ ...payload, amountClp: 6000 });
assert.notEqual(changed, first, "a changed payload starts a distinct operation");
submission.complete(payload);
assert.equal(submission.forPayload({ ...payload, amountClp: 6000 }), changed, "late success for old input cannot clear the new operation");
submission.complete({ ...payload, amountClp: 6000 });
assert.notEqual(submission.forPayload({ ...payload, amountClp: 6000 }), changed, "the same payment can legitimately be submitted again after success");
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const values = new Map<string, string>();
try {
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  const beforeReload = createSubmissionKeys(() => "reload-operation-1", "fixture-form");
  const original = beforeReload.forPayload(payload);
  const afterReload = createSubmissionKeys(() => "reload-operation-2", "fixture-form");
  assert.equal(afterReload.forPayload(payload), original, "lost responses preserve the logical key across reload");
  assert.ok(!values.get("fixture-form")?.includes("5000"), "session storage does not persist the form contents");
  afterReload.complete(payload);
  assert.equal(createSubmissionKeys(() => "reload-operation-3", "fixture-form").forPayload(payload), "reload-operation-3");
} finally {
  if (storageDescriptor) Object.defineProperty(globalThis, "sessionStorage", storageDescriptor);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
}
const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
try {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
  assert.match(operationKey(), /^op-[a-f0-9]{32}$/, "plain HTTP LAN does not require randomUUID or WebCrypto");
} finally {
  if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
  else Reflect.deleteProperty(globalThis, "crypto");
}
console.log("client logical submission keys tests ok");
