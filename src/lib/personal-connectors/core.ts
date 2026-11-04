import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isStrongSessionSecret } from "@/lib/security/production-env";

export class ConnectorError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = "ConnectorError"; }
}
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export function constantEqual(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
export function encryptionKey(material = process.env.SESSION_SECRET) {
  if (!isStrongSessionSecret(material)) throw new ConnectorError("encryption_unconfigured", "El Host necesita completar su configuración segura antes de conectar cuentas.", 503);
  return createHash("sha256").update(`lexopen:personal-connectors:v1:${material!.trim()}`).digest();
}
export function seal(value: unknown, context: string, material?: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(material), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `pc:v1:${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
export function unseal<T>(value: string, context: string, material?: string): T {
  try {
    if (!value.startsWith("pc:v1:")) throw new Error();
    const parts = value.slice(6).split(".");
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const [iv, tag, ciphertext] = parts.map(part => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(material), iv);
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as T;
  } catch { throw new ConnectorError("credentials_unreadable", "No se pudo abrir esta autorización. Desconecte y vuelva a conectar la cuenta.", 409); }
}
export const sessionHash = (raw: string) => createHmac("sha256", encryptionKey()).update(raw).digest("hex");
export const accountContext = (ownerId: string, accountId: string) => `linkedin:account:${ownerId}:${accountId}`;
export const attemptContext = (ownerId: string, attemptId: string) => `linkedin:attempt:${ownerId}:${attemptId}`;
export function actualScopes(value: unknown): string[] | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return [...new Set(value.split(/[\s,]+/).filter(scope => /^[a-zA-Z0-9_.:-]{1,120}$/.test(scope)))].sort();
}
export function publicHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.href.length > 2000) return null;
    if (!url.hostname.includes(".") || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname) || url.hostname.endsWith(".local")) return null;
    return url.href;
  } catch { return null; }
}
