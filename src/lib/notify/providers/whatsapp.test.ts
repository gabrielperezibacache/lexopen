import assert from "node:assert/strict";
import {
  createWhatsAppMetaStub,
  createWhatsAppTwilioStub,
  WHATSAPP_NOT_IMPLEMENTED,
} from "./whatsapp";

async function main() {
  const meta = createWhatsAppMetaStub();
  const twilio = createWhatsAppTwilioStub();
  assert.equal(meta.id, "whatsapp_meta");
  assert.equal(twilio.id, "whatsapp_twilio");

  const health = await meta.health();
  assert.equal(health.ok, false);
  assert.match(health.detail || "", /1\.2/);

  const send = await meta.send(
    { title: "x", text: "y" },
    { kind: "whatsapp", e164: "+56911111111" }
  );
  assert.equal(send.ok, false);
  if (!send.ok) assert.equal(send.error, WHATSAPP_NOT_IMPLEMENTED);

  console.log("notify/providers/whatsapp.test.ts OK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
