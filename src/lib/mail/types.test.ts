import assert from "node:assert/strict";
import { publicMailboxAccount } from "@/lib/mail/types";

const leaked = publicMailboxAccount({
  protocol: "imap",
  status: "connected",
  email: "abogado@estudio.cl",
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapTls: true,
  passwordEnc: "enc:v2:super-secret-password",
  oauthRefreshEnc: "enc:v2:refresh-token",
  lastSyncAt: new Date("2026-08-18T12:00:00.000Z"),
  lastError: null,
});

const json = JSON.stringify(leaked);
assert.equal(json.includes("passwordEnc"), false);
assert.equal(json.includes("oauthRefreshEnc"), false);
assert.equal(json.includes("super-secret"), false);
assert.equal(json.includes("refresh-token"), false);
assert.equal(leaked.hasPassword, true);
assert.equal(leaked.hasOauth, true);
assert.equal(leaked.email, "abogado@estudio.cl");
assert.equal("passwordEnc" in leaked, false);

console.log("mail/types.test.ts OK");
