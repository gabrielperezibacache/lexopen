import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import {
  GOOGLE_TOKEN_V1_PREFIX,
  GOOGLE_TOKEN_V2_PREFIX,
  decryptGoogleToken,
  encryptGoogleToken,
  isGoogleLegacyToken,
} from "@/lib/integrations/google-crypto";

async function main() {
  const prevSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "lexopen-google-token-test-secret";

  const plain = "ya29.test-access-token";
  const sealed = encryptGoogleToken(plain);
  assert.ok(sealed?.startsWith(GOOGLE_TOKEN_V2_PREFIX));
  assert.equal(decryptGoogleToken(sealed), plain);

  const key = Buffer.from(process.env.SESSION_SECRET!, "utf8");
  const plainBuf = Buffer.from(plain, "utf8");
  const xor = Buffer.alloc(plainBuf.length);
  for (let idx = 0; idx < plainBuf.length; idx++) {
    xor[idx] = plainBuf[idx]! ^ key[idx % key.length]!;
  }
  const legacy = `${GOOGLE_TOKEN_V1_PREFIX}${xor.toString("base64")}`;
  assert.equal(isGoogleLegacyToken(legacy), true);
  assert.equal(decryptGoogleToken(legacy), plain);

  assert.equal(decryptGoogleToken("not-encrypted"), undefined);
  assert.equal(
    decryptGoogleToken(
      `${GOOGLE_TOKEN_V2_PREFIX}${randomBytes(4).toString("base64url")}`
    ),
    undefined
  );

  const resealed = encryptGoogleToken(decryptGoogleToken(legacy)!);
  assert.ok(resealed?.startsWith(GOOGLE_TOKEN_V2_PREFIX));
  assert.equal(decryptGoogleToken(resealed), plain);

  if (prevSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = prevSecret;

  console.log("integrations/google-crypto.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
