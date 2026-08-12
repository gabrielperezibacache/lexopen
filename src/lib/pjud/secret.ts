import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const TOKEN_PREFIX = "enc:v2:";

function secretKey() {
  const secret =
    process.env.PJUD_SECRETS_KEY?.trim() || process.env.SESSION_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PJUD_SECRETS_KEY o SESSION_SECRET requerido para cifrar secretos PJUD/ClaveÚnica"
      );
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
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${TOKEN_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/**
 * Decrypt vault secrets. Strict mode (default for ClaveÚnica) rejects
 * non-enc:v2 payloads so plaintext never silently passes through.
 */
export function decryptSecret(
  value: string | null | undefined,
  opts?: { strict?: boolean }
) {
  if (!value) return undefined;
  const strict = opts?.strict !== false;
  if (!value.startsWith(TOKEN_PREFIX)) {
    if (strict) return undefined;
    return value;
  }
  try {
    const [ivRaw, tagRaw, encryptedRaw] = value
      .slice(TOKEN_PREFIX.length)
      .split(".");
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

export function secretsKeySource(): "pjud" | "session" | "dev" {
  if (process.env.PJUD_SECRETS_KEY?.trim()) return "pjud";
  if (process.env.SESSION_SECRET?.trim()) return "session";
  return "dev";
}
