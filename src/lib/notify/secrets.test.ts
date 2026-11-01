import assert from "node:assert/strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-notify-1";
process.env.LEXOPEN_SECRETS_KEY = "test-lexopen-secrets-key-notify";

async function main() {
  const {
    encryptSecret,
    decryptSecret,
    hashDestino,
    redactSecrets,
    SECRET_PREFIX,
  } = await import("./secrets");

  const enc = encryptSecret("chat-42");
  assert.ok(enc.startsWith(SECRET_PREFIX));
  assert.equal(decryptSecret(enc), "chat-42");
  assert.equal(decryptSecret("garbage"), undefined);

  const h1 = hashDestino("telegram", "99");
  const h2 = hashDestino("telegram", "99");
  assert.equal(h1, h2);
  assert.notEqual(hashDestino("telegram", "100"), h1);

  assert.equal(
    redactSecrets("token abcdefghij leaked", ["abcdefghij"]),
    "token [REDACTED] leaked"
  );

  console.log("notify/secrets.test.ts OK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
