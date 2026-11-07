import assert from "node:assert/strict";
import { test } from "node:test";
import { continueApprovedRead } from "./approval-continuation";
import type { KittiesGateway } from "./gateway";

const target = { chatId: "owned-chat", kittyId: "owned-kitty", actionId: "persisted-action", expiresAt: new Date(Date.now() + 60_000) };
const authorized = async () => {};
function fixture(states: boolean[], failSend = false, failRead = false) {
  const sent: unknown[][] = [], reads: string[][] = [];
  const client = {
    async chat(...args: string[]) { reads.push(args); if (failRead) throw Error("private transport failure"); return { working: states.shift() ?? true, turns: [] }; },
    async send(...args: unknown[]) { sent.push(args); if (failSend) throw Error("private transport failure"); return { accepted: true, requestId: String(args[3]) }; },
  } as Pick<KittiesGateway, "chat" | "send">;
  return { client, sent, reads };
}
test("an approved read continues once on the same chat with a stable durable request id", async () => {
  const f = fixture([true, false]); let waits = 0;
  assert.deepEqual(await continueApprovedRead(f.client, target, authorized, async () => { waits++; }), { continued: true });
  assert.deepEqual(f.sent, [["owned-chat", "continua", [], "approval_persisted-action"]]);
  assert.deepEqual(f.reads, [["owned-chat", "owned-kitty"], ["owned-chat", "owned-kitty"]]); assert.equal(waits, 1);
});
test("busy or unreadable work never creates a parallel continuation", async () => {
  for (const f of [fixture(Array(9).fill(true)), fixture([], false, true)]) {
    assert.deepEqual(await continueApprovedRead(f.client, target, authorized, async () => {}), { continued: false, continuationPending: true });
    assert.equal(f.sent.length, 0); assert.ok(f.reads.length <= 9);
  }
});
test("uncertain continuation acknowledgement is not retried or reflected to the user", async () => {
  const f = fixture([false], true);
  await assert.rejects(continueApprovedRead(f.client, target, authorized), error => {
    const value = error as { code: string; message: string };
    return value.code === "continuation_unknown" && !value.message.includes("private");
  });
  assert.equal(f.sent.length, 1);
});
test("expiry and current authorization are checked before sending the continuation", async () => {
  const expired = fixture([false]);
  await continueApprovedRead(expired.client, { ...target, expiresAt: new Date(0) }, authorized);
  assert.equal(expired.sent.length, 0); assert.equal(expired.reads.length, 0);
  const revoked = fixture([false]);
  await assert.rejects(continueApprovedRead(revoked.client, target, async () => { throw Error("revoked"); }), /revoked/);
  assert.equal(revoked.sent.length, 0);
});
