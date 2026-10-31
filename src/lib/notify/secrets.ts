/**
 * Cifrado de secretos de proveedores y destinos de canal (plan §7.5).
 * Clave: LEXOPEN_SECRETS_KEY (recomendado) o SESSION_SECRET como respaldo.
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";

export const SECRET_PREFIX = "enc:s1:";

function keyMaterials(): string[] {
  const keys = [process.env.LEXOPEN_SECRETS_KEY, process.env.SESSION_SECRET]
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k));
  return [...new Set(keys)];
}

function deriveKey(material: string) {
  return createHash("sha256").update(`lexopen-secrets|${material}`).digest();
}

export function secretsKeyConfigured() {
  return keyMaterials().length > 0;
}

export function encryptSecret(value: string): string {
  const [material] = keyMaterials();
  if (!material) {
    throw new Error("LEXOPEN_SECRETS_KEY o SESSION_SECRET requerido para cifrar secretos");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(material), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/** Returns undefined when the value cannot be decrypted with any configured key. */
export function decryptSecret(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith(SECRET_PREFIX)) return undefined;
  const [ivRaw, tagRaw, dataRaw] = value.slice(SECRET_PREFIX.length).split(".");
  if (!ivRaw || !tagRaw || !dataRaw) return undefined;
  for (const material of keyMaterials()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", deriveKey(material), Buffer.from(ivRaw, "base64url"));
      decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(dataRaw, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // try next key
    }
  }
  return undefined;
}

/** Stable lookup hash for a destination (chat_id, endpoint) without decrypting. */
export function hashDestino(canal: string, destino: string): string {
  const [material] = keyMaterials();
  return createHmac("sha256", deriveKey(material || "lexopen-unkeyed"))
    .update(`${canal}:${destino}`)
    .digest("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 18): string {
  return randomBytes(bytes).toString("base64url");
}

/** Mask secrets in provider error strings before persisting/logging. */
export function redactSecrets(message: string, secrets: Array<string | undefined | null>): string {
  let out = message;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join("[REDACTED]");
  }
  return out.slice(0, 500);
}
