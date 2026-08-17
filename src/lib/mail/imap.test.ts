import assert from "node:assert/strict";
import { assertImapHostAllowed } from "@/lib/mail/imap";

assert.throws(() => assertImapHostAllowed("127.0.0.1"), /privada/);
assert.throws(() => assertImapHostAllowed("10.0.0.1"), /privada/);
assert.doesNotThrow(() => assertImapHostAllowed("imap.gmail.com"));

console.log("mail/imap.test.ts OK");
