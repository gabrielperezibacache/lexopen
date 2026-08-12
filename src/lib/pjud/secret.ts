import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const TOKEN_PREFIX = "enc:v2:";

function secretKey() {
  const secret = process.env.SESSION_SECRET || process.env.PJUD_SECRETS_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET requerido para cifrar secretos PJUD/ClaveÚnica");
    }
    return createHash("sha256").update("lexopen-dev-only").digest();
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  if (!value) return value;
  if (value.startsWith(TOKEN_PREFIX)) return value;
  const key = secretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TOKEN_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return undefined;
  if (!value.startsWith(TOKEN_PREFIX)) return value;
  try {
    const [ivRaw, tagRaw, encryptedRaw] = value.slice(TOKEN_PREFIX.length).split(".");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secretKey(),
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

export function maskRut(rut: string | null | undefined) {
  if (!rut) return null;
  const clean = rut.trim();
  if (clean.length < 5) return "***";
  return `${clean.slice(0, 2)}****${clean.slice(-2)}`;
}
