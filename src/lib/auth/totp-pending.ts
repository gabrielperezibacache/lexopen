/**
 * Short-lived signed token after password OK when TOTP is required.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { isStrongSessionSecret } from "@/lib/security/production-env";

export const TOTP_PENDING_COOKIE = "lexopen_totp_pending";
const TTL_MS = 5 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (isStrongSessionSecret(s)) return s!.trim();
  if (process.env.NODE_ENV === "production") return "";
  return s || "lexopen-dev-session-secret-change-me";
}

function hmac(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function mintTotpPendingToken(userId: string) {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyTotpPendingToken(
  token: string | undefined | null
): { userId: string } | null {
  if (!token || !secret()) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  if (!userId || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const payload = `${userId}.${expStr}`;
  const expected = hmac(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { userId };
}
