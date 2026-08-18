import assert from "node:assert/strict";
import { assertImapHostAllowed } from "@/lib/mail/imap";

assert.throws(() => assertImapHostAllowed("127.0.0.1"), /privada/);
assert.throws(() => assertImapHostAllowed("10.0.0.1"), /privada/);
assert.throws(() => assertImapHostAllowed("localhost"), /privada/);
assert.doesNotThrow(() => assertImapHostAllowed("imap.gmail.com"));
assert.doesNotThrow(() => assertImapHostAllowed("imap.mail.yahoo.com"));
assert.throws(() => assertImapHostAllowed("outlook.office365.com"), /Microsoft/);
assert.throws(() => assertImapHostAllowed("imap-mail.outlook.com"), /Microsoft/);

console.log("mail/imap.test.ts OK");
