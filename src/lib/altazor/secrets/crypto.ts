import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { encryptionKey } from "@/lib/personal-connectors/core";

export class SecretError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = "SecretError"; }
}
type Identity = { ownerId: string; id: string; revision: number };
function key(purpose: "encryption" | "receipt", material?: string) {
  try { return createHmac("sha256", encryptionKey(material)).update(`lexopen:altazor-secrets:v1:${purpose}`).digest(); }
  catch { throw new SecretError("secrets_unconfigured", "Complete la configuración segura del Host antes de guardar secretos.", 503); }
}
const context = ({ ownerId, id, revision }: Identity) => Buffer.from(JSON.stringify(["altazor-secret", 1, ownerId, id, revision]));
export function secretsConfigured(material?: string) { try { key("encryption", material); return true; } catch { return false; } }
export function encryptSecret(value: string, identity: Identity, material?: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key("encryption", material), iv);
  cipher.setAAD(context(identity));
  const plaintext = Buffer.from(value, "utf8");
  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return `as:v1:${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
  } finally { plaintext.fill(0); }
}
/** Trusted server use only. Never export this value from a route, model prompt or audit. */
export function decryptSecret(ciphertext: string, identity: Identity, material?: string) {
  const encryption = key("encryption", material);
  try {
    if (!ciphertext.startsWith("as:v1:")) throw new Error();
    const parts = ciphertext.slice(6).split(".");
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const [iv, tag, body] = parts.map(part => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16 || body.length > 16 * 1024) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", encryption, iv);
    decipher.setAAD(context(identity)); decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(plaintext); } finally { plaintext.fill(0); }
  } catch { throw new SecretError("secret_unreadable", "No se pudo abrir este secreto. Sustitúyalo desde Secretos.", 409); }
}
/** A keyed receipt cannot serve as an offline password dictionary. */
export function secretReceipt(ownerId: string, kind: string, input: unknown, material?: string) {
  const ownerKey = createHmac("sha256", key("receipt", material)).update(JSON.stringify([ownerId, kind])).digest();
  return createHmac("sha256", ownerKey).update(JSON.stringify(input)).digest("hex");
}
