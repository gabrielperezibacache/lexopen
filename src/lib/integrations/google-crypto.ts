/**
 * Google OAuth token vault (AES-GCM enc:v2).
 * Legacy enc:v1 XOR is only decrypted for one-shot migration.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

export const GOOGLE_TOKEN_V2_PREFIX = "enc:v2:";
export const GOOGLE_TOKEN_V1_PREFIX = "enc:v1:";

export function encryptGoogleToken(value: string | undefined) {
  const secret = process.env.SESSION_SECRET;
  if (!value || value.startsWith(GOOGLE_TOKEN_V2_PREFIX)) return value;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET requerido para guardar tokens Google");
    }
    return value;
  }
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${GOOGLE_TOKEN_V2_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptGoogleToken(value: string | undefined) {
  const secret = process.env.SESSION_SECRET;
  if (!value) return value;
  if (!secret) {
    return value.startsWith(GOOGLE_TOKEN_V2_PREFIX) ? undefined : value;
  }
  if (value.startsWith(GOOGLE_TOKEN_V1_PREFIX)) {
    try {
      const raw = Buffer.from(value.slice(GOOGLE_TOKEN_V1_PREFIX.length), "base64");
      const key = Buffer.from(secret, "utf8");
      return Buffer.from(
        raw.map((byte, idx) => byte ^ key[idx % key.length])
      ).toString("utf8");
    } catch {
      return undefined;
    }
  }
  if (!value.startsWith(GOOGLE_TOKEN_V2_PREFIX)) {
    // Bare plaintext tokens are not accepted from storage.
    return undefined;
  }
  try {
    const [ivRaw, tagRaw, encryptedRaw] = value
      .slice(GOOGLE_TOKEN_V2_PREFIX.length)
      .split(".");
    const key = createHash("sha256").update(secret).digest();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivRaw, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}

export function isGoogleLegacyToken(value: string | null | undefined) {
  return Boolean(value?.startsWith(GOOGLE_TOKEN_V1_PREFIX));
}
