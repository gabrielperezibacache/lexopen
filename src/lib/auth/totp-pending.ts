/**
 * Short-lived signed token after password OK when TOTP is required.
 */
import { isStrongSessionSecret } from "@/lib/security/production-env";
import { createHmac, timingSafeEqual } from "crypto";

export const TOTP_PENDING_COOKIE = "lexopen_totp_pending";
const TTL_MS = 5 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  return isStrongSessionSecret(s) ? s!.trim() : "";
}

function hmac(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function mintTotpPendingToken(userId: string, sessionVersion = 0) {
  const key = secret();
  if (!key) {
    throw new Error("SESSION_SECRET es obligatorio para TOTP");
  }
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}.${sessionVersion}`;
  return `${payload}.${hmac(payload, key)}`;
}

export function verifyTotpPendingToken(
  token: string | undefined | null
): { userId: string; sessionVersion: number } | null {
  const key = secret();
  if (!token || !key) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, expStr, versionStr, sig] = parts;
  const sessionVersion = Number(versionStr);
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) return null;
  if (!userId || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const payload = `${userId}.${expStr}.${sessionVersion}`;
  const expected = hmac(payload, key);
  try {
    const a = createHmac("sha256", key).update(sig).digest();
    const b = createHmac("sha256", key).update(expected).digest();
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { userId, sessionVersion };
}
