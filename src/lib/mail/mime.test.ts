import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMimeBuffer } from "@/lib/mail/mime";
import { isArchivableAttachment } from "@/lib/mail/file-to-folders";
import { messageIsFromPjud } from "@/lib/mail/pjud-sender";

async function main() {
  const fixture = readFileSync(
    path.join(process.cwd(), "src/lib/mail/fixtures/pjud-notice.eml")
  );

  const parsed = await parseMimeBuffer(fixture);
  assert.equal(parsed.fromAddress?.toLowerCase().includes("pjud.cl"), true);
  assert.match(parsed.subject, /C-88001-2099/);
  assert.match(parsed.bodyText, /audiencia preparatoria/i);
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0]!.filename, "resolucion-pjud.pdf");
  assert.equal(isArchivableAttachment(parsed.attachments[0]!), true);
  assert.equal(
    messageIsFromPjud({
      fromAddress: parsed.fromAddress,
      replyTo: parsed.replyTo,
    }),
    true
  );

  const gmail = await parseMimeBuffer(
    Buffer.from(
      "From: yo@gmail.com\nSubject: Hola\n\nEsto no es del PJUD\n",
      "utf8"
    )
  );
  assert.equal(messageIsFromPjud({ fromAddress: gmail.fromAddress }), false);

  console.log("mail/mime.test.ts OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
