import assert from "node:assert/strict";
import {
  parsePjudWebhookPayload,
  signPjudWebhookPayload,
  verifyPjudWebhookSignature,
} from "@/lib/pjud/webhook";

const env = process.env as Record<string, string | undefined>;
const previousSecret = env.PJUD_WEBHOOK_SECRET;
env.PJUD_WEBHOOK_SECRET = "webhook-test-secret";

const raw = JSON.stringify({
  operationId: "op-1",
  rit: "C-4521-2025",
  tribunal: "1º Juzgado Civil de Santiago",
  movimientos: [
    {
      id: "movement-1",
      titulo: "Resolución: proveído",
      fecha: "2026-08-12",
    },
  ],
});
const signed = signPjudWebhookPayload(raw, "1765000000");

assert.equal(
  verifyPjudWebhookSignature(
    raw,
    signed.timestamp,
    signed.signature,
    1765000001
  ),
  true
);
assert.equal(
  verifyPjudWebhookSignature(
    `${raw}.tampered`,
    signed.timestamp,
    signed.signature,
    1765000001
  ),
  false
);
assert.equal(
  verifyPjudWebhookSignature(
    raw,
    signed.timestamp,
    signed.signature,
    1765000400
  ),
  false
);

const parsed = parsePjudWebhookPayload(JSON.parse(raw));
assert.equal(parsed.operationId, "op-1");
assert.equal(parsed.movimientos[0].id, "movement-1");
assert.throws(
  () => parsePjudWebhookPayload({ movimientos: [] }),
  /identificar la causa/
);

if (previousSecret === undefined) delete env.PJUD_WEBHOOK_SECRET;
else env.PJUD_WEBHOOK_SECRET = previousSecret;

console.log("pjud/webhook.test.ts OK");
