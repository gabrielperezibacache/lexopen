import assert from "node:assert/strict";
import { assertImapHostAllowed, sameImapDestination } from "@/lib/mail/imap";

assert.throws(() => assertImapHostAllowed("127.0.0.1"), /privada/);
assert.throws(() => assertImapHostAllowed("10.0.0.1"), /privada/);
assert.throws(() => assertImapHostAllowed("localhost"), /privada/);
assert.doesNotThrow(() => assertImapHostAllowed("imap.gmail.com"));
assert.doesNotThrow(() => assertImapHostAllowed("imap.mail.yahoo.com"));
assert.throws(() => assertImapHostAllowed("outlook.office365.com"), /Microsoft/);
assert.throws(() => assertImapHostAllowed("imap-mail.outlook.com"), /Microsoft/);
assert.throws(() => assertImapHostAllowed("outlook.office365.com."), /Microsoft/);

const saved = { protocol: "imap", email: "Cuenta@example.test", imapHost: "IMAP.example.test.", imapPort: 993, imapTls: true };
const unchanged = { user: "Cuenta@EXAMPLE.test", host: "imap.example.test", port: 993, tls: true };
assert.equal(sameImapDestination(saved, unchanged), true);
assert.equal(sameImapDestination({ ...saved, protocol: "gmail" }, unchanged), false);
for (const changed of [{ user: "cuenta@example.test" }, { host: "other.example.test" }, { port: 143 }, { tls: false }]) {
  assert.equal(sameImapDestination(saved, { ...unchanged, ...changed }), false);
}

console.log("mail/imap.test.ts OK");
