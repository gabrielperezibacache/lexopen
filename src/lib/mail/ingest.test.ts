import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { persistInboundMessage } from "@/lib/mail/ingest";

async function main() {
  const src = readFileSync(path.join(process.cwd(), "src/lib/mail/ingest.ts"), "utf8");
  assert.equal(src.includes("DEMO_MESSAGES"), false);
  assert.equal(src.includes("persistRawMessage"), false);
  assert.equal(/persistInboundMessage\(\s*user\.id/.test(src), false);
  assert.equal(src.includes("persistInboundMessage(user,"), true);

  const skipped = await persistInboundMessage(
    { id: "user_test", role: "abogado" },
    "account_test",
    {
      externalId: "gmail-own-1",
      subject: "Hola",
      fromAddress: "yo@gmail.com",
      receivedAt: new Date(),
      mime: Buffer.from("From: yo@gmail.com\nSubject: Hola\n\nNo es PJUD\n", "utf8"),
    }
  );
  assert.equal(skipped.skipped, "not_pjud");
  assert.equal(skipped.created, false);

  console.log("mail/ingest.test.ts OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
