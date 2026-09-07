/**
 * Short-lived signed token after password OK when TOTP is required.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { isStrongSessionSecret } from "@/lib/security/production-env";

export const TOTP_PENDING_COOKIE = "lexopen_totp_pending";
const TTL_MS = 5 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  return isStrongSessionSecret(s) ? s!.trim() : "";
}

function hmac(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function mintTotpPendingToken(userId: string) {
  const key = secret();
  if (!key) {
    throw new Error("SESSION_SECRET es obligatorio para TOTP");
  }
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${hmac(payload, key)}`;
}

export function verifyTotpPendingToken(
  token: string | undefined | null
): { userId: string } | null {
  const key = secret();
  if (!token || !key) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  if (!userId || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const payload = `${userId}.${expStr}`;
  const expected = hmac(payload, key);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { userId };
}
